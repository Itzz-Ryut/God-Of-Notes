import asyncHandler from "../../middleware/asyncHandler.js";
import * as documentsService from "./documents.service.js";

// 17.10 Document Listing: thin controller — actor comes solely from
// req.user (authenticate); only page/limit plus the 17.11 search/state
// query params are read. Any spoofed userId/ownerId/workspaceId query
// params are never used as authority and cannot change the listing.
const listDocuments = asyncHandler(async (req, res) => {
  const result = await documentsService.listDocumentsForUser(req.user, {
    page: req.query?.page,
    limit: req.query?.limit,
    search: req.query?.search,
    state: req.query?.state,
  });

  res.status(200).json(result);
});

const createDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.createDocumentForUser(
    req.user,
    {
      title: req.body.title,
      content: req.body.content,
    },
  );

  res.status(201).json(result);
});

// 17.9 Document Copy: creates an independent ACTIVE copy of an ACTIVE
// document for the authenticated actor. The body is never read —
// spoofed ownerId/createdBy/documentState/workspaceId fields are ignored;
// identity comes solely from req.user (populated by authenticate).
const copyDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.copyDocumentForUser(
    req.user,
    req.params.documentId,
  );

  res.status(201).json(result);
});

const getDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.getDocumentForUser(
    req.user,
    req.params.documentId,
  );

  res.status(200).json(result);
});

const updateDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.updateDocumentForUser(
    req.user,
    req.params.documentId,
    {
      title: req.body?.title,
      content: req.body?.content,
    },
  );

  res.status(200).json(result);
});

const trashDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.trashDocumentForUser(
    req.user,
    req.params.documentId,
  );

  res.status(200).json(result);
});

const restoreDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.restoreDocumentForUser(
    req.user,
    req.params.documentId,
  );

  res.status(200).json(result);
});

// 17.8 Phase 4: Workspace OWNER adopts an ORPHANED document into their
// workspace. Only req.body.workspaceId is read; any spoofed ownerId /
// createdBy / actorUserId body fields are ignored — identity comes solely
// from req.user (populated by authenticate).
const adoptDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.adoptOrphanedDocumentForUser(
    req.user,
    req.params.documentId,
    req.body?.workspaceId,
  );

  res.status(200).json(result);
});

// 17.8 Phase 5: explicit owner-only permanent removal of an OWNER_TRASHED
// document. The body is never read — identity comes solely from req.user;
// spoofed ownerId/createdBy/documentState/orphanedAt fields are ignored.
const permanentlyRemoveDocument = asyncHandler(async (req, res) => {
  const result = await documentsService.permanentlyRemoveDocumentForUser(
    req.user,
    req.params.documentId,
  );

  res.status(200).json(result);
});

export {
  listDocuments,
  createDocument,
  copyDocument,
  getDocument,
  updateDocument,
  trashDocument,
  restoreDocument,
  adoptDocument,
  permanentlyRemoveDocument,
};
