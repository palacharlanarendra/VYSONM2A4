const express = require("express");
const app = express();
const generateShortCode = require("./shortCode.js");
const { sequelize, UrlShortner, User, RequestLogs } = require("./db.js");
const port = 3000;

const requestLogger = require("./middlewares/requestLogger.js");
const apiKeyAuth = require("./middlewares/apiKeyAuth.js");
const blacklistApiKey = require("./middlewares/blacklistApiKey.js");
const responseTimelogger = require("./middlewares/responseTimelogger.js");
const rateLimitter = require("./middlewares/rateLimitter.js");
const apiKeyRateLimitter = require("./middlewares/apiKeyRateLimitter.js");
const {
  observabilityMiddleware,
  sentryErrorHandler,
} = require("./middlewares/observabilityMiddleware.js");
const { setCache, getCache, deleteCache } = require("./redisClient.js");
// const rateLimitterByPlan = require("./middlewares/rateLimitterByPlan.js");

require("./initialise.js");

app.use(express.json());
app.use(requestLogger);
app.use(responseTimelogger);
// app.use(observabilityMiddleware);
app.use("/v2", apiKeyRateLimitter);
app.use((req, res, next) => {
  const url = req.url;

  // Check if path starts with /v1 or /v2
  if (!url.startsWith("/v1") && !url.startsWith("/v2")) {
    // Redirect request internally to v1
    req.url = `/v1${url}`;
    res.setHeader("X-API-Version", "v1");
  }

  next();
});
// Shorten URL
app.post("/v1/shorten", async (req, res) => {
  const inputUrl = req.body.url;
  const expiryDate = req.body.expiry_date;
  const customCode = req.body.custom_code;
  const password = req.body.password;
  
  if (customCode) {
    const exists = await UrlShortner.findOne({ where: { short_code: customCode } });
    if (exists) return res.status(400).json({ error: "Custom code is already taken!" });
  }
  
  if (!inputUrl || inputUrl.trim() === "") return res.status(400).json({ error: "Input URI cannot be empty!" });
  
  let generatedShortCode = customCode || generateShortCode();
  
  try {
    const newUrl = await UrlShortner.create({
      original_url: inputUrl,
      short_code: generatedShortCode,
      user_id: null,
      expiry_date: expiryDate ? new Date(expiryDate) : null,
      password: password || null,
    });
    return res.status(200).json({ short_code: newUrl.short_code });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      generatedShortCode = generateShortCode();
      const newUrl = await UrlShortner.create({
        original_url: inputUrl,
        short_code: generatedShortCode,
        user_id: null,
        expiry_date: expiryDate ? new Date(expiryDate) : null,
        password: password || null,
      });
      return res.status(200).json({ short_code: newUrl.short_code });
    } else {
      return res.status(500).json({ error: err.message });
    }
  }
});

