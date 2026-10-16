import jwt from "jsonwebtoken";

import env from "../config/env.js";
import AppError from "../errors/AppError.js";
import ERROR_CODES from "../errors/errorCodes.js";

import { findUserById } from "../modules/users/users.repository.js";

const authenticate = async (req, res, next) => {
  try {
    
    const cookieToken = req.cookies?.access_token;

    const authorization = req.headers.authorization;

    const headerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : null;

    const token = cookieToken || headerToken;

    if (!token) {
      throw new AppError(
        401,
        ERROR_CODES.AUTHENTICATION_REQUIRED,
        "Authentication is required",
      );
    }

    let payload;

    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        throw new AppError(
          401,
          ERROR_CODES.TOKEN_EXPIRED,
          "Authentication token has expired",
        );
      }

      throw new AppError(
        401,
        ERROR_CODES.INVALID_TOKEN,
        "Invalid authentication token",
      );
    }

    if (typeof payload !== "object" || typeof payload.sub !== "string") {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_TOKEN,
        "Invalid authentication token",
      );
    }

    const user = await findUserById(payload.sub);

    if (!user) {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_TOKEN,
        "Invalid authentication token",
      );
    }

    if (!user.email_verified) {
      throw new AppError(
        403,
        ERROR_CODES.EMAIL_NOT_VERIFIED,
        "Email verification is required",
      );
    }

    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
};

export default authenticate;
