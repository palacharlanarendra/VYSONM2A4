const redis = require("../redis");
const { User } = require("../db");

const WINDOW_SIZE_IN_SECONDS = 60;
const MAX_REQUESTS = 5;

const rateLimitterByPlan = async (req, res, next) => {
  try {
    const apiKey = req.headers["x-api-key"];
    if (!apiKey) {
      return res.status(400).json({ error: "API key required" });
    }
    const redisKey = `rate_limit:${apiKey}`;

    const user = await User.findOne({ where: { api_key: apiKey } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    if (user.tier === "free") {
      const currentCount = await redis.incr(redisKey);
      if (currentCount > MAX_REQUESTS) {
        return res.status(429).json({
          error: "Too many requests. Please try again after a minute.",
        });
      }
      if (currentCount === 1) {
        await redis.expire(redisKey, WINDOW_SIZE_IN_SECONDS);
      }
    }

    next();
  } catch (error) {
    console.error("Rate limiter error:", error);
    next();
  }
};

module.exports = rateLimitterByPlan;
