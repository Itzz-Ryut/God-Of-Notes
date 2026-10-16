import { api } from '../../lib/api/client.js'

/**
 * Documents API functions (F4.1).
 *
 * Every endpoint here mirrors the backend `/api/documents` routes exactly:
 *   - see backend/src/modules/documents/documents.routes.js
 *
 * Cookie-based authentication: the browser attaches the HttpOnly
 * access-token cookie automatically via `credentials: "include"`.
 *
 * Backend contract (source of truth):
 *   GET /api/documents
 *     200 { documents: [{ id, title, createdBy, ownerId, documentState,
 *                         createdAt, updatedAt,
 *                         access: { permission, source } }, ...] }
 *     — metadata only; the collection never includes content.
 *     401 AUTHENTICATION_REQUIRED | TOKEN_EXPIRED | INVALID_TOKEN
 *
 *   GET /api/documents/:documentId
 *     200 { document: { id, title, content, createdBy, ownerId,
 *                       documentState, createdAt, updatedAt,
 *                       access: { permission, source } } }
 *     400 VALIDATION_ERROR (non-UUID id)
 *     401 AUTHENTICATION_REQUIRED | TOKEN_EXPIRED | INVALID_TOKEN
 *     403 FORBIDDEN (no access)
 *     404 RESOURCE_NOT_FOUND
 */
export const documentsApi = {
  /**
   * List documents the authenticated actor can access, with the F4.2 query
   * capabilities the backend actually supports (documents.service.js):
   *
   *   - search: case-insensitive partial match on TITLE only (backend
   *     escapes LIKE wildcards; empty/whitespace behaves as no filter)
   *   - state: "ACTIVE" or "OWNER_TRASHED" only (omitted → both;
   *     ORPHANED is never listable — rejected with 400 by the backend)
   *   - page: positive integer (default 1)
   *   - limit: positive integer (default 20, backend max 100)
   *
   * Project convention: parameters at their default value are omitted from
   * the query string entirely, matching the F4.1 no-param request.
   *
   * Response (200): { documents: [...] } — metadata only. The backend
   * returns NO pagination metadata (no total/pages/hasNext), so page
   * availability is derived by the caller from the received page fullness.
   */
  listDocuments({ search, state, page, limit } = {}) {
    const params = new URLSearchParams()

    const trimmedSearch = typeof search === 'string' ? search.trim() : ''
    if (trimmedSearch.length > 0) params.set('search', trimmedSearch)
    if (state === 'ACTIVE' || state === 'OWNER_TRASHED') {
      params.set('state', state)
    }
    if (Number.isInteger(page) && page > 1) params.set('page', String(page))
    if (Number.isInteger(limit) && limit > 0 && limit !== 20) {
      params.set('limit', String(Math.min(limit, 100)))
    }

    const query = params.toString()
    return api.get(query.length > 0 ? `/documents?${query}` : '/documents')
  },

  /** Fetch one document by id. Backend authorizes; the frontend never
   * decides access itself. */
  getDocument(documentId) {
    return api.get(`/documents/${documentId}`)
  },

  /**
   * Update a document's title + content (F5.2 explicit save).
   *
   * Backend contract (source of truth: documents.controller.js /
   * documents.service.js / documents.validation.js):
   *
   *   PATCH /api/documents/:documentId  (authenticate, cookie-based)
   *     body: { title, content } — BOTH required:
   *       - title: string; backend trims; must be 1–255 chars after trim
   *       - content: required JSON object (never null/array)
   *     200 { document: { id, title, content, createdBy, ownerId,
   *                       documentState, createdAt, updatedAt } }
   *     400 VALIDATION_ERROR (details.title / details.content)
   *     401 AUTHENTICATION_REQUIRED | TOKEN_EXPIRED | INVALID_TOKEN
   *     403 FORBIDDEN (backend canEditDocument check — authoritative)
   *     404 RESOURCE_NOT_FOUND
   *
   * No ownership fields are ever sent — identity comes from the session.
   */
  updateDocument(documentId, { title, content }) {
    return api.patch(`/documents/${documentId}`, { title, content })
  },

  /**
   * Create a new document (F4.3).
   *
   * Backend contract (source of truth: documents.controller.js /
   * documents.service.js / documents.validation.js):
   *
   *   POST /api/documents  (authenticate, cookie-based)
   *     body: { title, content } — BOTH required:
   *       - title: string; backend trims; must be 1–255 chars after trim
   *       - content: required JSON object (never null/array)
   *     createdBy / ownerId are derived server-side from the authenticated
   *     user — the frontend never supplies ownership fields.
   *     201 { document: { id, title, content, createdBy, ownerId,
   *                       documentState: 'ACTIVE', createdAt, updatedAt } }
   *     400 VALIDATION_ERROR (details.title / details.content)
   *     401 AUTHENTICATION_REQUIRED | TOKEN_EXPIRED | INVALID_TOKEN
   *     500 INTERNAL_SERVER_ERROR
   *
   * F4.3 has no editor yet, so `content` is sent as the minimal valid
   * empty JSON object `{}`; content editing arrives in a later phase.
   */
  createDocument({ title }) {
    return api.post('/documents', { title, content: {} })
  },
}


