const axios = require("axios");
const crypto = require("crypto");
const redisService = require("../services/redis.service");

// CryptoPanic API configuration
const CRYPTOPANIC_API_URL = "https://cryptopanic.com/api/v2/posts/";
const CRYPTOPANIC_API_KEY = process.env.CRYPTOPANIC_API_KEY;
const CACHE_TTL = 5 * 60; // 5 minutes cache

// Helper function to generate cache key
const generateCacheKey = (params) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return `news:${crypto.createHash("md5").update(sortedParams).digest("hex")}`;
};

// Get news from CryptoPanic
exports.getNews = async (req, res) => {
  try {
    // Build query parameters
    const params = {
      auth_token: CRYPTOPANIC_API_KEY,
      public: true,
    };

    // Add optional parameters if provided
    if (req.query.filter) {
      params.filter = req.query.filter;
    }
    if (req.query.currencies) {
      params.currencies = req.query.currencies;
    }
    if (req.query.page) {
      params.page = req.query.page;
    }

    // Log the API key and request parameters for debugging
    console.log(
      "Using CryptoPanic API key:",
      CRYPTOPANIC_API_KEY ? "Key is set" : "Key is missing"
    );
    console.log("Request parameters:", JSON.stringify(params));

    // Generate cache key based on the request params
    const cacheKey = generateCacheKey(params);

    // Try to get cached data first
    const cachedData = await redisService.get(cacheKey);
    if (cachedData) {
      console.log("Returning cached news data");
      return res.json(JSON.parse(cachedData));
    }

    // Fetch fresh data from CryptoPanic
    console.log(
      `Fetching fresh news data from CryptoPanic: ${CRYPTOPANIC_API_URL}`
    );

    try {
      const response = await axios.get(CRYPTOPANIC_API_URL, { params });

      // Enrich with images using microlink if results exist
      if (
        response.data &&
        response.data.results &&
        response.data.results.length > 0
      ) {
        const enrichedResults = await Promise.all(
          response.data.results.map(async (newsItem) => {
            try {
              // Try to fetch image URL from microlink
              const microlinkResponse = await axios.get(
                `https://api.microlink.io`,
                {
                  params: { url: newsItem.url },
                }
              );

              // Add image URL if available
              if (
                microlinkResponse.data.data &&
                microlinkResponse.data.data.image &&
                microlinkResponse.data.data.image.url
              ) {
                return {
                  ...newsItem,
                  image_url: microlinkResponse.data.data.image.url,
                };
              }
              return newsItem;
            } catch (error) {
              console.error("Error enriching news with image:", error.message);
              return newsItem;
            }
          })
        );

        // Update the response with enriched results
        response.data.results = enrichedResults;
      }

      // Cache the enriched data
      await redisService.set(
        cacheKey,
        JSON.stringify(response.data),
        CACHE_TTL
      );

      // Return the results
      res.json(response.data);
    } catch (error) {
      console.error(`Error in CryptoPanic API request: ${error.message}`);
      if (error.response) {
        console.error(`Status: ${error.response.status}`);
        console.error(`Data: ${JSON.stringify(error.response.data || {})}`);
        console.error(
          `Headers: ${JSON.stringify(error.response.headers || {})}`
        );
      }

      // Return a more specific error
      res.status(500).json({
        success: false,
        message: "Error fetching news data from external API",
        error: error.message,
        status: error.response ? error.response.status : null,
      });
    }
  } catch (error) {
    console.error("Error in news controller:", error.message);
    res.status(500).json({
      success: false,
      message: "Error fetching news data",
      error: error.message,
    });
  }
};
