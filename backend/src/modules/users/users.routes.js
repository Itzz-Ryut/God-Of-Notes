import { Router } from "express";

import {
  getCurrentUser,
  updateCurrentUsername,
  updateCurrentIdentityColor,
  lookupUser,
  deleteAccount,
} from "./users.controller.js";

import authenticate from "../../middleware/authenticate.js";

const router = Router();

router.get("/me", authenticate, getCurrentUser);

router.patch("/me/username", authenticate, updateCurrentUsername);
router.patch("/me/identity-color", authenticate, updateCurrentIdentityColor);

// 17.8 Phase 4: account deletion fires documents.owner_id ON DELETE SET NULL
// and runs the ownerless lifecycle inside one transaction.
router.delete("/me", authenticate, deleteAccount);

router.get("/lookup", authenticate, lookupUser);

export default router;
