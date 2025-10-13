require("dotenv").config();
const { Sequelize, DataTypes } = require("sequelize");
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: "postgres",
    dialectOptions: {
      ssl: { require: true, rejectUnauthorized: false },
    },
    logging: false,
  });
} else {
  sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "./sqlite.db",
    logging: false,
  });
}

const UrlShortner = sequelize.define(
  "UrlShortner",
  {
    original_url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    short_code: {
      type: DataTypes.STRING(6),
      allowNull: false,
      unique: true,
    },
    click_count: {
      type: DataTypes.STRING,
      default: 0,
    },
    last_accessed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    expiry_date: {
      type: DataTypes.DATE,
      optional: true,
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      default: false,
    },
  },
  {
    tableName: "url_shortner",
    timestamps: true,
  }
);

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      optional: true,
    },
    api_key: {
      type: DataTypes.STRING,
      unique: true,
    },
    tier: {
      type: DataTypes.STRING,
      default: "hobby",
    },
  },
  {
    tableName: "user",
    timestamps: true,
  }
);

UrlShortner.belongsTo(User, { foreignKey: "user_id" });

const RequestLogs = sequelize.define(
  "RequestLogs",
  {
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    method: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    userAgent: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    ip: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "request_logs",
    timestamps: false,
  }
);
module.exports = { sequelize, UrlShortner, User, RequestLogs };
