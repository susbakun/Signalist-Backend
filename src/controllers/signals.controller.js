const { v4: uuidv4 } = require("uuid");
const redisService = require("../services/redis.service");

// Helper function to get signal by ID
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
      chartImageId,
      publisher,
    } = req.body;

    const newSignal = {
      id: uuidv4(),
      market,
      entry,
      stoploss,
      targets,
      openTime,
      closeTime,
      status,
      date: new Date().getTime(),
      likes: [],
      description,
      chartImageId,
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

    // Logic to update signal status based on cryptoData
    // This would depend on your specific business logic
    // For example, checking if current price has hit targets or stoploss

    // For now, we'll just update the status if provided
    if (cryptoData && cryptoData.length > 0) {
      // Find the crypto that matches the signal's market
      const matchingCrypto = cryptoData.find(
        (crypto) => crypto.uuid === signal.market.uuid
      );

      if (matchingCrypto) {
        const currentPrice = parseFloat(matchingCrypto.price);

        // Check if price hit stoploss
        if (currentPrice <= signal.stoploss) {
          signal.status = "closed";
        }

        // Check if price hit any targets
        signal.targets = signal.targets.map((target) => {
          if (!target.touched && currentPrice >= target.value) {
            return { ...target, touched: true };
          }
          return target;
        });

        // If all targets are touched, close the signal
        if (signal.targets.every((target) => target.touched)) {
          signal.status = "closed";
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
