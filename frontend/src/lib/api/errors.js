const DEFAULT_ERROR_CODE = 'UNKNOWN_ERROR'
const DEFAULT_ERROR_MESSAGE = 'Request failed'

/**
 * Normalized API error.
 *
 * The backend returns structured errors of the form:
 *   { error: { code, message, details? } }
 *
 * `status` is the HTTP status, `code`/`message`/`details` mirror the backend
 * contract so the UI can react to specific error codes later.
 */
export class ApiError extends Error {
  constructor(status, code, message, details = null, options = undefined) {
    super(message, options)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

/**
 * Build an ApiError from a fetch Response and its (optional) JSON body.
 * Preserves the backend error contract when available.
 */
export function toApiError(response, payload) {
  const status = response.status
  const backendError = payload?.error

  if (backendError && typeof backendError.code === 'string') {
    return new ApiError(
      status,
      backendError.code,
      backendError.message || DEFAULT_ERROR_MESSAGE,
      backendError.details ?? null,
    )
  }

  return new ApiError(
    status,
    DEFAULT_ERROR_CODE,
    response.statusText || DEFAULT_ERROR_MESSAGE,
  )
}