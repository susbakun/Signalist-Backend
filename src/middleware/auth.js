const jwt = require("jsonwebtoken");

/**
 * Authentication middleware that validates JWT tokens from cookies
 */
const auth = (req, res, next) => {
  try {
    // Get token from cookies instead of Authorization header
    const token = req.cookies.authToken;
    console.log(token);

    if (!token) {
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
