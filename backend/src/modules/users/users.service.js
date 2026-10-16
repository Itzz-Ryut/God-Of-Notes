import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import {
  usernameExists,
  updateUsername,
  updateIdentityColor,
  findUserByUsername,
  deleteUserById,
} from "./users.repository.js";

import { toPublicUser, toLookupUser } from "./mapper.js";
import { 
  validateUsername,
  validateIdentityColor,
 } from "./users.validation.js";

import withTransaction from "../../database/transaction.js";

import { applyOwnerlessLifecycleWithClient } from "../documents/documents.service.js";
import { findDocumentIdsByOwner } from "../documents/documents.repository.js";
 

const getCurrentUser = async (user) => {
  return {
    user: toPublicUser(user),
  };
};

const updateCurrentUsername = async (user, username) => {
  validateUsername(username);

  const normalizedUsername = username.trim();

  if (normalizedUsername === user.username) {
    return {
      user: toPublicUser(user),
    };
  }

  const exists = await usernameExists(normalizedUsername);

  if (exists) {
    throw new AppError(
      409,
      ERROR_CODES.USERNAME_ALREADY_EXISTS,
      "This username is already taken",
    );
  }

  const updatedUser = await updateUsername(
    user.id,
    normalizedUsername,
  );

  if (!updatedUser) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "User not found",
    );
  }

  return {
    user: toPublicUser(updatedUser),
  };
};

const updateCurrentIdentityColor = async (user, identityColor) => {
  validateIdentityColor(identityColor);

  if (identityColor === user.identity_color) {
    return {
      user: toPublicUser(user),
    };
  }

  const updatedUser = await updateIdentityColor(
    user.id,
    identityColor,
  );

  if (!updatedUser) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "User not found",
    );
  }

  return {
    user: toPublicUser(updatedUser),
  };
};

const lookupUserByUsername = async (username) => {
  if (typeof username !== "string" || username.trim().length === 0) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Username is required",
    );
  }

  const normalizedUsername = username.trim();

  if (normalizedUsername.length > 30) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      "Username must be 30 characters or fewer",
    );
  }

  const user = await findUserByUsername(normalizedUsername);

  if (!user) {
    throw new AppError(
      404,
      ERROR_CODES.RESOURCE_NOT_FOUND,
      "User not found",
    );
  }

  return {
    user: toLookupUser(user),
  };
};

// 17.8 Phase 4: account deletion — the application operation that removes a
// user's Document ownership.
//
// Atomic invariant: user deletion + ownership removal + ownerless
// classification commit together inside the existing withTransaction pattern.
// The documents.owner_id FK (ON DELETE SET NULL) assigns NULL inside the
// transaction; every owned document is then classified on the SAME client —
// ORPHANED + orphaned_at = NOW() when no ACTIVE workspace association exists,
// otherwise the document survives workspace-managed. No inconsistent
// intermediate state can ever commit. Documents are never deleted here and
// created_by is historical provenance that is never reassigned.
const deleteCurrentUser = async (user) => {
  if (!user || typeof user.id !== "string") {
    throw new AppError(
      401,
      ERROR_CODES.AUTHENTICATION_REQUIRED,
      "Authentication is required",
    );
  }

  return withTransaction(async (client) => {
    // Capture the owner's documents BEFORE the delete: after it commits,
    // no concurrent insert can reference this user (the row lock blocks and
    // then fails the FK), so this set is complete.
    const ownedDocumentIds = await findDocumentIdsByOwner(user.id, client);

    const removed = await deleteUserById(user.id, client);

    if (!removed) {
      throw new AppError(
        404,
        ERROR_CODES.RESOURCE_NOT_FOUND,
        "User not found",
      );
    }

    // OWNER_TRASHED -> ORPHANED when no ACTIVE association; ACTIVE stays
    // ACTIVE only when workspace-managed. All on the transaction client.
    for (const documentId of ownedDocumentIds) {
      await applyOwnerlessLifecycleWithClient(documentId, client);
    }

    return { deleted: true };
  });
};

export {
  getCurrentUser,
  updateCurrentUsername,
  updateCurrentIdentityColor,
  lookupUserByUsername,
  deleteCurrentUser,
};