// Redirect
app.get("/v1/redirect", async (req, res) => {
  const shortCode = req.query.code;
  const password = req.query.password;

  if (!shortCode) return res.status(400).json({ error: "Short code is required!" });

  try {
    const rowData = await UrlShortner.findOne({ where: { short_code: shortCode } });

    if (!rowData) return res.status(404).json({ error: "Short code not found" });

    if (rowData.password && password !== rowData.password) {
      return res.status(401).json({ error: rowData.password ? "Password required or invalid" : null });
    }

    if (rowData.expiry_date && Date.now() > rowData.expiry_date) {
      return res.status(410).json({ error: "Short code is expired!" });
    }

    await rowData.update({ click_count: Number(rowData.click_count) + 1, last_accessed_at: new Date() });
    await setCache(shortCode, { url: rowData.original_url });
    return res.status(200).json({ url: rowData.original_url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/v1/health",rateLimitter, (req, res) => res.status(200).json({ success: "working!" }));

// Forbidden
app.get("/v1/forbidden", (req, res) => res.status(403).json({ error: "Forbidden request" }));

// Update expiry
app.post("/v1/updateExpiryDate/:code", async (req, res) => {
  const expiryDate = req.body.expiry_date;
  const { code } = req.params;

  if (!code) return res.status(400).json({ error: "Short code is not provided" });
  if (!expiryDate) return res.status(400).json({ error: "expiry date is not provided" });

  const rowData = await UrlShortner.findOne({ where: { short_code: code } });
  if (!rowData) return res.status(404).json({ error: "Short code not found" });

  try {
    await UrlShortner.update({ expiry_date: new Date(expiryDate) }, { where: { short_code: code } });
    await setCache(code, { url: rowData.original_url });
    return res.status(200).json({ message: "Expiry date updated successfully", short_code: code, expiry_date: expiryDate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete short code
app.delete("/v1/shorten/:code", async (req, res) => {
  const { code } = req.params;

  if (!code || code.trim() === "") return res.status(400).json({ error: "Short code is required" });

  const UrlShortenData = await UrlShortner.findOne({ where: { short_code: code } });
  if (!UrlShortenData) return res.status(404).json({ error: "Short code not found" });

  try {
    await UrlShortner.update({ isDeleted: true }, { where: { short_code: code } });
    await deleteCache(shortCode);
    return res.status(200).json({ message: "Short code deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk shorten
app.post("/v1/shorten/bulk", async (req, res) => {
  const inputData = req.body.original_data;
  if (!Array.isArray(inputData) || inputData.length === 0) return res.status(400).json({ error: "No input array provided" });

  const results = await Promise.all(
    inputData.map(async (data) => {
      if (!data.url || data.url.trim() === "") return { error: "Input URI cannot be empty!" };
      let generatedShortCode = data.custom_code || generateShortCode();
      try {
        const exists = data.custom_code ? await UrlShortner.findOne({ where: { short_code: data.custom_code } }) : null;
        if (exists) return { error: `Custom code '${data.custom_code}' is already taken!` };

        const newUrl = await UrlShortner.create({
          original_url: data.url,
          short_code: generatedShortCode,
          user_id: null,
          expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
        });
        return { url: data.url, short_code: newUrl.short_code };
      } catch (err) {
        return { error: err.message };
      }
    })
  );

  return res.status(207).json({ results });
});

/**
 * ===========================
 * V2 ENDPOINTS (with apiKeyAuth)
 * ===========================
 */

// Shorten URL
app.post("/v2/shorten", apiKeyAuth, async (req, res) => {
  const inputUrl = req.body.url;
  const expiryDate = req.body.expiry_date;
  const customCode = req.body.custom_code;
  const password = req.body.password;

  if (customCode) {
    const exists = await UrlShortner.findOne({ where: { short_code: customCode } });
    if (exists) return res.status(400).json({ error: "Custom code is already taken!" });
  }

  const userData = res.locals.user;
  if (!userData) return res.status(400).json({ error: "No such user existed!" });
  if (!inputUrl || inputUrl.trim() === "") return res.status(400).json({ error: "Input URI cannot be empty!" });

  let generatedShortCode = customCode || generateShortCode();

  try {
    const newUrl = await UrlShortner.create({
      original_url: inputUrl,
      short_code: generatedShortCode,
      user_id: userData.id,
      expiry_date: expiryDate ? new Date(expiryDate) : null,
      password: password || null,
    });
    return res.status(200).json({ short_code: newUrl.short_code });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      generatedShortCode = generateShortCode();
      const newUrl = await UrlShortner.create({
        original_url: inputUrl,
        short_code: generatedShortCode,
        user_id: userData.id,
        expiry_date: expiryDate ? new Date(expiryDate) : null,
        password: password || null,
      });
      return res.status(200).json({ short_code: newUrl.short_code });
    } else {
      return res.status(500).json({ error: err.message });
    }
  }
});

// const cacheObj = {};
// Redirect
app.get("/v2/redirect", async (req, res) => {
  const shortCode = req.query.code;
  const password = req.query.password;

  if (!shortCode) return res.status(400).json({ error: "Short code is required!" });

  try {
    // ✅ Set the response header correctly
    // res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    // Check cache first
    // if (cacheObj[shortCode]) {
    //   console.log("cache hit");
    //   return res.status(200).json({ url: cacheObj[shortCode] });
    // }
    const cached = await getCache(shortCode);
    if (cached) {
      console.log("cache hit");
      return res.status(200).json(cached);
    }

    const rowData = await UrlShortner.findOne({ where: { short_code: shortCode } });
    if (!rowData) return res.status(404).json({ error: "Short code not found" });

    if (rowData.password && password !== rowData.password) {
      return res.status(401).json({ error: "Password required or invalid" });
    }

    if (rowData.expiry_date && Date.now() > rowData.expiry_date) {
      return res.status(410).json({ error: "Short code is expired!" });
    }

    await rowData.update({ click_count: Number(rowData.click_count) + 1, last_accessed_at: new Date() });
    // cacheObj[shortCode] = rowData.original_url;
    await setCache(shortCode, { url: rowData.original_url });
    return res.status(200).json({ url: rowData.original_url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// List user URLs
app.get("/v2/shortenedUrls", apiKeyAuth, blacklistApiKey, async (req, res) => {
  const userData = res.locals.user;

  const urls = await UrlShortner.findAll({
    where: { user_id: userData.id },
    attributes: [
      "id",
      "original_url",
      "short_code",
      "expiry_date",
      "createdAt",
      "updatedAt",
      "click_count",
    ],
    order: [["createdAt", "DESC"]],
  });

  return res.json({ urls });
});

// Update expiry
app.post("/v2/updateExpiryDate/:code", apiKeyAuth, async (req, res) => {
  const expiryDate = req.body.expiry_date;
  const { code } = req.params;

  const userData = res.locals.user;
  if (!userData) return res.status(400).json({ error: "No such user existed!" });

  if (!code) return res.status(400).json({ error: "Short code is not provided" });
  if (!expiryDate) return res.status(400).json({ error: "expiry date is not provided" });

  const rowData = await UrlShortner.findOne({ where: { short_code: code } });
  if (!rowData) return res.status(404).json({ error: "Short code not found" });

  try {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const ttlInSeconds = Math.floor((expiry - now) / 1000); // in seconds

    // prevent invalid or past dates
    if (ttlInSeconds <= 0)
      return res.status(400).json({ error: "Expiry date must be in the future" });

    await UrlShortner.update({ expiry_date: expiry }, { where: { short_code: code } });

    await setCache(code, { url: rowData.original_url }, ttlInSeconds);
    return res.status(200).json({ message: "Expiry date updated successfully", short_code: code, expiry_date: expiryDate });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete short code
app.delete("/v2/shorten/:code", apiKeyAuth, async (req, res) => {
  const { code } = req.params;
  const userData = res.locals.user;

  if (!userData) return res.status(404).json({ error: "User not found!" });
  if (!code || code.trim() === "") return res.status(400).json({ error: "Short code is required" });

  const UrlShortenData = await UrlShortner.findOne({ where: { short_code: code } });
  if (!UrlShortenData) return res.status(404).json({ error: "Short code not found" });
  if (UrlShortenData.user_id != userData.id) return res.status(400).json({ error: "User cannot delete this URL" });

  try {
    await UrlShortner.update({ isDeleted: true }, { where: { short_code: code } });
    await deleteCache(code);
    return res.status(200).json({ message: "Short code deleted successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Bulk shorten
app.post("/v2/shorten/bulk", apiKeyAuth, blacklistApiKey, async (req, res) => {
  const inputData = req.body.original_data;
  if (!Array.isArray(inputData) || inputData.length === 0) return res.status(400).json({ error: "No input array provided" });

  const userData = res.locals.user;

  const results = await Promise.all(
    inputData.map(async (data) => {
      if (!data.url || data.url.trim() === "") return { error: "Input URI cannot be empty!" };
      if (data.custom_code) {
        const exists = await UrlShortner.findOne({ where: { short_code: data.custom_code } });
        if (exists) return { error: `Custom code '${data.custom_code}' is already taken!` };
      }

      let generatedShortCode = data.custom_code || generateShortCode();

      try {
        const newUrl = await UrlShortner.create({
          original_url: data.url,
          short_code: generatedShortCode,
          user_id: userData.id,
          expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
        });
        return { url: data.url, short_code: newUrl.short_code };
      } catch (err) {
        if (err.name === "SequelizeUniqueConstraintError") {
          generatedShortCode = generateShortCode();
          const newUrl = await UrlShortner.create({
            original_url: data.url,
            short_code: generatedShortCode,
            user_id: userData.id,
            expiry_date: data.expiry_date ? new Date(data.expiry_date) : null,
          });
          return { url: data.url, short_code: newUrl.short_code };
        } else {
          return { error: err.message };
        }
      }
    })
  );

  return res.status(207).json({ results });
});

// Health and forbidden
app.get("/v2/health", (req, res) => res.status(200).json({ success: "working!" }));
app.get("/v2/forbidden", (req, res) => res.status(403).json({ error: "Forbidden request" }));

app.use("/v2", (req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});
app.use(sentryErrorHandler);

app.listen(port, () => console.log(`🚀 App running on port ${port}`));

module.exports = app;
