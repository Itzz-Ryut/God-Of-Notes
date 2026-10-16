import { Router } from "express";

import {
  listDocuments,
  createDocument,
  copyDocument,
  getDocument,
  updateDocument,
  trashDocument,
  restoreDocument,
  adoptDocument,
  permanentlyRemoveDocument,
} from "./documents.controller.js";

import authenticate from "../../middleware/authenticate.js";

const router = Router();

// 17.10 Document Listing / 17.11 Search & Filter: collection of documents the
// authenticated actor can access. The actor comes solely from req.user;
// page/limit/search/state are the only query params used. Must be declared
// before "/:documentId".
router.get("/", authenticate, listDocuments);

router.post("/", authenticate, createDocument);

// 17.9 Document Copy: independent copy of an ACTIVE document. The actor
// (new owner) comes solely from req.user; the body is never read.
router.post("/:documentId/copy", authenticate, copyDocument);

router.get("/:documentId", authenticate, getDocument);

router.patch("/:documentId", authenticate, updateDocument);

router.delete("/:documentId", authenticate, trashDocument);

router.post("/:documentId/restore", authenticate, restoreDocument);

// 17.8 Phase 4: Workspace OWNER adoption of an ORPHANED document.
// Body: { workspaceId } (explicit target; never implicit).
router.post("/:documentId/adopt", authenticate, adoptDocument);

// 17.8 Phase 5: explicit owner-only permanent removal of an OWNER_TRASHED
// document. Distinct from DELETE /:documentId (17.7 trash) — this never
// SQL-deletes; the document always survives. Response via toPublicDocument().
router.delete("/:documentId/permanent", authenticate, permanentlyRemoveDocument);

export default router;