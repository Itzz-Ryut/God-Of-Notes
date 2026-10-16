import pool from "../../database/pool.js";

const findUserByEmail = async (email, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        username,
        email,
        email_verified,
        identity_color,
        created_at,
        updated_at
      FROM users
      WHERE email = $1
    `,
    [email],
  );

  return result.rows[0] ?? null;
};

const findUserByUsername = async (username, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        username,
        email,
        email_verified,
        identity_color,
        created_at,
        updated_at
      FROM users
      WHERE username = $1
    `,
    [username],
  );

  return result.rows[0] ?? null;
};

const findUserById = async (userId, db = pool) => {
  const result = await db.query(
    `
      SELECT
        id,
        username,
        email,
        email_verified,
        identity_color,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
    `,
    [userId],
  );

  return result.rows[0] ?? null;
};

const createUser = async (
  { username, email, identityColor, emailVerified = false },
  db = pool,
) => {
  const result = await db.query(
    `
      INSERT INTO users (
        username,
        email,
        identity_color,
        email_verified
      )
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        username,
        email,
        email_verified,
        identity_color,
        created_at,
        updated_at
    `,
    [username, email, identityColor, emailVerified],
  );

  return result.rows[0];
};

const usernameExists = async (username, db = pool) => {
  const result = await db.query(
    `
      SELECT 1
      FROM users
      WHERE username = $1
      LIMIT 1
    `,
    [username],
  );

  return result.rowCount > 0;
};

const findUsernamesLike = async (base, db = pool) => {
  const result = await db.query(
    `
      SELECT username
      FROM users
      WHERE username = $1
         OR username LIKE $1 || '%'
      ORDER BY username
    `,
    [base],
  );

  return result.rows.map((row) => row.username);
};

const updateUsername = async (
  userId,
  username,
  db = pool
) => {
  const result = await db.query(
    `
      UPDATE users
      SET
        username = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        username,
        email,
        email_verified,
        identity_color,
        created_at,
        updated_at
    `,
    [username, userId]
  );

  return result.rows[0] ?? null;
};

const updateIdentityColor = async (
  userId,
  identityColor,
  db = pool,
) => {
  const result = await db.query(
    `
      UPDATE users
      SET
        identity_color = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING
        id,
        username,
        email,
        email_verified,
        identity_color,
        created_at,
        updated_at
    `,
    [identityColor, userId],
  );

  return result.rows[0] ?? null;
};

// 17.8 Phase 4: deletes a user. This is the single application operation that
// causes the documents.owner_id FK (ON DELETE SET NULL) to fire. Must be
// called inside the contract transaction with the lifecycle handling.
const deleteUserById = async (userId, db = pool) => {
  const result = await db.query(
    `DELETE FROM users WHERE id = $1 RETURNING id`,
    [userId],
  );

  return result.rows[0] ?? null;
};

export {
  findUserByEmail,
  findUserByUsername,
  findUserById,
  createUser,
  usernameExists,
  findUsernamesLike,
  updateUsername,
  updateIdentityColor,
  deleteUserById,
};
