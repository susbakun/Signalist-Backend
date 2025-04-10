const { v4: uuidv4 } = require("uuid");
const redisService = require("../services/redis.service");
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
  const signal = await redisService.get(`signal:${signalId}`);
  return signal ? JSON.parse(signal) : null;
}

// Get all signals
exports.getSignals = async (req, res) => {
  try {
    const signalKeys = await redisService.keys("signal:*");
    const signals = await Promise.all(
      signalKeys.map(async (key) => {
        const signal = await redisService.get(key);
        return JSON.parse(signal);
      })
    );
    res.json({ data: signals });
  } catch (error) {
    console.error("Error fetching signals:", error);
    res.status(500).json({ message: "Error fetching signals" });
  }
};

// Get a single signal by ID
exports.getSignalById = async (req, res) => {
  try {
    const signal = await getSignalFromRedis(req.params.id);
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

    const newSignal = {
      id: uuidv4(),
      market,
      entry: parsedEntry,
      stoploss: parsedStoploss,
      targets: parsedTargets,
      openTime,
      closeTime,
      status,
      date: new Date().getTime(),
      likes: [],
      description,
      chartImageHref,
      isPremium,
      publisher,
    };

    await redisService.set(`signal:${newSignal.id}`, JSON.stringify(newSignal));
    res.status(201).json({ data: newSignal });
  } catch (error) {
    console.error("Error creating signal:", error);
    res.status(500).json({ message: "Error creating signal" });
  }
};

// Update signal status
exports.updateSignalStatus = async (req, res) => {
  try {
    const signal = await getSignalFromRedis(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const { cryptoData } = req.body;
    const currentTime = new Date().getTime();

    // Handle time-based status transitions
    if (
      signal.status === "not_opened" &&
      currentTime - signal.openTime >= -1000
    ) {
      signal.status = "open";
    }

    // Handle price-based status transitions and target updates
    if (signal.status === "open" && currentTime - signal.closeTime >= -1000) {
      signal.status = "closed";

      if (cryptoData && cryptoData.length > 0) {
        // Parse market name to match with crypto symbol (e.g., "BTC/USDT" -> "BTC")
        const marketName = signal.market.name.split("/")[0];

        // Find the crypto that matches the signal's market
        const matchingCrypto = cryptoData.find(
          (crypto) => crypto.symbol === marketName
        );

        if (matchingCrypto) {
          // Ensure price is parsed with fixed precision
          const currentPrice = parseFloat(
            parseFloat(matchingCrypto.price).toFixed(8)
          );
          let score = 0;

          // Check if price hit any targets and update publisher score
          signal.targets = signal.targets.map((target) => {
            // Ensure target value has fixed precision for comparison
            const targetValue = parseFloat(parseFloat(target.value).toFixed(8));

            // Determine if this is an upward or downward target
            // If target value is greater than entry, it's an upward target (hit when price rises)
            // If target value is less than entry, it's a downward target (hit when price falls)
            const isUpwardTarget = targetValue > signal.entry;

            // For upward targets, check if price has risen above target
            // For downward targets, check if price has fallen below target
            const isTargetHit = isUpwardTarget
              ? currentPrice >= targetValue // Upward target hit when price rises above target
              : currentPrice <= targetValue; // Downward target hit when price falls below target

            if (!target.touched && isTargetHit) {
              score += 1;
              return { ...target, touched: true, value: targetValue };
            }
            return { ...target, value: targetValue };
          });

          // Update publisher score if targets were hit
          if (score > 0) {
            signal.publisher = {
              ...signal.publisher,
              score: signal.publisher.score + score,
            };
          }
        }
      }
    }

    await redisService.set(`signal:${signal.id}`, JSON.stringify(signal));
    res.json({ data: signal });
  } catch (error) {
    console.error("Error updating signal status:", error);
    res.status(500).json({ message: "Error updating signal status" });
  }
};

// Like a signal
exports.likeSignal = async (req, res) => {
  try {
    const signal = await getSignalFromRedis(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const { user } = req.body;
    const userIndex = signal.likes.findIndex(
      (u) => u.username === user.username
    );

    if (userIndex === -1) {
      signal.likes.push(user);
    }

    await redisService.set(`signal:${signal.id}`, JSON.stringify(signal));
    res.json({ data: signal });
  } catch (error) {
    console.error("Error liking signal:", error);
    res.status(500).json({ message: "Error liking signal" });
  }
};

// Dislike a signal (remove like)
exports.dislikeSignal = async (req, res) => {
  try {
    const signal = await getSignalFromRedis(req.params.id);
    if (!signal) {
      return res.status(404).json({ message: "Signal not found" });
    }

    const { user } = req.body;
    signal.likes = signal.likes.filter((u) => u.username !== user.username);

    await redisService.set(`signal:${signal.id}`, JSON.stringify(signal));
    res.json({ data: signal });
  } catch (error) {
    console.error("Error disliking signal:", error);
    res.status(500).json({ message: "Error disliking signal" });
  }
};

// Delete a signal
exports.deleteSignal = async (req, res) => {
  try {
    const exists = await redisService.exists(`signal:${req.params.id}`);
    if (!exists) {
      return res.status(404).json({ message: "Signal not found" });
    }
    await redisService.del(`signal:${req.params.id}`);
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
