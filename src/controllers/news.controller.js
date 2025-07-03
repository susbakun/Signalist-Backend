const axios = require("axios");
const crypto = require("crypto");
const redisService = require("../services/redis.service");

const COINDESK_API_URL = "https://data-api.coindesk.com/news/v1/article/list";
const COINDESK_API_KEY = process.env.COINDESK_API_KEY;
const CACHE_TTL = 5 * 60; // 5 minutes cache

// Helper function to generate cache key
const generateCacheKey = (params) => {
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return `news:${crypto.createHash("md5").update(sortedParams).digest("hex")}`;
};

// Transform CoinDesk response to match frontend expectations
const transformCoinDeskData = (coinDeskData) => {
  if (
    !coinDeskData ||
    !coinDeskData.Data ||
    !Array.isArray(coinDeskData.Data)
  ) {
    return {
      success: false,
      message: "Invalid response format from CoinDesk API",
      results: [],
      count: 0,
    };
  }

  const results = coinDeskData.Data.map((article) => ({
    title: article.TITLE || "No Title",
    url: article.URL || "#",
    image_url: article.IMAGE_URL,
    published_at: article.PUBLISHED_ON
      ? new Date(article.PUBLISHED_ON * 1000).toISOString()
      : new Date().toISOString(),
    source: {
      title: article.SOURCE_DATA?.NAME || "CoinDesk",
    },
    // Extract cryptocurrencies from categories if available
    currencies: article.CATEGORY_DATA
      ? article.CATEGORY_DATA.filter(
          (cat) =>
            cat.CATEGORY &&
            cat.CATEGORY.length <= 5 &&
            cat.CATEGORY.toUpperCase() === cat.CATEGORY
        ).map((cat) => ({ code: cat.CATEGORY, title: cat.NAME }))
      : [],
    // Use subtitle or truncated body as description
    description:
      article.SUBTITLE ||
      (article.BODY ? article.BODY.substring(0, 200) + "..." : ""),
    body: article.BODY,
  }));

  return {
    success: true,
    results: results,
    count: results.length,
    next: null,
    previous: null,
  };
};

// Get news from CoinDesk
exports.getNews = async (req, res) => {
  try {
    // Build query parameters for CoinDesk API
    const params = {
      lang: "EN",
      limit: req.query.pageSize || 10,
      api_key: COINDESK_API_KEY,
    };

    // Add source IDs filter if provided
    if (req.query.source_ids) {
      params.source_ids = req.query.source_ids;
    }

    // Add pagination if provided (CoinDesk uses different pagination)
    if (req.query.page && req.query.page > 1) {
      // CoinDesk might use offset-based pagination
      params.offset = (parseInt(req.query.page) - 1) * params.limit;
    }

    // Log the request parameters for debugging
    console.log("Using CoinDesk API");
    console.log("Request parameters:", JSON.stringify(params));

    // Generate cache key based on the request params
    const cacheKey = generateCacheKey(params);

    // Try to get cached data first
    const cachedData = await redisService.get(cacheKey);
    if (cachedData) {
      console.log("Returning cached news data");
      return res.json(JSON.parse(cachedData));
    }

    // Fetch fresh data from CoinDesk
    console.log(`Fetching fresh news data from CoinDesk: ${COINDESK_API_URL}`);

    try {
      const response = await axios.get(COINDESK_API_URL, { params });
      console.log(
        "Raw CoinDesk API response:",
        JSON.stringify(response.data, null, 2)
      );

      // Transform the CoinDesk response to match our expected format
      const transformedData = transformCoinDeskData(response.data);

      // Cache the transformed data
      await redisService.set(
        cacheKey,
        JSON.stringify(transformedData),
        CACHE_TTL
      );

      // Return the results
      res.json(transformedData);
    } catch (error) {
      console.error(`Error in CoinDesk API request: ${error.message}`);
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
        message: "Error fetching news data from CoinDesk API",
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
