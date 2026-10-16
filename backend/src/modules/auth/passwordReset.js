import crypto from "crypto";

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MINUTES = 15;

const generateResetToken = () => {
  return crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
};

const hashResetToken = (token) => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

const getResetTokenExpiry = () => {
  const expiresAt = new Date();

  expiresAt.setMinutes(
    expiresAt.getMinutes() + RESET_TOKEN_EXPIRY_MINUTES
  );

  return expiresAt;
};

export {
  generateResetToken,
  hashResetToken,
  getResetTokenExpiry,
};