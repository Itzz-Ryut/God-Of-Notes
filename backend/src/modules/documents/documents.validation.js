import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

const TITLE_MAX_LENGTH = 255;

// Same UUID format enforced by src/middleware/validateUUID.js
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateCreateDocumentInput = ({ title, content }) => {
  const details = {};

  if (typeof title !== "string") {
    details.title = "Title is required";
  } else {
    const normalizedTitle = title.trim();

    if (normalizedTitle.length === 0) {
      details.title = "Title is required";
    } else if (normalizedTitle.length > TITLE_MAX_LENGTH) {
      details.title = "Title must be 255 characters or fewer";
    }
  }

  if (content === undefined || content === null) {
    details.content = "Content is required";
  } else if (typeof content !== "object" || Array.isArray(content)) {
    details.content = "Content must be a JSON object";
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

const validateUpdateDocumentInput = ({ title, content }) => {
  const details = {};

  if (typeof title !== "string") {
    details.title = "Title is required";
  } else {
    const normalizedTitle = title.trim();

    if (normalizedTitle.length === 0) {
      details.title = "Title is required";
    } else if (normalizedTitle.length > TITLE_MAX_LENGTH) {
      details.title = "Title must be 255 characters or fewer";
    }
  }

  if (content === undefined || content === null) {
    details.content = "Content is required";
  } else if (typeof content !== "object" || Array.isArray(content)) {
    details.content = "Content must be a JSON object";
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

const validateDocumentId = (documentId) => {
  const details = {};

  if (typeof documentId !== "string" || !UUID_REGEX.test(documentId)) {
    details.documentId = "Document id must be a valid UUID";
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

// 17.8 Phase 4: adoption requires an explicit target workspace id.
const validateWorkspaceId = (workspaceId) => {
  const details = {};

  if (typeof workspaceId !== "string" || !UUID_REGEX.test(workspaceId)) {
    details.workspaceId = "Workspace id must be a valid UUID";
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

// 17.11 Search & State: query-parameter validation for GET /api/documents.
// State: only ACTIVE and OWNER_TRASHED are accepted. ORPHANED must never be
// exposed through this collection, so state=ORPHANED is rejected with 400
// VALIDATION_ERROR per the project's validation convention.
const LIST_ALLOWED_STATES = ["ACTIVE", "OWNER_TRASHED"];

const validateListState = (state) => {
  if (state === undefined || state === null || state === "") {
    return null; // no state filter → both ACTIVE + OWNER_TRASHED
  }

  const details = {};

  if (typeof state !== "string" || !LIST_ALLOWED_STATES.includes(state)) {
    details.state = `state must be one of: ${LIST_ALLOWED_STATES.join(", ")}`;
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Request validation failed",
      details,
    );
  }

  return state;
};

export {
  validateCreateDocumentInput,
  validateUpdateDocumentInput,
  validateDocumentId,
  validateWorkspaceId,
  validateListState,
};
