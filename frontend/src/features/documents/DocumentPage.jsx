import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { documentsApi } from './documents.api.js'
import { ApiError } from '../../lib/api/errors.js'
import DocumentEditor from './DocumentEditor.jsx'

/**
 * Single-document page (F4.1 + F5.1).
 *
 * Fetches the document from the existing backend (GET /api/documents/:id).
 * Authorization is entirely backend-side: the frontend simply requests the
 * resource and handles the result (403/404 → same neutral "unavailable"
 * message — never a misleading authorization explanation).
 *
 * F5.1 turns the success view into the DocumentEditor foundation (title +
 * read-only content surface). Loading/error/authorization handling is
 * unchanged and remains the detail endpoint's responsibility.
 */

function DocumentPage() {
  const { documentId } = useParams()

  // Keyed by documentId so navigating between documents remounts the view
  // with fresh initial state — the fetch effect below stays free of any
  // synchronous setState.
  return <DocumentView key={documentId} documentId={documentId} />
}

function DocumentView({ documentId }) {
  const [document, setDocument] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [notAvailable, setNotAvailable] = useState(false)
  const [error, setError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    documentsApi
      .getDocument(documentId)
      .then((payload) => {
        if (cancelled) return
        setDocument(payload?.document ?? null)
      })
      .catch((err) => {
        if (cancelled) return
        if (
          err instanceof ApiError &&
          (err.status === 403 || err.status === 404 || err.status === 400)
        ) {
          // 403 (no access), 404 (not found) and 400 (non-UUID id) are all
          // "this document is not available to you" — no distinction is
          // exposed, so nonexistent vs unauthorized is not an oracle.
          setNotAvailable(true)
        } else {
          // Network failure or unexpected server error → generic retryable.
          setError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [documentId, retryCount])

  // State resets happen in the event handler, not inside the effect.
  const retry = () => {
    setRetryCount((count) => count + 1)
    setIsLoading(true)
    setNotAvailable(false)
    setError(false)
  }

  if (isLoading) {
    return (
      <section className="documents-page" aria-busy="true">
        <p role="status">Loading document…</p>
        <Link to="/documents">Back to documents</Link>
      </section>
    )
  }

  if (notAvailable) {
    return (
      <section className="documents-page">
        <h1>Document unavailable</h1>
        <p>This document doesn&apos;t exist or you don&apos;t have access to it.</p>
        <Link to="/documents">Back to documents</Link>
      </section>
    )
  }

  if (error || !document) {
    return (
      <section className="documents-page">
        <h1>Document</h1>
        <p role="alert">We couldn&apos;t load this document. Please try again.</p>
        <div className="documents-actions">
          <button type="button" className="btn btn-secondary" onClick={retry}>
            Retry
          </button>
        </div>
        <Link to="/documents">Back to documents</Link>
      </section>
    )
  }

  return <DocumentEditor document={document} />
}

export default DocumentPage

