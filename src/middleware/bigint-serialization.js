/**
 * Middleware to handle BigInt serialization in JSON responses
 * This prevents "Do not know how to serialize a BigInt" errors
 */

const { convertBigInts } = require("../utils/serialization");

/**
 * Middleware that converts BigInt values to regular numbers before JSON serialization
 */
function bigIntSerializationMiddleware(req, res, next) {
  // Store the original json method
  const originalJson = res.json;

  // Override the json method to handle BigInt serialization
  res.json = function (data) {
    // Convert BigInt values to regular numbers
    const serializedData = convertBigInts(data);

    // Call the original json method with serialized data
    return originalJson.call(this, serializedData);
  };

  next();
}

module.exports = bigIntSerializationMiddleware;
