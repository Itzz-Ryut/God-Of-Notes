import AppError from "../errors/AppError.js";
import ERROR_CODES from "../errors/errorCodes.js";

const validateUUID = (paramName) => {
  return (req, res, next) => {
    const value = req.params[paramName];

    if (!value) {
      return next();
    }

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidRegex.test(value)) {
      return next(
        new AppError(
          400,
          ERROR_CODES.VALIDATION_ERROR,
          `Invalid ${paramName} format`,
        ),
      );
    }

    next();
  };
};

export default validateUUID;
