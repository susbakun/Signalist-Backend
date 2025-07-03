const jwt = require("jsonwebtoken");

/**
 * Authentication middleware that validates JWT tokens from cookies
 */
const auth = (req, res, next) => {
  console.log("🔍 Auth middleware - Environment:", process.env.NODE_ENV);
  console.log("🔍 Request URL:", req.url);
  console.log("🔍 Request headers host:", req.headers.host);
  console.log("🔍 Request protocol:", req.protocol);
  console.log("🔍 Request secure:", req.secure);
  console.log("🍪 All cookies:", req.cookies);
  console.log("🍪 Raw cookie header:", req.headers.cookie);

  try {
    // Get token from cookies instead of Authorization header
    const token = req.cookies.authToken;

    console.log("🎫 Token value:", token);
    console.log("🎫 Token exists:", !!token);

    if (!token) {
      console.log("❌ No authentication token found");
      return res.status(401).json({
        success: false,
        message: "No authentication token found",
      });
    }

    // Verify the JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Add user info to request object
    req.user = decoded;

    console.log(`User authenticated: ${decoded.id}`);
    next();
  } catch (error) {
    console.error("Auth error:", error.message);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Authentication token has expired",
      });
    }

    return res.status(401).json({
      success: false,
      message: "Authentication failed",
    });
  }
};

module.exports = auth;
