const redis = require("../redis");

const WINDOW_SIZE_IN_SECONDS = 60;
const MAX_REQUESTS = 10;

const rateLimitter = async (req, res, next) => {
    try {
        const ip = req.ip || req.headers["x-forwarded-for"] || req.connection.remoteAddress;
        const redisKey = `rate_limit:${ip}`;
        const currentCount = await redis.incr(redisKey);
        console.log(ip, redisKey, currentCount)
        if(currentCount===1){
            await redis.expire(redisKey, WINDOW_SIZE_IN_SECONDS)
        }

        if(currentCount > MAX_REQUESTS) {
            return res.status(429).json({
                error: "Too many requests. Please try again after a minute."
            })
        }

        next();
    } catch (error) {
        console.error("Rate limiter error:", err);
        next();
    }
}

module.exports = rateLimitter;