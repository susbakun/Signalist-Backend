/**
 * In-memory implementation of Redis service for development/testing
 */
class RedisMemoryService {
  constructor() {
    this.store = {};
    console.log("Using in-memory Redis service for development");
  }

  async get(key) {
    try {
      return this.store[key] || null;
    } catch (error) {
      console.error(`Error getting data for key ${key}:`, error);
      throw error;
    }
  }

  async set(key, value, expiry = null) {
    try {
      this.store[key] = value;

      // Handle expiry if needed in a real implementation
      if (expiry) {
        setTimeout(() => {
          delete this.store[key];
        }, expiry * 1000);
      }

      return true;
    } catch (error) {
      console.error(`Error setting data for key ${key}:`, error);
      throw error;
    }
  }

  async delete(key) {
    try {
      if (this.store[key]) {
        delete this.store[key];
        return 1;
      }
      return 0;
    } catch (error) {
      console.error(`Error deleting data for key ${key}:`, error);
      throw error;
    }
  }

  async exists(key) {
    try {
      return this.store[key] ? 1 : 0;
    } catch (error) {
      console.error(`Error checking existence for key ${key}:`, error);
      throw error;
    }
  }

  async disconnect() {
    // No actual connection to close
    console.log("In-memory Redis service disconnected");
    return true;
  }
}

// Create and export a singleton instance
const redisMemoryService = new RedisMemoryService();
module.exports = redisMemoryService;
