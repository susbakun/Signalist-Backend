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

      console.log(`Connecting to Redis with URL: ${redisUrl}`);
      this.client = new Redis(redisUrl);
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
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error getting data for key ${key}:`, error);
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
        await this.client.set(key, stringValue);
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
