const redis = require("../redis");

const WINDOW_SIZE_IN_SECONDS = 1;

// Define rate limits per endpoint
const ENDPOINT_LIMITS = {
  "/shorten": 10,
  "/redirect": 50,
};

const apiKeyRateLimiter = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ error: "API key required" });
    }

    const endpoint = req.path;
    const maxRequests = ENDPOINT_LIMITS[endpoint] || 10;

    const redisKey = `rate_limit:${apiKey}:${endpoint}`;
    const currentCount = await redis.incr(redisKey);

    if (currentCount === 1) {
      await redis.expire(redisKey, WINDOW_SIZE_IN_SECONDS);
    }

    if (currentCount > maxRequests) {
      return res.status(429).json({
        error: `Too many requests for ${endpoint}. Try again after ${WINDOW_SIZE_IN_SECONDS} second.`,
      });
    }

    next();
  } catch (err) {
    console.error("Rate limiter error:", err);
    next();
  }
};

module.exports = apiKeyRateLimiter;
