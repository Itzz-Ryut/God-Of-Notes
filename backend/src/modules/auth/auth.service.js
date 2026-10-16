import withTransaction from "../../database/transaction.js";
import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import { hashPassword, verifyPassword } from "./password.js";

import {
  validateRegistration,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
} from "./auth.validation.js";

import generateAccessToken from "./token.js";

import generateIdentityColor from "../users/identityColor.js"

import { generateOtp, hashOtp, getOtpExpiry, verifyOtp } from "./otp.js";

import {
  findUserByEmail,
  findUserByUsername,
  createUser,
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
} from "./auth.repository.js";

import {
  sendVerificationOtp,
  sendPasswordResetEmail,
} from "./email.service.js";

import { toPublicUser } from "../users/mapper.js";

import {
  generateResetToken,
  hashResetToken,
  getResetTokenExpiry,
} from "./passwordReset.js";

const register = async ({ username, email, password }) => {
  validateRegistration({
    username,
    email,
    password,
  });

  const normalizedUsername = username.trim();
  const normalizedEmail = email.trim().toLowerCase();

  const existingEmail = await findUserByEmail(normalizedEmail);

  if (existingEmail) {
    throw new AppError(
      409,
      ERROR_CODES.EMAIL_ALREADY_EXISTS,
      "An account with this email already exists",
    );
  }

  const existingUsername = await findUserByUsername(normalizedUsername);

  if (existingUsername) {
    throw new AppError(
      409,
      ERROR_CODES.USERNAME_ALREADY_EXISTS,
      "This username is already taken",
    );
  }

  const passwordHash = await hashPassword(password);

  const identityColor = generateIdentityColor();

  const user = await withTransaction(async (client) => {
    const createdUser = await createUser(
      {
        username: normalizedUsername,
        email: normalizedEmail,
        identityColor,
      },
      client,
    );

    await createPasswordCredential(
      {
        userId: createdUser.id,
        passwordHash,
      },
      client,
    );

    return createdUser;
  });

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = getOtpExpiry();

  await createEmailVerification({
    userId: user.id,
    otpHash,
    expiresAt,
  });

  await sendVerificationOtp({
    email: user.email,
    otp,
  });

  return {
    message: "Account created successfully",
    user: toPublicUser(user),
  };
};

const verifyEmail = async ({ email, otp }) => {
  if (typeof email !== "string" || typeof otp !== "string") {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Email and OTP are required",
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!/^\d{6}$/.test(otp)) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "OTP must be a 6-digit code",
    );
  }

  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_VERIFICATION_CODE,
      "Invalid verification code",
    );
  }

  if (user.email_verified) {
    throw new AppError(
      409,
      ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      "Email is already verified",
    );
  }

  const verification = await findLatestEmailVerificationByUserId(user.id);

  if (!verification) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_VERIFICATION_CODE,
      "Invalid verification code",
    );
  }

  if (verification.verified_at) {
    throw new AppError(
      409,
      ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      "Email is already verified",
    );
  }

  if (new Date(verification.expires_at) <= new Date()) {
    throw new AppError(
      400,
      ERROR_CODES.VERIFICATION_CODE_EXPIRED,
      "Invalid or expired verification code",
    );
  }

  const valid = await verifyOtp(otp, verification.otp_hash);

  if (!valid) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_VERIFICATION_CODE,
      "Invalid or expired verification code",
    );
  }

  await withTransaction(async (client) => {
    const verified = await markEmailVerificationVerified(
      verification.id,
      client,
    );

    if (!verified) {
      throw new AppError(
        409,
        ERROR_CODES.EMAIL_VERIFICATION_CONFLICT,
        "Email verification could not be completed",
      );
    }

    await markUserEmailVerified(user.id, client);
  });

  return {
    message: "Email verified successfully",
  };
};

