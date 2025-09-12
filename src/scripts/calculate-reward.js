const ccxt = require("ccxt");

/**
 * Fetch OHLCV data between two ISO8601 times.
 * Returns candles as arrays: [timestamp, open, high, low, close, volume]
 */
async function getData(
  exchangeId,
  market,
  timeframe,
  startTimeIso,
  endTimeIso
) {
  // Allow a single exchange id or a prioritized list for fallback
  const exchangesToTry = Array.isArray(exchangeId) ? exchangeId : [exchangeId];

  // Helper to build exchange instance with sane defaults
  const build = (id) => {
    const ExchangeClass = ccxt[id];
    if (!ExchangeClass) return null;
    const ex = new ExchangeClass({
      enableRateLimit: true,
      timeout: 30000,
    });
    try {
      ex.options = { ...(ex.options || {}), defaultType: "spot" };
    } catch (_) {}
    return ex;
  };

  // Use first valid exchange to parse timestamps
  let parser = null;
  for (const id of exchangesToTry) {
    parser = build(id);
    if (parser) break;
  }
  if (!parser) throw new Error(`Unsupported exchangeId(s): ${exchangesToTry}`);

  const startMs = parser.parse8601(startTimeIso);
  const endMs = parser.parse8601(endTimeIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error("Invalid startTime or endTime - must be ISO8601 strings");
  }

  const tfMs =
    parser.parseTimeframe && parser.parseTimeframe(timeframe)
      ? parser.parseTimeframe(timeframe) * 1000
      : 60_000;

  let lastError = null;
  for (const id of exchangesToTry) {
    const ex = build(id);
    if (!ex) continue;
    let since = Math.floor(startMs / tfMs) * tfMs;
    const all = [];
    try {
      try {
        await ex.loadMarkets();
      } catch (_) {}
      while (since < endMs) {
        let batch = await ex.fetchOHLCV(market, timeframe, since, 1000);
        if (!batch || batch.length === 0) break;
        all.push(...batch);
        const lastTs = batch[batch.length - 1][0];
        since = lastTs === since ? since + 1 : lastTs + 1;
      }
      if (all.length) {
        return { candles: all, startMs };
      }
    } catch (e) {
      lastError = e;
      // Try next exchange
    }
  }

  throw new Error(
    `Failed to fetch OHLCV from exchanges [${exchangesToTry.join(", ")}] - last error: ${lastError?.message || lastError}`
  );
}

/**
 * Calculate reward based on entry, stop loss, and targets.
 * Mirrors the original Python logic with safe time handling.
 */
function rewarding(candles, entryPoint, stopLoss, targets, startMs) {
  let exitedByStop = false;
  let exitTimeMs = null;
  const rewardBase = 1;
  const timeCost = 0.99999999;
  const targetCost = 0.99;

  // Normalize targets to a list of numbers and keep their original index
  const normalizedTargets = targets.map((t, idx) => ({
    value: Number(t),
    index: idx,
    touched: false,
    timestamp: null,
  }));

  const hoursBetween = (t1, t0) =>
    Math.abs(Number(t1) - Number(t0)) / 3_600_000;

  // Iterate candles until entry is reached
  for (const c of candles) {
    const ts = c[0];
    const high = c[2];
    const low = c[3];

    if (high >= entryPoint) {
      // Stop loss check
      if (low <= stopLoss) {
        exitedByStop = true;
        exitTimeMs = ts;
        break;
      }

      // Check targets
      for (const tgt of normalizedTargets) {
        if (!tgt.touched && high >= tgt.value) {
          tgt.touched = true;
          tgt.timestamp = ts;
        }
      }
    } else {
      // Original code returns 0 immediately if entry not touched on this bar
      return 0;
    }
  }

  // Find the highest index target that was touched
  const touchedTargets = normalizedTargets.filter((t) => t.touched);
  const maxTouched = touchedTargets.length
    ? touchedTargets.reduce((acc, cur) => (cur.index > acc.index ? cur : acc))
    : null;

  if (exitedByStop && !maxTouched) {
    const hours = hoursBetween(exitTimeMs, startMs);
    const penalty = ((stopLoss - entryPoint) / entryPoint) * timeCost ** hours;
    return -penalty * rewardBase;
  }

  if (!maxTouched) {
    return 0;
  }

  const maxTargetValue = maxTouched.value;
  const maxTargetTime = maxTouched.timestamp;
  const maxHours = hoursBetween(maxTargetTime, startMs);

  const maxTouchedReward =
    ((maxTargetValue - entryPoint) / entryPoint) *
    timeCost ** maxHours *
    targetCost ** maxTouched.index;

  // Average reward for touched targets
  let touchedSum = 0;
  let touchedCount = 0;
  for (const tgt of normalizedTargets) {
    if (tgt.touched) {
      const hours = hoursBetween(tgt.timestamp, startMs);
      touchedSum +=
        ((tgt.value - entryPoint) / entryPoint) *
        timeCost ** hours *
        targetCost ** tgt.index;
      touchedCount += 1;
    }
  }
  const rewardPerTouched = touchedCount ? touchedSum / touchedCount : 0;

  // Average penalty for not touched targets (use max target time for decay as a proxy)
  let notTouchedSum = 0;
  let notTouchedCount = 0;
  for (const tgt of normalizedTargets) {
    if (!tgt.touched) {
      const hours = maxTargetTime ? hoursBetween(maxTargetTime, startMs) : 0;
      notTouchedSum -=
        ((tgt.value - maxTargetValue) / maxTargetValue) *
        timeCost ** hours *
        targetCost ** tgt.index;
      notTouchedCount += 1;
    }
  }
  const rewardPerNotTouched = notTouchedCount
    ? notTouchedSum / notTouchedCount
    : 0;

  const reward = maxTouchedReward + rewardPerTouched + rewardPerNotTouched;
  return reward * rewardBase;
}

/**
 * High-level function to fetch data and compute reward
 */
async function calculateReward(params) {
  const {
    exchangeId = ["kucoin", "gateio", "mexc", "binance"],
    market,
    timeframe = "1m",
    startTime,
    endTime,
    entryPoint,
    stopLoss,
    targets,
  } = params;

  if (!market) throw new Error("market is required (e.g., 'BTC/USDT')");
  if (!startTime || !endTime)
    throw new Error("startTime and endTime are required (ISO8601)");
  if (entryPoint === undefined || stopLoss === undefined)
    throw new Error("entryPoint and stopLoss are required");
  if (!Array.isArray(targets) || targets.length === 0)
    throw new Error("targets must be a non-empty array of numbers");

  const { candles, startMs } = await getData(
    exchangeId,
    market,
    timeframe,
    startTime,
    endTime
  );
  const reward = rewarding(
    candles,
    Number(entryPoint),
    Number(stopLoss),
    targets.map(Number),
    startMs
  );
  return reward;
}

module.exports = {
  getData,
  rewarding,
  calculateReward,
};
