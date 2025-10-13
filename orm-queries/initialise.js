const { sequelize } = require("./db");

(async () => {
  try {
    await sequelize.sync(); // creates table if not exists
    console.log("✅ Database synced");
  } catch (err) {
    console.error("❌ DB Sync Error:", err);
  }
})();
