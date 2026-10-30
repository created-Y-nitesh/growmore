const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

let poolConfig = {};

if (process.env.DATABASE_URL) {
  poolConfig = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: false }
  };
} else {
  poolConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'growmore_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
  };
}

// Production pool connection tuning
poolConfig.max = Number(process.env.DB_POOL_MAX || 20);
poolConfig.idleTimeoutMillis = Number(process.env.DB_IDLE_TIMEOUT || 30000);
poolConfig.connectionTimeoutMillis = Number(process.env.DB_CONNECT_TIMEOUT || 5000);

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("[Database] Unexpected pool error on idle client:", err.message);
});

module.exports = pool;
