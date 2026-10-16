import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { documentsApi } from './documents.api.js'
import CreateDocumentForm from './CreateDocumentForm.jsx'

/**
 * Documents list page (F4.1 + F4.2).
 *
 * F4.2 extends the F4.1 data-backed list with backend-supported discovery:
 * debounced title search, document-state filter, page-based pagination, and
 * URL-backed list state (`?search=&state=&page=`) that survives refresh and
 * browser back/forward.
 *
 * Backend contract (source of truth): GET /api/documents accepts page,
 * limit (default 20, max 100), search (title only, case-insensitive) and
 * state (ACTIVE | OWNER_TRASHED). The response is { documents: [...] } with
 * NO pagination metadata — page availability is therefore derived from
 * received page fullness (a full page means a next page may exist; Previous
 * is available for page > 1). No metadata is invented.
 *
 * All filtering/search/pagination happens server-side; the list state lives
 * exclusively in React Router search params (never window.location). Invalid
 * URL values normalize safely without redirect loops: bad page → 1,
 * unsupported state → all.
 */

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 400

// Only backend-supported listing states; ORPHANED is intentionally absent —
// the backend rejects it with 400 VALIDATION_ERROR.
const STATE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'OWNER_TRASHED', label: 'Trashed' },
]

const STATE_LABELS = {
  ACTIVE: 'Active',
  OWNER_TRASHED: 'In trash',
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

function formatAccessLabel(access) {
  if (!access || typeof access !== 'object') return null
  const perm = access.permission
  const src = access.source
  if (perm === 'OWNER' && src === 'OWNER') return 'Owner'
  if (perm === 'EDITOR' && src === 'DIRECT') return 'Editor · Shared with you'
  if (perm === 'VIEWER' && src === 'DIRECT') return 'Viewer · Shared with you'
  if (perm === 'EDITOR' && src === 'WORKSPACE') return 'Editor · Workspace'
  if (perm === 'VIEWER' && src === 'WORKSPACE') return 'Viewer · Workspace'
  return null
}

function formatDate(iso) {
  if (typeof iso !== 'string' || iso.length === 0) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return dateFormatter.format(date)
}

/** Normalize the raw URL params into safe list state (no redirect loops —
 * invalid values simply render as their defaults). */
function parseListParams(searchParams) {
  const rawSearch = searchParams.get('search') ?? ''
  const rawState = searchParams.get('state') ?? ''
  const rawPage = searchParams.get('page') ?? ''

  const search = rawSearch.trim()
  const state = STATE_OPTIONS.some((o) => o.value === rawState && o.value !== '')
    ? rawState
    : ''
  const page = /^\d+$/.test(rawPage)
    ? Math.max(1, Number.parseInt(rawPage, 10))
    : 1

  return { search, state, page, rawSearch }
}


function DocumentListItems({ documents }) {
  return (
    <ul className="document-list">
      {documents.map((document) => {
        const updatedLabel = formatDate(document.updatedAt)
        const stateLabel = STATE_LABELS[document.documentState]

        const accessLabel = formatAccessLabel(document.access)

        return (
          <li key={document.id} className="document-item">
            <Link to={`/documents/${document.id}`} className="document-link">
              <span className="document-title">{document.title}</span>
              <span className="document-meta">
                {accessLabel && (
                  <span className="document-access">{accessLabel}</span>
                )}
                {stateLabel && (
                  <span className="document-state">{stateLabel}</span>
                )}
                {updatedLabel && (
                  <span className="document-updated">
                    Updated {updatedLabel}
                  </span>
                )}
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { search, state, page, rawSearch } = parseListParams(searchParams)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  // Local input value for the debounced search field. External URL changes
  // (browser back/forward, copied URL) re-sync it via the render-time
  // adjustment pattern below — never via setState inside an effect.
  const [searchInput, setSearchInput] = useState(rawSearch)
  const [prevUrlSearch, setPrevUrlSearch] = useState(rawSearch)
  if (prevUrlSearch !== rawSearch) {
    setPrevUrlSearch(rawSearch)
    setSearchInput(rawSearch)
  }

  // Result for the CURRENT URL state. `result.key === listKey` means the
  // shown data matches the URL; otherwise a request is in flight and the
  // last good page stays visible (no blank page during pagination/typing).
  // Stale responses can never overwrite newer results because only the
  // result matching the current key is displayed.
  const [result, setResult] = useState(null)
  const [retryCount, setRetryCount] = useState(0)
  // Last successfully loaded page — kept in state (updated via the
  // render-time adjustment pattern, not a ref) so a pagination/search
  // transition keeps the previous list visible instead of blanking.
  const [lastGood, setLastGood] = useState([])

  const listKey = `${search}\u0000${state}\u0000${page}\u0000${retryCount}`
  const current = result && result.key === listKey ? result : null
  if (current && !current.error && current.documents !== lastGood) {
    setLastGood(current.documents)
  }

  useEffect(() => {
    let cancelled = false

    documentsApi
      .listDocuments({ search, state, page, limit: PAGE_SIZE })
      .then((payload) => {
        if (cancelled) return
        // Backend contract: { documents: [...] } — no pagination metadata.
        const documents = Array.isArray(payload?.documents)
          ? payload.documents
          : []
        setResult({ key: listKey, documents, error: null })
      })
      .catch((err) => {
        if (cancelled) return
        // Any failure (network or API) is surfaced as a generic retryable
        // error; 401s are additionally handled by the auth boundary.
        setResult({ key: listKey, documents: null, error: err })
      })

    return () => {
      cancelled = true
    }
  }, [listKey, search, state, page])

  /** Update the URL list state; empty values are removed so the URL stays
   * minimal. Changing search/filter resets page to 1. */
  function updateListParams(updates, { replace = false } = {}) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        for (const [key, value] of Object.entries(updates)) {
          const normalized = typeof value === 'string' ? value.trim() : value
          if (
            normalized === undefined ||
            normalized === null ||
            normalized === ''
          ) {
            params.delete(key)
          } else {
            params.set(key, normalized)
          }
        }
        return params
      },
      { replace },
    )
  }

  // Debounced search: typing updates the local input immediately; the URL
  // (and therefore the backend request) updates after a quiet period. A
  // keystroke within the window cancels the pending update. replace:true
  // keeps per-keystroke entries out of the browser history stack.
  useEffect(() => {
    const trimmed = searchInput.trim()
    if (trimmed === search) return undefined

    const timer = setTimeout(() => {
      updateListParams({ search: trimmed, page: '' }, { replace: true })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [searchInput, search]) // eslint-disable-line react-hooks/exhaustive-deps

  // Event handlers keep loading/error resets out of effects.
  const retry = () => {
    setResult(null)
    setRetryCount((count) => count + 1)
  }

  const changeState = (nextState) => {
    setResult(null)
    updateListParams({ state: nextState, page: '' })
  }

  const goToPage = (nextPage) => {
    setResult(null)
    updateListParams({ page: String(nextPage) })
  }

  const clearSearch = () => {
    setSearchInput('')
    setResult(null)
    updateListParams({ search: '', page: '' })
  }

  // Successful creation: navigate to the created document using the ID
  // from the backend response. The F4.1 detail page then fetches it with
  // its own existing flow — the created document is never passed as
  // navigation state as a source of truth.
  const handleCreated = (createdDocument) => {
    setIsCreateOpen(false)
    navigate(`/documents/${createdDocument.id}`)
  }

  const isFiltering = search.length > 0 || state !== ''
  const documents = current?.documents ?? lastGood
  const hasError = Boolean(current?.error)
  // Loading = no result yet for the current URL state (first load, or a
  // param change whose response has not arrived). The previous page stays
  // rendered (with aria-busy) during the transition instead of blanking.
  const isLoading = !current
  const isFirstLoad = isLoading && documents.length === 0
  const canGoPrevious = page > 1
  // Backend returns no pagination metadata: a full page is the only safe
  // signal that another page may exist.
  const canGoNext = !hasError && documents.length === PAGE_SIZE

  const isEmptyNoDocuments =
    !isLoading && !hasError && !isFiltering && documents.length === 0
  const isEmptyResults =
    !isLoading && !hasError && isFiltering && documents.length === 0

  return (
    <section className="documents-page" aria-busy={isLoading || undefined}>
      <h1>Documents</h1>

      <div className="documents-actions documents-heading-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsCreateOpen(true)}
          disabled={isCreateOpen}
        >
          + New Document
        </button>
      </div>

      {isCreateOpen && (
        <CreateDocumentForm
          onCancel={() => setIsCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}

      <div className="documents-toolbar">
        <input
          type="search"
          className="form-input documents-search"
          placeholder="Search documents..."
          aria-label="Search documents by title"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
        />
        <label className="documents-state-filter">
          <span className="documents-state-label">Show</span>
          <select
            className="form-input"
            aria-label="Filter documents by state"
            value={state}
            onChange={(event) => changeState(event.target.value)}
          >
            {STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isFirstLoad && <p role="status">Loading your documents…</p>}

      {hasError && !isFirstLoad && (
        <>
          <p role="alert">Unable to load documents. Please try again.</p>
          <div className="documents-actions">
            <button type="button" className="btn btn-secondary" onClick={retry}>
              Try again
            </button>
          </div>
        </>
      )}

      {isEmptyNoDocuments && (
        <p>
          You don&apos;t have any documents yet. Document creation is coming in
          a later phase.
        </p>
      )}

      {isEmptyResults && (
        <>
          <p>No documents found.</p>
          <p>Try a different search.</p>
          <div className="documents-actions">
            {search.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={clearSearch}
              >
                Clear search
              </button>
            )}
            {state !== '' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => changeState('')}
              >
                Clear filter
              </button>
            )}
          </div>
        </>
      )}

      {documents.length > 0 && <DocumentListItems documents={documents} />}

      {(canGoPrevious || canGoNext) && (
        <nav className="documents-pagination" aria-label="Documents pages">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => goToPage(page - 1)}
            disabled={!canGoPrevious || isLoading}
          >
            Previous
          </button>
          <span className="documents-pagination-status">Page {page}</span>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => goToPage(page + 1)}
            disabled={!canGoNext || isLoading}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  )
}

export default DocumentsPage

