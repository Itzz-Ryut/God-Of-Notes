import AppError from "../errors/AppError.js";
import ERROR_CODES from "../errors/errorCodes.js";

const errorHandler = (error, req, res, next) => {
  if (
    error instanceof AppError &&
    error.statusCode === 401 &&
    error.code === ERROR_CODES.AUTHENTICATION_REQUIRED
  ) {
    console.warn("No active session (401 AUTHENTICATION_REQUIRED).");
  } else {
    console.error(error);
  }

  if (error instanceof AppError) {
    const response = {
      error: {
        code: error.code,
        message: error.message,
      },
    };

    if (error.details !== null) {
      response.error.details = error.details;
    }

    return res.status(error.statusCode).json(response);
  }

  return res.status(500).json({
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: "An unexpected error occurred",
    },
  });
};

export default errorHandler;