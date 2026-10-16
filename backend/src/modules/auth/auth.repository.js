import pool from "../../database/pool.js";
import { usernameExists } from "../users/users.repository.js";

const createPasswordCredential = async (
  {
    userId,
    passwordHash,
  },
  db = pool
) => {
  const result = await db.query(
    `
      INSERT INTO password_credentials (
        user_id,
        password_hash
      )
      VALUES ($1, $2)
      RETURNING
        id,
        user_id,
        created_at,
        updated_at
    `,
    [userId, passwordHash]
  );

  return result.rows[0];
};

const findPasswordCredentialByUserId = async (
  userId,
  db = pool
) => {
  const result = await db.query(
    `
      SELECT
        id,
        user_id,
        password_hash,
        created_at,
        updated_at
      FROM password_credentials
      WHERE user_id = $1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
};

const createPasswordReset = async (
  {
    userId,
    tokenHash,
    expiresAt,
  },
  db = pool
) => {
  const result = await db.query(
    `
      INSERT INTO password_resets (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        user_id,
        expires_at,
        created_at
    `,
    [userId, tokenHash, expiresAt]
  );

  return result.rows[0];
};

const findPasswordResetByTokenHash = async (
  tokenHash,
  db = pool
) => {
  const result = await db.query(
    `
      SELECT
        id,
        user_id,
        token_hash,
        expires_at,
        used_at,
        created_at
      FROM password_resets
      WHERE token_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
};

const updatePasswordCredential = async (
  {
    userId,
    passwordHash,
  },
  db = pool
) => {
  const result = await db.query(
    `
      UPDATE password_credentials
      SET
        password_hash = $1,
        updated_at = NOW()
      WHERE user_id = $2
      RETURNING
        id,
        user_id,
        updated_at
    `,
    [passwordHash, userId]
  );

  return result.rows[0] ?? null;
};

const markPasswordResetUsed = async (
  resetId,
  db = pool
) => {
  const result = await db.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE id = $1
        AND used_at IS NULL
      RETURNING
        id,
        user_id,
        used_at
    `,
    [resetId]
  );

  return result.rows[0] ?? null;
};

const invalidatePreviousPasswordResets = async (
  userId,
  db = pool,
) => {
  await db.query(
    `
      UPDATE password_resets
      SET used_at = NOW()
      WHERE user_id = $1
        AND used_at IS NULL
    `,
    [userId],
  );
};

const createEmailVerification = async (
  {
    userId,
    otpHash,
    expiresAt,
  },
  db = pool
) => {
  const result = await db.query(
    `
      INSERT INTO email_verifications (
        user_id,
        otp_hash,
        expires_at
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        user_id,
        expires_at,
        created_at
    `,
    [userId, otpHash, expiresAt]
  );

  return result.rows[0];
};

const findLatestEmailVerificationByUserId = async (
  userId,
  db = pool
) => {
  const result = await db.query(
    `
      SELECT
        id,
        user_id,
        otp_hash,
        expires_at,
        verified_at,
        created_at
      FROM email_verifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [userId]
  );

  return result.rows[0] ?? null;
};

const markEmailVerificationVerified = async (
  verificationId,
  db = pool
) => {
  const result = await db.query(
    `
      UPDATE email_verifications
      SET verified_at = NOW()
      WHERE id = $1
        AND verified_at IS NULL
      RETURNING
        id,
        user_id,
        verified_at
    `,
    [verificationId]
  );

  return result.rows[0] ?? null;
};

const markUserEmailVerified = async (
  userId,
  db = pool
) => {
  const result = await db.query(
    `
      UPDATE users
      SET
        email_verified = TRUE,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        email_verified,
        updated_at
    `,
    [userId]
  );

  return result.rows[0] ?? null;
};

const invalidatePreviousEmailVerifications = async (
  userId,
  db = pool,
) => {
  await db.query(
    `
      UPDATE email_verifications
      SET verified_at = NOW()
      WHERE user_id = $1
        AND verified_at IS NULL
    `,
    [userId],
  );
};

const findGoogleAccountBySub = async (
  googleSub,
  db = pool
) => {
  const result = await db.query(
    `
      SELECT
        id,
        user_id,
        google_sub,
        google_email,
        display_name,
        avatar_url,
        created_at,
        updated_at
      FROM google_accounts
      WHERE google_sub = $1
    `,
    [googleSub]
  );

  return result.rows[0] ?? null;
};

const createGoogleAccount = async (
  {
    userId,
    googleSub,
    googleEmail,
    displayName,
    avatarUrl,
  },
  db = pool
) => {
  const result = await db.query(
    `
      INSERT INTO google_accounts (
        user_id,
        google_sub,
        google_email,
        display_name,
        avatar_url
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_id,
        google_sub,
        google_email,
        display_name,
        avatar_url,
        created_at,
        updated_at
    `,
    [
      userId,
      googleSub,
      googleEmail,
      displayName,
      avatarUrl,
    ]
  );

  return result.rows[0];
};
export {
  createPasswordCredential,
  findPasswordCredentialByUserId,
  createPasswordReset,
  findPasswordResetByTokenHash,
  updatePasswordCredential,
  markPasswordResetUsed,
  invalidatePreviousPasswordResets,
  createEmailVerification,
  findLatestEmailVerificationByUserId,
  markEmailVerificationVerified,
  markUserEmailVerified,
  invalidatePreviousEmailVerifications,
  findGoogleAccountBySub,
  createGoogleAccount,
};

export{
  findUserByEmail,
  findUserByUsername,
  findUserById,
  createUser,
  usernameExists,
  findUsernamesLike,
} from "../users/users.repository.js"
