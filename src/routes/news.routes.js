const express = require("express");
const router = express.Router();
const newsController = require("../controllers/news.controller");

// GET /api/news - Fetch crypto news
router.get("/", newsController.getNews);

module.exports = router;
