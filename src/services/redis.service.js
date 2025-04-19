const Redis = require("ioredis");

class RedisService {
  constructor() {
    this.client = null;
    this.useInMemory = false;
    this.inMemoryStore = {};
    this.initialize();
  }

  initialize() {
    try {
      const redisUrl = process.env.REDIS_URL;
      const useInMemory = process.env.USE_IN_MEMORY_REDIS === "true";

      if (useInMemory) {
        this.useInMemory = true;
        console.log("Using in-memory Redis service for development");
        return;
      }

      // Check if Redis is available before attempting connection
      console.log(`Connecting to Redis with URL: ${redisUrl}`);
      this.client = new Redis(redisUrl, {
        // Reduce maxRetriesPerRequest to avoid long timeouts
        maxRetriesPerRequest: 3,
        connectTimeout: 5000, // 5 seconds timeout for initial connection
        retryStrategy: (times) => {
          // After 5 retries, fall back to in-memory
          if (times > 5) {
            console.log(
              "Redis connection failed after 5 retries, falling back to in-memory store"
            );
            this.useInMemory = true;
            return null; // Stop retrying
          }
          const delay = Math.min(times * 100, 2000);
          console.log(
            `Redis connection retry attempt ${times} with delay ${delay}ms`
          );
          return delay;
        },
        reconnectOnError: (err) => {
          console.error("Redis reconnection error:", err.message);
          // If we get a critical error, switch to in-memory mode
          if (
            err.message.includes("ECONNREFUSED") ||
            err.message.includes("Connection timeout") ||
            err.message.includes("ETIMEDOUT")
          ) {
            console.log("Critical Redis error, switching to in-memory mode");
            this.useInMemory = true;
            return false; // Don't auto-reconnect
          }
          return true; // Auto-reconnect for other errors
        },
      });

      // Add event listeners for better error handling
      this.client.on("error", (err) => {
        console.error("Redis client error:", err.message);
        if (
          !this.useInMemory &&
          (err.message.includes("ECONNREFUSED") ||
            err.message.includes("Connection timeout") ||
            err.message.includes("ETIMEDOUT"))
        ) {
          console.log(
            "Switching to in-memory Redis service due to connection error"
          );
          this.useInMemory = true;
        }
      });

      this.client.on("connect", () => {
        console.log("Connected to Redis successfully");
      });

      // Test connection immediately
      this.client
        .ping()
        .then(() => {
          console.log("Redis connection verified with PING");
        })
        .catch((err) => {
          console.error("Redis PING failed:", err.message);
          this.useInMemory = true;
        });

      console.log("Redis service initialized successfully");
    } catch (error) {
      console.error("Redis service initialization error:", error);
      console.log("Falling back to in-memory Redis service");
      this.useInMemory = true;
    }
  }

  async get(key) {
    try {
      if (this.useInMemory) {
        return this.inMemoryStore[key] || null;
      }
      const data = await this.client.get(key);

      if (!data) return null;

      // Try to parse as JSON, if it fails, return the raw string
      try {
        return JSON.parse(data);
      } catch (parseError) {
        console.error(`Error parsing JSON for key ${key}:`, parseError);
        // If this is a message key and the data is corrupted, reset it to an empty array
        if (key.startsWith("message:")) {
          console.log(
            `Resetting corrupted message data for ${key} to empty array`
          );
          await this.set(key, JSON.stringify([]));
          return [];
        }
        return data; // Return the raw string if not a message key
      }
    } catch (error) {
      console.error(`Error getting data for key ${key}:`, error);
      // For message keys, return empty array on error to prevent app crashes
      if (key.startsWith("message:")) {
        return [];
      }
      throw error;
    }
  }

  async set(key, value, expiry = null) {
    try {
      if (this.useInMemory) {
        this.inMemoryStore[key] = value;

        // Handle expiry if needed
        if (expiry) {
          setTimeout(() => {
            delete this.inMemoryStore[key];
          }, expiry * 1000);
        }
        return true;
      }

      const stringValue = JSON.stringify(value);
      if (expiry) {
        await this.client.set(key, stringValue, "EX", expiry);
      } else {
        // By default, set a very long expiry for message data to ensure persistence
        // This prevents message loss due to Redis key expiration
        if (key.startsWith("message:")) {
          await this.client.set(key, stringValue, "EX", 60 * 60 * 24 * 30); // 30 days
        } else {
          await this.client.set(key, stringValue);
        }
      }
      return true;
    } catch (error) {
      console.error(`Error setting data for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key) {
    try {
      if (this.useInMemory) {
        if (this.inMemoryStore[key]) {
          delete this.inMemoryStore[key];
          return 1;
        }
        return 0;
      }
      return await this.client.del(key);
    } catch (error) {
      console.error(`Error deleting data for key ${key}:`, error);
      throw error;
    }
  }

  // Alias for delete to maintain compatibility
  async del(key) {
    return this.delete(key);
  }

  async exists(key) {
    try {
      if (this.useInMemory) {
        return this.inMemoryStore[key] ? 1 : 0;
      }
      return await this.client.exists(key);
    } catch (error) {
      console.error(`Error checking existence for key ${key}:`, error);
      throw error;
    }
  }

  async keys(pattern) {
    try {
      if (this.useInMemory) {
        const keys = Object.keys(this.inMemoryStore);
        return keys.filter((key) => {
          // Simple pattern matching for in-memory implementation
          const regexPattern = pattern.replace(/\*/g, ".*");
          return new RegExp(`^${regexPattern}$`).test(key);
        });
      }
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Error getting keys for pattern ${pattern}:`, error);
      throw error;
    }
  }

  async disconnect() {
    if (this.useInMemory) {
      console.log("In-memory Redis service disconnected");
      return true;
    }
    if (this.client) {
      await this.client.disconnect();
      console.log("Redis client disconnected");
    }
  }
}

// Create and export a singleton instance
const redisService = new RedisService();
module.exports = redisService;
