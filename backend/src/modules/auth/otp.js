import crypto from "crypto";
import bcrypt from "bcrypt";

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const OTP_SALT_ROUNDS = 12;

const generateOtp = () => {
  const max = 10 ** OTP_LENGTH;

  return crypto
    .randomInt(0, max)
    .toString()
    .padStart(OTP_LENGTH, "0");
};

const hashOtp = async (otp) => {
  return bcrypt.hash(otp, OTP_SALT_ROUNDS);
};

const verifyOtp = async (otp, otpHash) => {
  return bcrypt.compare(otp, otpHash);
};

const getOtpExpiry = () => {
  const expiresAt = new Date();

  expiresAt.setMinutes(
    expiresAt.getMinutes() + OTP_EXPIRY_MINUTES
  );

  return expiresAt;
};

export {
  generateOtp,
  hashOtp,
  verifyOtp,
  getOtpExpiry,
};