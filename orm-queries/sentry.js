const Sentry = require("@sentry/node");

// Initialize Sentry
Sentry.init({
  dsn: "https://7a2ae9e5c878cfae3ae7d8049bfefbd2@o4509996504645632.ingest.us.sentry.io/4509996505825280",
  tracesSampleRate: 1.0,
});

module.exports = Sentry;
