const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer();
const signalsController = require("../controllers/signals.controller");
const postsController = require("../controllers/posts.controller");
const usersController = require("../controllers/users.controller");

// Import route modules
const dataRoutes = require("./data.routes");
const postsRoutes = require("./posts.routes");
const signalsRoutes = require("./signals.routes");
const usersRoutes = require("./users.routes");

// Define routes
router.use("/data", dataRoutes);
router.use("/posts", postsRoutes);
router.use("/signals", signalsRoutes);
router.use("/users", usersRoutes);

// Upload routes for different image types
router.post(
  "/upload/signals",
  upload.single("file"),
  signalsController.uploadImage
);
router.post(
  "/upload/posts",
  upload.single("file"),
  postsController.uploadImage
);
router.post(
  "/upload/users",
  upload.single("file"),
  usersController.uploadImage
);

// Legacy route for backward compatibility
router.post("/upload", upload.single("file"), (req, res) => {
  const type = req.query.type || "signals";
  if (type === "posts") {
    return postsController.uploadImage(req, res);
  } else if (type === "users") {
    return usersController.uploadImage(req, res);
  } else {
    return signalsController.uploadImage(req, res);
  }
});

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

module.exports = router;
