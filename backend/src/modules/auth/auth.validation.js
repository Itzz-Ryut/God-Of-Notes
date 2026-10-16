import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

const validateRegistration = ({
  username,
  email,
  password,
}) => {
  const details = {};

  if (
    typeof username !== "string" ||
    username.trim().length < 3 ||
    username.trim().length > 30
  ) {
    details.username =
      "Username must be between 3 and 30 characters";
  }

  if (
    typeof email !== "string" ||
    email.trim().length === 0 ||
    email.trim().length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  ) {
    details.email = "A valid email address is required";
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    details.password =
      "Password must be between 8 and 72 characters";
  }

  if (Object.keys(details).length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      details
    );
  }
};

const validateLogin = ({
  identifier,
  password,
}) => {
  const details = {};

  if (
    typeof identifier !== "string" ||
    identifier.trim().length === 0
  ) {
    details.identifier = "Email or username is required";
  }

  if (
    typeof password !== "string" ||
    password.length === 0
  ) {
    details.password = "Password is required";
  }

  if (Object.keys(details).length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      details
    );
  }
};

const validateForgotPassword = ({
  email,
}) => {
  if (
    typeof email !== "string" ||
    email.trim().length === 0
  ) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Email is required"
    );
  }
};

const validatePassword = (password) => {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_PASSWORD,
      "Password must be between 8 and 72 characters",
    );
  }
};

const validateResetPassword = ({ token, password }) => {
  if (typeof token !== "string" || !token.trim()) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_RESET_TOKEN,
      "Reset token is required",
    );
  }

  validatePassword(password);
};
export {
  validateRegistration,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
};