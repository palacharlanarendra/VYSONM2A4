const Sentry = require("../sentry.js");

// Middleware to capture request info
const observabilityMiddleware = (req, res, next) => {
  res.on("finish", () => {
    // Only track failed responses
    if (res.statusCode) {
      Sentry.captureMessage(
        `[${req.method}] ${req.originalUrl} -> ${res.statusCode}`,
        "error"
      );
    }
  });
  next();
};

// Error handler to capture uncaught errors
const sentryErrorHandler = (err, req, res, next) => {
  Sentry.captureException(err);
  res.status(err.statusCode).json({ error: err.captureMessage});
};

module.exports = { observabilityMiddleware, sentryErrorHandler };
