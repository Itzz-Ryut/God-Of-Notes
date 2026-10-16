const toPublicDocument = (document) => {
  const result = {
    id: document.id,
    title: document.title,
    content: document.content,
    createdBy: document.created_by,
    ownerId: document.owner_id,
    documentState: document.document_state,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
  if (document.access) {
    result.access = document.access;
  }
  return result;
};

// 17.10 Document Listing: public metadata-only mapping. Identical field
// conventions to toPublicDocument, but never exposes the JSONB content —
// collection responses carry metadata only.
const toPublicDocumentSummary = (document) => {
  const result = {
    id: document.id,
    title: document.title,
    createdBy: document.created_by,
    ownerId: document.owner_id,
    documentState: document.document_state,
    createdAt: document.created_at,
    updatedAt: document.updated_at,
  };
  if (document.access) {
    result.access = document.access;
  }
  return result;
};

export { toPublicDocument, toPublicDocumentSummary };