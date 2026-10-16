import jwt from "jsonwebtoken";

import env from "../../../config/env.js";
import ERROR_CODES from "../../../errors/errorCodes.js";

import { findUserById } from "../../users/users.repository.js";

// ================================================================
// 19.4 — Realtime authentication (socket handshake).
//
// The actor for a realtime connection is derived EXACTLY as the REST layer
// derives it (authenticate.js): verify the JWT against env.jwtSecret,
// require a string `sub`, load the user, require email verification, and
// expose only a server-derived actor. Client-supplied identity fields
// (userId, role, permission, ownerId, workspaceId) are NEVER read here and
// therefore carry ZERO authority.
//
// This mirrors (does not modify) the frozen authenticate.js logic so the
// realtime and REST paths share the same JWT/session identity contract and
// the same error codes.
// ================================================================

const tokenStatus = (token) => {
  if (typeof token !== "string" || token.length === 0) {
    return { valid: false, code: ERROR_CODES.AUTHENTICATION_REQUIRED };
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return { valid: false, code: ERROR_CODES.TOKEN_EXPIRED };
    }
    return { valid: false, code: ERROR_CODES.INVALID_TOKEN };
  }

  if (typeof payload !== "object" || typeof payload.sub !== "string") {
    return { valid: false, code: ERROR_CODES.INVALID_TOKEN };
  }

  return { valid: true, payload };
};

// Returns { ok: true, actor: { userId, username } } or { ok: false, code }.
// Mirror of authenticate.js control flow: no token -> AUTHENTICATION_REQUIRED,
// expired -> TOKEN_EXPIRED, any other verify/shape/user failure -> INVALID_TOKEN.
const verifyRealtimeToken = async (token) => {
  const status = tokenStatus(token);

  if (!status.valid) {
    return { ok: false, code: status.code };
  }

  const user = await findUserById(status.payload.sub);

  if (!user) {
    return { ok: false, code: ERROR_CODES.INVALID_TOKEN };
  }

  if (!user.email_verified) {
    return { ok: false, code: ERROR_CODES.EMAIL_NOT_VERIFIED };
  }

  return {
    ok: true,
    // 19.8: identity fields are SERVER-DERIVED only (never from the client).
    actor: {
      userId: user.id,
      username: user.username,
      identityColor: user.identity_color,
    },
  };
};

export { verifyRealtimeToken, tokenStatus };