import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../lib/api/errors.js'
import { documentsApi } from './documents.api.js'

/**
 * Document creation form (F4.3).
 *
 * Intentionally minimal inline panel on the Documents page — no modal
 * system, no templates, no workspace/sharing/formatting options. The user
 * provides only what the backend requires from the client: a title
 * (1–255 chars after trim; the backend trims and enforces the maximum).
 * Content is required by the backend contract, so `createDocument` sends
 * the minimal empty JSON object; content editing arrives later.
 *
 * Behavior: client-side validation gives immediate feedback but the
 * backend remains authoritative (400 VALIDATION_ERROR is surfaced);
 * duplicate submissions are prevented while submitting; errors preserve
 * the input for retry and never expose raw JSON/stack traces; success
 * navigates to /documents/:id using the ID from the backend response.
 */

const TITLE_MAX_LENGTH = 255

export default function CreateDocumentForm({ onCancel, onCreated }) {
  const [title, setTitle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [fieldError, setFieldError] = useState(null)
  const [submitError, setSubmitError] = useState(null)
  const titleInputRef = useRef(null)

  // Focus the title input when the form appears.
  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  const trimmed = title.trim()
  const isTitleValid =
    trimmed.length > 0 && trimmed.length <= TITLE_MAX_LENGTH
  const canSubmit = isTitleValid && !isSubmitting

  // Escape closes the form while it is open (sensible non-modal behavior).
  useEffect(() => {
    if (!onCancel) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  async function handleSubmit(event) {
    event.preventDefault()

    // Re-validate on submit; the Create control is disabled while invalid,
    // so this guards programmatic/Enter submissions too.
    if (trimmed.length === 0) {
      setFieldError('Title is required.')
      return
    }
    if (trimmed.length > TITLE_MAX_LENGTH) {
      setFieldError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer.`)
      return
    }
    if (isSubmitting) return

    setIsSubmitting(true)
    setFieldError(null)
    setSubmitError(null)

    try {
      const payload = await documentsApi.createDocument({ title: trimmed })
      // The created document (and its ID) come solely from the backend
      // response — never constructed client-side.
      const created = payload?.document
      if (!created || typeof created.id !== 'string') {
        throw new ApiError(0, 'UNKNOWN_ERROR', 'Unexpected response')
      }
      onCreated(created)
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400 && err.code === 'VALIDATION_ERROR') {
          // Backend validation is authoritative; surface its field detail
          // without exposing raw internals. Input is preserved for retry.
          if (err.details && typeof err.details.title === 'string') {
            setFieldError(err.details.title)
          } else {
            setSubmitError('The document could not be created. Please check the title and try again.')
          }
        } else if (err.status === 401) {
          // Handled by the auth boundary; still show a neutral message here.
          setSubmitError('Your session has expired. Please sign in again.')
        } else if (err.status === 0 && err.code === 'NETWORK_ERROR') {
          setSubmitError('Unable to reach the server. Please check your connection and try again.')
        } else {
          setSubmitError('Unable to create the document. Please try again.')
        }
      } else {
        setSubmitError('Unable to create the document. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form className="create-document-form" onSubmit={handleSubmit}>
      <h2 className="create-document-title">Create new document</h2>

      <div className="form-group">
        <label className="form-label" htmlFor="new-document-title">
          Title
        </label>
        <input
          id="new-document-title"
          ref={titleInputRef}
          type="text"
          className="form-input"
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          disabled={isSubmitting}
          aria-invalid={fieldError ? 'true' : undefined}
          aria-describedby={fieldError ? 'new-document-title-error' : undefined}
          onChange={(event) => {
            setTitle(event.target.value)
            if (fieldError) setFieldError(null)
          }}
        />
        {fieldError && (
          <p id="new-document-title-error" className="create-document-error" role="alert">
            {fieldError}
          </p>
        )}
      </div>

      {submitError && (
        <p className="create-document-error" role="alert">
          {submitError}
        </p>
      )}

      {isSubmitting && (
        <p className="create-document-status" role="status">
          Creating…
        </p>
      )}

      <div className="documents-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          Create
        </button>
      </div>
    </form>
  )
}
