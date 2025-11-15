const { v4: uuidv4 } = require("uuid");
const databaseService = require("../services/database.service");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const s3Client = new S3Client({
  region: "default",
  endpoint: process.env.LIARA_ENDPOINT,
  credentials: {
    accessKeyId: process.env.LIARA_BUCKET_ACCESS_KEY,
    secretAccessKey: process.env.LIARA_SECRET_KEY,
  },
});

async function getSignalFromRedis(signalId) {
  const data = await databaseService.get(`signal:${signalId}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

// Get all signals
exports.getSignals = async (req, res) => {
  try {
    // Extract pagination parameters from query
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const publisherUsername = req.query.publisher;
    const publishersCsv = req.query.publishers;
    const publishers =
      typeof publishersCsv === "string" && publishersCsv.length
        ? publishersCsv
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
        : null;
    const market = req.query.market; // e.g., "BTC/USDT"
    const status = req.query.status; // "open" | "closed" | "not_opened"
    const openFrom = req.query.openFrom ? parseInt(req.query.openFrom) : null;
    const openTo = req.query.openTo ? parseInt(req.query.openTo) : null;
    const closeFrom = req.query.closeFrom
      ? parseInt(req.query.closeFrom)
      : null;
    const closeTo = req.query.closeTo ? parseInt(req.query.closeTo) : null;

    // Use the new PostgreSQL database service
    let allSignals = await databaseService.getAllSignals();

    // Optional filter by publisher username or list of usernames
    if (Array.isArray(publishers) && publishers.length > 0) {
      const allow = new Set(publishers);
      allSignals = allSignals.filter(
        (s) => s?.user?.username && allow.has(s.user.username)
      );
    } else if (publisherUsername) {
      allSignals = allSignals.filter(
        (s) => s?.user?.username && s.user.username === publisherUsername
      );
    }

    // Optional market filter
    if (market) {
      allSignals = allSignals.filter((s) => s?.market?.name === market);
    }

    // Optional status filter
    if (status) {
      allSignals = allSignals.filter((s) => s?.status === status);
    }

    // Optional time window filters
    if (openFrom !== null) {
      allSignals = allSignals.filter((s) => Number(s?.openTime) >= openFrom);
    }
    if (openTo !== null) {
      allSignals = allSignals.filter((s) => Number(s?.openTime) <= openTo);
    }
    if (closeFrom !== null) {
      allSignals = allSignals.filter((s) => Number(s?.closeTime) >= closeFrom);
    }
    if (closeTo !== null) {
      allSignals = allSignals.filter((s) => Number(s?.closeTime) <= closeTo);
    }

    // Sort signals by date (newest first)
    // Convert BigInt dates to numbers for sorting
    allSignals.sort((a, b) => Number(b.date) - Number(a.date));

    // Implement pagination
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedSignals = allSignals.slice(startIndex, endIndex);

    // Check if there are more signals available
    const hasMore = endIndex < allSignals.length;

    res.json({
      data: paginatedSignals,
      totalCount: allSignals.length,
      hasMore: hasMore,
    });
  } catch (error) {
    console.error("Error fetching signals:", error);
    res.status(500).json({ message: "Error fetching signals" });
  }
};

// Get top signals by score in a time window (default: last 7 days)
exports.getTopSignals = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 3;
    const since =
      parseInt(req.query.since) || Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Use the new PostgreSQL database service
    const allSignals = await databaseService.getAllSignals();

    const withinWindow = allSignals.filter((s) => Number(s?.date) >= since);
    withinWindow.sort(
      (a, b) =>
        Number(b?.score || 0) - Number(a?.score || 0) ||
        Number(b?.date) - Number(a?.date)
    );

    const top = withinWindow.slice(0, limit);

    res.status(200).json({ data: top });
  } catch (error) {
    console.error("Error fetching top signals:", error);
    res.status(500).json({ message: "Error fetching top signals" });
  }
};

// Get a single signal by ID
exports.getSignalById = async (req, res) => {
  try {
    const signal = await databaseService.getSignal(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }
    res.json({ data: signal });
  } catch (error) {
    console.error("Error fetching signal:", error);
    res.status(500).json({ message: "Error fetching signal" });
  }
};

// Create a new signal
exports.createSignal = async (req, res) => {
  try {
    const {
      market,
      entry,
      stoploss,
      targets,
      openTime,
      closeTime,
      status,
      isPremium,
      description,
      chartImageHref,
      publisher,
    } = req.body;

    // Ensure numeric values are stored with proper precision
    const parsedEntry = parseFloat(parseFloat(entry).toFixed(8));
    const parsedStoploss = parseFloat(parseFloat(stoploss).toFixed(8));

    // Process targets to ensure proper precision
    const parsedTargets = targets.map((target) => ({
      ...target,
      value: parseFloat(parseFloat(target.value).toFixed(8)),
    }));

    // Transform market data to match database schema
    const signalData = {
      marketName: market?.name || market?.marketName || "Unknown",
      marketUuid: market?.uuid || market?.marketUuid || "unknown",
      quoteAsset: market?.quoteAsset || null,
      entry: parsedEntry,
      stoploss: parsedStoploss,
      targets: parsedTargets,
      openTime: openTime,
      closeTime: closeTime,
      date: new Date().getTime(),
      status: status || "not_opened",
      description: description || null,
      chartImageHref: chartImageHref || null,
      isPremium: isPremium || false,
      user: publisher,
      score: 0,
    };

    // Use the new PostgreSQL createSignal method
    const newSignal = await databaseService.createSignal(signalData);
    res.status(201).json({ data: newSignal });
  } catch (error) {
    console.error("Error creating signal:", error);
    res.status(500).json({ message: "Error creating signal" });
  }
};

// Update signal status
exports.updateSignalStatus = async (req, res) => {
  try {
    const signal = await databaseService.getSignal(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const currentTime = new Date().getTime();

    // Convert BigInt timestamps to numbers for comparison
    const openTime = Number(signal.openTime || 0);
    const closeTime = Number(signal.closeTime || 0);

    let statusChanged = false;
    let scoreChanged = false;
    let targetsChanged = false;
    let userScoreChanged = false;

    // Handle time-based status transitions
    if (
      signal.status === "not_opened" &&
      openTime > 0 && // Ensure we have valid timestamps
      currentTime - openTime >= -1000
    ) {
      signal.status = "open";
      statusChanged = true;
    }

    // Handle price-based status transitions and compute reward
    if (
      signal.status === "open" &&
      closeTime > 0 &&
      currentTime - closeTime >= -1000
    ) {
      signal.status = "closed";
      statusChanged = true;

      // Calculate reward and update targets
      try {
        const {
          calculateReward,
          getData,
        } = require("../scripts/calculate-reward");

        const marketName = signal.market?.name || signal.marketName || ""; // e.g., "BTC/USDT"
        const exchangeId = ["kucoin", "gateio", "mexc", "binance"]; // try Iran-friendly first
        const timeframe = "1m"; // default timeframe

        // Ensure we have valid timestamps before creating Date objects
        if (openTime <= 0 || closeTime <= 0) {
          console.warn("Invalid timestamps for signal:", signal.id);
          return;
        }

        const startTime = new Date(openTime).toISOString();
        const endTime = new Date(closeTime).toISOString();
        const entryPoint = signal.entry;
        const stopLoss = signal.stoploss;
        const targets = (signal.targets || []).map((t) => Number(t.value));

        const reward = await calculateReward({
          exchangeId,
          market: marketName,
          timeframe,
          startTime,
          endTime,
          entryPoint,
          stopLoss,
          targets,
        });

        // Update signal score with the calculated reward
        const newScore =
          typeof reward === "number" && Number.isFinite(reward) ? reward : 0;
        if (newScore !== signal.score) {
          signal.score = newScore;
          scoreChanged = true;
        }

        // Fetch OHLCV once to update target touched flags based on price range
        try {
          // Include the candle that starts at closeTime by extending end time by one timeframe
          const endTimeInclusive = new Date(
            closeTime + 60_000 - 1
          ).toISOString();
          const { candles } = await getData(
            exchangeId,
            marketName,
            timeframe,
            startTime,
            endTimeInclusive
          );

          if (Array.isArray(candles) && candles.length > 0) {
            const highs = candles
              .map((c) => Number(c[2]))
              .filter(Number.isFinite);
            const lows = candles
              .map((c) => Number(c[3]))
              .filter(Number.isFinite);

            if (highs.length && lows.length) {
              const maxHigh = Math.max(...highs);
              const minLow = Math.min(...lows);

              // Update targets with touch status
              const updatedTargets = (signal.targets || []).map((t) => {
                const targetValue = Number(t.value);
                const isUpwardTarget = targetValue > entryPoint;
                const touchedByRange = isUpwardTarget
                  ? maxHigh >= targetValue
                  : minLow <= targetValue;
                const newTouched = Boolean(t.touched) || touchedByRange;

                return {
                  ...t,
                  value: Number.isFinite(targetValue)
                    ? parseFloat(targetValue.toFixed(8))
                    : t.value,
                  touched: newTouched,
                };
              });

              // Check if any targets changed
              const hasTargetChanges = updatedTargets.some(
                (target, index) =>
                  target.touched !== signal.targets[index]?.touched
              );

              if (hasTargetChanges) {
                signal.targets = updatedTargets;
                targetsChanged = true;
              }
            }
          }
        } catch (targetsError) {
          console.error("Error updating target touched flags:", targetsError);
        }

        // Update user score if signal score changed
        if (scoreChanged && signal.user?.username) {
          try {
            await databaseService.updateUserScore(
              signal.user.username,
              signal.score
            );
            userScoreChanged = true;
          } catch (userError) {
            console.error("Error updating user score:", userError);
          }
        }
      } catch (rewardError) {
        console.error("Error calculating reward:", rewardError);
        // If reward fails, keep signal.score unchanged or set to 0
        if (signal.score === undefined) {
          signal.score = 0;
          scoreChanged = true;
        }
      }
    }

    // Only update the database if something actually changed
    if (statusChanged || scoreChanged || targetsChanged) {
      // Update signal status and score
      if (statusChanged || scoreChanged) {
        await databaseService.updateSignal(signal.id, {
          status: signal.status,
          score: signal.score,
        });
      }

      // Update targets separately if they changed
      if (targetsChanged) {
        await databaseService.updateSignalTargets(signal.id, signal.targets);
      }

      // Get the updated signal with all changes
      const updatedSignal = await databaseService.getSignal(signal.id);
      res.json({ data: updatedSignal });
    } else {
      // No changes, return current signal
      res.json({ data: signal });
    }
  } catch (error) {
    console.error("Error updating signal status:", error);
    res.status(500).json({ message: "Error updating signal status" });
  }
};

// Like a signal
exports.likeSignal = async (req, res) => {
  try {
    const signal = await databaseService.getSignal(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const { user } = req.body;

    // Find the user by username to get their ID
    const userRecord = await databaseService.prisma.user.findUnique({
      where: { username: user.username },
      select: { id: true },
    });

    if (!userRecord) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already liked
    const isAlreadyLiked = signal.likes.some(
      (like) => like.username === user.username
    );

    if (!isAlreadyLiked) {
      // Add like to database
      await databaseService.prisma.signalLike.create({
        data: {
          signalId: signal.id,
          userId: userRecord.id,
        },
      });
    }

    // Get updated signal
    const updatedSignal = await databaseService.getSignal(req.params.id);
    res.json({ data: updatedSignal });
  } catch (error) {
    console.error("Error liking signal:", error);
    res.status(500).json({ message: "Error liking signal" });
  }
};

// Dislike a signal (remove like)
exports.dislikeSignal = async (req, res) => {
  try {
    const signal = await databaseService.getSignal(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const { user } = req.body;

    // Find the user by username to get their ID
    const userRecord = await databaseService.prisma.user.findUnique({
      where: { username: user.username },
      select: { id: true },
    });

    if (!userRecord) {
      return res.status(404).json({ message: "User not found" });
    }

    // Remove like from database
    await databaseService.prisma.signalLike.deleteMany({
      where: {
        signalId: signal.id,
        userId: userRecord.id,
      },
    });

    // Get updated signal
    const updatedSignal = await databaseService.getSignal(req.params.id);
    res.json({ data: updatedSignal });
  } catch (error) {
    console.error("Error disliking signal:", error);
    res.status(500).json({ message: "Error disliking signal" });
  }
};

// Update a signal (edit description and closeTime)
exports.updateSignal = async (req, res) => {
  try {
    const signal = await databaseService.getSignal(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const { description, closeTime, status } = req.body;

    // Update the signal using the database service
    const updatedSignal = await databaseService.updateSignal(signal.id, {
      description,
      closeTime,
      status,
    });

    res.json({ data: updatedSignal });
  } catch (error) {
    console.error("Error updating signal:", error);
    res.status(500).json({ message: "Error updating signal" });
  }
};

// Delete a signal
exports.deleteSignal = async (req, res) => {
  try {
    const signal = await databaseService.getSignal(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    await databaseService.deleteSignal(req.params.id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting signal:", error);
    res.status(500).json({ message: "Error deleting signal" });
  }
};

// Upload image to Liara
exports.uploadImage = async (req, res) => {
  try {
    const file = req.file;
    const params = {
      Bucket: "signals",
      Key: `${uuidv4()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    await s3Client.send(new PutObjectCommand(params));

    const imageUrl = `${process.env.LIARA_ENDPOINT}/signals/${params.Key}`;
    res.status(200).json({ url: imageUrl });
  } catch (error) {
    console.error("Error uploading image:", error);
    res.status(500).json({ message: "Error uploading image" });
  }
};

// Calculate reward based on OHLCV and signal params
exports.calculateReward = async (req, res) => {
  try {
    const {
      exchangeId = "binance",
      market,
      timeframe = "1m",
      startTime,
      endTime,
      entryPoint,
      stopLoss,
      targets,
    } = req.body || {};

    // Lazy-load to avoid adding ccxt to cold paths if unused
    const { calculateReward } = require("../scripts/calculate-reward");

    const reward = await calculateReward({
      exchangeId,
      market,
      timeframe,
      startTime,
      endTime,
      entryPoint,
      stopLoss,
      targets,
    });

    res.status(200).json({ data: { reward } });
  } catch (error) {
    console.error("Error calculating reward:", error);
    res
      .status(400)
      .json({ message: error.message || "Failed to calculate reward" });
  }
};
