import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

// 18.3 Workspace creation validation — driven by the ACTUAL schema:
//   workspaces.name        varchar(255) NOT NULL  -> required, 1..255 chars
//   workspaces.description text        NULL       -> optional string (or null)
// Ownership/state/ids are NEVER accepted here; they come from req.user.id.
const NAME_MAX_LENGTH = 255;

const validateCreateWorkspaceInput = ({ name, description }) => {
  const details = {};

  if (typeof name !== "string") {
    details.name = "Name is required";
  } else {
    const normalizedName = name.trim();

    if (normalizedName.length === 0) {
      details.name = "Name is required";
    } else if (normalizedName.length > NAME_MAX_LENGTH) {
      details.name = "Name must be 255 characters or fewer";
    }
  }

  // description is nullable in the schema; accept a string, null, or omission.
  if (
    description !== undefined &&
    description !== null &&
    typeof description !== "string"
  ) {
    details.description = "Description must be a string";
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

export { validateCreateWorkspaceInput };