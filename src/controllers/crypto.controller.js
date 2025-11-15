const axios = require("axios");

// Get Wallex markets data
const getWallexMarkets = async (req, res) => {
  try {
    console.log("Fetching Wallex markets data...");

    const response = await axios.get(
      "https://api.wallex.ir/hector/web/v1/markets",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
        timeout: 10000, // 10 second timeout
      }
    );

    console.log("Successfully fetched Wallex markets data");

    return res.status(200).json({
      success: true,
      data: response.data,
    });
  } catch (error) {
    console.error("Error fetching Wallex markets:", error.message);

    // Handle different types of errors
    if (error.response) {
      // The request was made and the server responded with a status code
      return res.status(error.response.status).json({
        success: false,
        message: "Failed to fetch Wallex markets data",
        error: error.response.data || error.message,
      });
    } else if (error.request) {
      // The request was made but no response was received
      return res.status(503).json({
        success: false,
        message: "Wallex API is currently unavailable",
        error: "No response received from Wallex API",
      });
    } else {
      // Something happened in setting up the request
      return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message,
      });
    }
  }
};

module.exports = {
  getWallexMarkets,
};
