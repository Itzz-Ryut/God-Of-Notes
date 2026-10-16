import asyncHandler from "../../middleware/asyncHandler.js";
import * as authorizationService from "./authorization.service.js";

const grantDocumentPermission = asyncHandler(async (req, res) => {
  const result = await authorizationService.grantDocumentPermission(
    req.user.id,
    req.params.documentId,
    req.body.userId,
    req.body.permission,
  );

  res.status(201).json(result);
});

const updateDocumentPermission = asyncHandler(async (req, res) => {
  const result = await authorizationService.updateDocumentPermission(
    req.user.id,
    req.params.documentId,
    req.params.userId,
    req.body.permission,
  );

  res.status(200).json(result);
});

const listDocumentPermissions = asyncHandler(async (req, res) => {
  const result = await authorizationService.listDocumentPermissions(
    req.user.id,
    req.params.documentId,
  );

  res.status(200).json({ permissions: result });
});

const revokeDocumentPermission = asyncHandler(async (req, res) => {
  const result = await authorizationService.revokeDocumentPermission(
    req.user.id,
    req.params.documentId,
    req.params.userId,
  );

  res.status(200).json(result);
});

export {
  grantDocumentPermission,
  updateDocumentPermission,
  revokeDocumentPermission,
  listDocumentPermissions,
};