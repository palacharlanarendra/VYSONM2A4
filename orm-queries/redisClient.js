// redisClient.js
const { createClient } = require("redis");

let client;

async function getRedisClient() {
  // Reuse the existing connection if already established
  if (client && client.isOpen) return client;

  client = createClient({
    username: "default",
    password: "OQs6XkTxqlpWa2Fe8I41bvLiC5gdkHSf",
    socket: {
      host: "redis-12511.c266.us-east-1-3.ec2.redns.redis-cloud.com",
      port: 12511,
    },
  });

  client.on("error", (err) => console.error("❌ Redis Client Error:", err));
  client.on("connect", () => console.log("✅ Redis connected successfully"));
  client.on("reconnecting", () => console.log("♻️ Reconnecting to Redis..."));

  await client.connect();
  return client;
}

async function setCache(key, data, ttlInSeconds = 3600) {
  const redis = await getRedisClient();
  await redis.setEx(key, ttlInSeconds, JSON.stringify(data));
}

// Helper to get JSON
async function getCache(key) {
  const redis = await getRedisClient();
  const value = await redis.get(key);
  return value ? JSON.parse(value) : null;
}

async function deleteCache(key) {
  const redis = await getRedisClient();
  const value = await redis.del(key);
  return value ? JSON.parse(value) : null;
}




module.exports = {setCache, getCache, deleteCache};