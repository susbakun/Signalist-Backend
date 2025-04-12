/**
 * Simple authentication middleware.
 * In a real-world app, this would verify token, check user sessions, etc.
 * For this implementation, we'll keep it simple.
 */
const auth = (req, res, next) => {
  // In a real application, you would verify JWT tokens here
  // For simplicity, we're allowing all requests through

  // Extract authorization headers if present
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1]; // Extract token from "Bearer TOKEN"

    // Here you would validate the token
    // For example: jwt.verify(token, process.env.JWT_SECRET);

    // For now, just log that we received a token
    console.log("Auth token received:", token.substring(0, 10) + "...");
  } else {
    // Allow anonymous access for now (in development)
    console.log("No auth token provided, allowing anonymous access");
  }

  // Continue with the request
  next();
};

module.exports = auth;
