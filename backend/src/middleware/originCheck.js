import AppError from "../errors/AppError.js";
import ERROR_CODES from "../errors/errorCodes.js";

const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

const verifyOrigin = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.get("origin");

  if (!origin) {
    return next();
  }

  if (origin !== process.env.FRONTEND_URL) {
    throw new AppError(
      403,
      ERROR_CODES.INVALID_ORIGIN,
      "Request origin is not allowed",
    );
  }

  next();
};

export default verifyOrigin;