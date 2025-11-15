const express = require("express");
const router = express.Router();
const databaseService = require("../services/database.service");

// Get all data for a specific key
router.get("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const data = await databaseService.get(key);

    if (!data) {
      return res.status(404).json({
        success: false,
        message: `No data found for key: ${key}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: JSON.parse(data),
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch data",
      error: error.message,
    });
  }
});

// Store data with a specific key
router.post("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;

    if (!value || Object.keys(value).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Request body cannot be empty",
      });
    }

    await databaseService.set(key, value);

    return res.status(201).json({
      success: true,
      message: `Data stored successfully with key: ${key}`,
    });
  } catch (error) {
    console.error("Error storing data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to store data",
      error: error.message,
    });
  }
});

// Update data for a specific key
router.put("/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const value = req.body;

    if (!value || Object.keys(value).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Request body cannot be empty",
      });
    }

    const exists = await databaseService.exists(key);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: `No data found for key: ${key}`,
      });
    }

    await databaseService.set(key, value);

    return res.status(200).json({
      success: true,
      message: `Data updated successfully for key: ${key}`,
    });
  } catch (error) {
    console.error("Error updating data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update data",
      error: error.message,
    });
  }
});

// Delete data for a specific key
router.delete("/:key", async (req, res) => {
  try {
    const { key } = req.params;

    const exists = await databaseService.exists(key);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: `No data found for key: ${key}`,
      });
    }

    await databaseService.delete(key);

    return res.status(200).json({
      success: true,
      message: `Data deleted successfully for key: ${key}`,
    });
  } catch (error) {
    console.error("Error deleting data:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete data",
      error: error.message,
    });
  }
});

module.exports = router;
