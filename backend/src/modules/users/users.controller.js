import asyncHandler from "../../middleware/asyncHandler.js";
import * as usersService from "./users.service.js";

const getCurrentUser = asyncHandler(async (req, res) => {
  const result = await usersService.getCurrentUser(req.user);

  res.status(200).json(result);
});

const updateCurrentUsername = asyncHandler(async (req, res) => {
  const result = await usersService.updateCurrentUsername(
    req.user,
    req.body.username,
  );

  res.status(200).json(result);
});

const updateCurrentIdentityColor = asyncHandler(async (req, res) => {
  const result = await usersService.updateCurrentIdentityColor(
    req.user,
    req.body.identityColor,
  );

  res.status(200).json(result);
});

const lookupUser = asyncHandler(async (req, res) => {
  const result = await usersService.lookupUserByUsername(
    req.query.username,
  );

  res.status(200).json(result);
});

// 17.8 Phase 4: removes the authenticated user's account and applies the
// ownerless document lifecycle atomically. No request body is accepted.
const deleteAccount = asyncHandler(async (req, res) => {
  const result = await usersService.deleteCurrentUser(req.user);

  res.status(200).json(result);
});

export {
  getCurrentUser,
  updateCurrentUsername,
  updateCurrentIdentityColor,
  lookupUser,
  deleteAccount,
};