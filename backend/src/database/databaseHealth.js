import pool from "./pool.js";

const checkDatabaseHealth = async () => {
  await pool.query("SELECT 1");
};

export default checkDatabaseHealth;