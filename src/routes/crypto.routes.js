const express = require("express");
const router = express.Router();
const cryptoController = require("../controllers/crypto.controller");

// GET /api/crypto/wallex/markets - Get Wallex markets data
router.get("/wallex/markets", cryptoController.getWallexMarkets);

module.exports = router;
