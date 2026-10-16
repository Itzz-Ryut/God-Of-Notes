import { Router } from "express";

import authenticate from "../../middleware/authenticate.js";
import validateUUID from "../../middleware/validateUUID.js";

import {
  grantDocumentPermission,
  updateDocumentPermission,
  revokeDocumentPermission,
  listDocumentPermissions,
} from "./authorization.controller.js";

const router = Router();

router.get(
  "/documents/:documentId/permissions",
  validateUUID("documentId"),
  authenticate,
  listDocumentPermissions,
);

router.post(
  "/documents/:documentId/permissions",
  validateUUID("documentId"),
  authenticate,
  grantDocumentPermission,
);

router.patch(
  "/documents/:documentId/permissions/:userId",
  validateUUID("documentId"),
  validateUUID("userId"),
  authenticate,
  updateDocumentPermission,
);

router.delete(
  "/documents/:documentId/permissions/:userId",
  validateUUID("documentId"),
  validateUUID("userId"),
  authenticate,
  revokeDocumentPermission,
);

export default router;