const resendVerification = async ({ email }) => {
  if (typeof email !== "string") {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, "Email is required");
  }

  const normalizedEmail = email.trim().toLowerCase();

  const user = await findUserByEmail(normalizedEmail);

  if (!user) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_VERIFICATION_REQUEST,
      "Unable to process verification request",
    );
  }

  if (user.email_verified) {
    throw new AppError(
      409,
      ERROR_CODES.EMAIL_ALREADY_VERIFIED,
      "Email is already verified",
    );
  }

  const lastVerification = await findLatestEmailVerificationByUserId(user.id);

  if (lastVerification) {
    const RESEND_COOLDOWN_SECONDS = 60;

    const now = Date.now();
    const lastCreatedAt = new Date(lastVerification.created_at).getTime();

    const elapsedSeconds = (now - lastCreatedAt) / 1000;

    if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
      throw new AppError(
        429,
        ERROR_CODES.OTP_RESEND_COOLDOWN,
        "Please wait before requesting another verification code",
      );
    }
  }

  await invalidatePreviousEmailVerifications(user.id);

  const otp = generateOtp();
  const otpHash = await hashOtp(otp);
  const expiresAt = getOtpExpiry();

  await createEmailVerification({
    userId: user.id,
    otpHash,
    expiresAt,
  });

  await sendVerificationOtp({
    email: user.email,
    otp,
  });

  return {
    message: "Verification code sent",
  };
};

const login = async ({ identifier, password }) => {
  validateLogin({
    identifier,
    password,
  });

  const normalizedIdentifier = identifier.trim();

  const user = normalizedIdentifier.includes("@")
    ? await findUserByEmail(normalizedIdentifier.toLowerCase())
    : await findUserByUsername(normalizedIdentifier);

  if (!user) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email/username or password",
    );
  }

  if (!user.email_verified) {
    throw new AppError(
      403,
      "EMAIL_NOT_VERIFIED",
      "Email verification is required before login",
    );
  }

  const passwordCredential = await findPasswordCredentialByUserId(user.id);

  if (!passwordCredential) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email/username or password",
    );
  }

  const validPassword = await verifyPassword(
    password,
    passwordCredential.password_hash,
  );

  if (!validPassword) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email/username or password",
    );
  }

  const accessToken = generateAccessToken(user);

  return {
    user: toPublicUser(user),
    accessToken,
  };
};

const forgotPassword = async ({ email }) => {
  validateForgotPassword({ email });

  const normalizedEmail = email.trim().toLowerCase();

  const user = await findUserByEmail(normalizedEmail);
  
  /*
   *don't reveal whether the account exists.
   */
  if (!user) {
    return {
      message:
        "If an account exists for this email, a password reset link has been sent",
    };
  }

  const passwordCredential =
  await findPasswordCredentialByUserId(user.id);

  if (!passwordCredential) {
  return {
    message:
      "If an account exists for this email, a password reset link has been sent",
    };
  }

  await invalidatePreviousPasswordResets(user.id);

  const resetToken = generateResetToken();
  const tokenHash = hashResetToken(resetToken);
  const expiresAt = getResetTokenExpiry();

  await createPasswordReset({
    userId: user.id,
    tokenHash,
    expiresAt,
  });

  await sendPasswordResetEmail({
    email: user.email,
    resetToken,
  });

  return {
    message:
      "If an account exists for this email, a password reset link has been sent",
  };
};

const resetPassword = async ({ token, password }) => {
  validateResetPassword({
    token,
    password,
  });

  const normalizedToken = token.trim();

  const tokenHash = hashResetToken(normalizedToken);

  const reset = await findPasswordResetByTokenHash(tokenHash);

  if (!reset) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_RESET_TOKEN,
      "Invalid or expired password reset token",
    );
  }

  if (reset.used_at) {
    throw new AppError(
      400,
      ERROR_CODES.RESET_TOKEN_ALREADY_USED,
      "Invalid or expired password reset token",
    );
  }

  if (new Date(reset.expires_at) <= new Date()) {
    throw new AppError(
      400,
      ERROR_CODES.RESET_TOKEN_EXPIRED,
      "Invalid or expired password reset token",
    );
  }

  const passwordHash = await hashPassword(password);

  await withTransaction(async (client) => {
    const updatedCredential = await updatePasswordCredential(
      {
        userId: reset.user_id,
        passwordHash,
      },
      client,
    );

    if (!updatedCredential) {
      throw new AppError(
        500,
        ERROR_CODES.PASSWORD_RESET_FAILED,
        "Password reset could not be completed",
      );
    }

    const usedReset = await markPasswordResetUsed(reset.id, client);

    if (!usedReset) {
      throw new AppError(
        409,
        ERROR_CODES.RESET_TOKEN_ALREADY_USED,
        "Password reset token has already been used",
      );
    }
  });

  return {
    message: "Password reset successfully",
  };
};

export {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};
