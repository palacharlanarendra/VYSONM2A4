const {RequestLogs} = require("../db.js")
const requestLogger = async (req, res, next) => {
  const logData = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.originalUrl,
    userAgent: req.headers["user-agent"] || "Unknown",
    ip: req.ip || req.connection.remoteAddress,
  }; 

  await RequestLogs.create({
    timestamp: logData.timestamp,
    method: logData.method,
    url: logData.url,
    userAgent: logData.userAgent,
    ip: logData.ip,
  });
  next();
};

module.exports = requestLogger;
