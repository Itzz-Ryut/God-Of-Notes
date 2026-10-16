import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

const validateUsername = (username) => {
  const details = {};

  if (typeof username !== "string") {
    details.username = "Username is required";
  } else {
    const normalizedUsername = username.trim();

    if (normalizedUsername.length === 0) {
      details.username = "Username is required";
    } else if (normalizedUsername.length > 30) {
      details.username = "Username must be 30 characters or fewer";
    }
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

const validateIdentityColor = (identityColor) => {
  const details = {};

  if (typeof identityColor !== "string") {
    details.identityColor = "Identity color is required";
  } else if (!/^#[0-9A-Fa-f]{6}$/.test(identityColor)) {
    details.identityColor =
      "Identity color must be a valid #RRGGBB color";
  }

  if (Object.keys(details).length > 0) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      details,
    );
  }
};

export {
  validateUsername,
  validateIdentityColor,
};