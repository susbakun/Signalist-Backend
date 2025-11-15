/**
 * Utility functions for handling BigInt serialization in JSON responses
 */

/**
 * Recursively converts BigInt values to regular numbers in an object
 * @param {any} obj - The object to process
 * @returns {any} - The object with BigInt values converted to numbers
 */
function convertBigInts(obj) {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return Number(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map(convertBigInts);
  }

  if (typeof obj === "object") {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertBigInts(value);
    }
    return converted;
  }

  return obj;
}

/**
 * Safely serializes an object to JSON by converting BigInt values
 * @param {any} obj - The object to serialize
 * @returns {string} - The JSON string
 */
function safeStringify(obj) {
  const converted = convertBigInts(obj);
  return JSON.stringify(converted);
}

module.exports = {
  convertBigInts,
  safeStringify,
};
