import { ApiError } from '../../lib/api/errors.js'

/**
 * Map a normalized ApiError (or any thrown error) to a concise, user-facing
 * message for the auth forms.
 *
 * Known backend error codes are mapped explicitly. Anything unexpected falls
 * back to a generic message so internal/server details are not exposed.
 */
export function getAuthErrorMessage(
  err,
  { fallback = 'Something went wrong. Please try again.' } = {},
) {
  if (err instanceof ApiError) {
    // Network failure (fetch rejection) surfaces as status 0 / NETWORK_ERROR.
    if (err.status === 0 && err.code === 'NETWORK_ERROR') {
      return 'Unable to reach the server. Please check your connection and try again.'
    }

    // Rate limiting responds with a plain-text 429, so code is UNKNOWN_ERROR.
    if (err.status === 429) {
      return 'Too many attempts. Please wait a moment and try again.'
    }

    switch (err.code) {
      case 'INVALID_CREDENTIALS':
        return 'Invalid email/username or password.'
      case 'EMAIL_NOT_VERIFIED':
        return 'Email verification is required before logging in. Check your inbox for a verification code.'
      case 'EMAIL_ALREADY_EXISTS':
        return 'An account with this email already exists.'
      case 'USERNAME_ALREADY_EXISTS':
        return 'This username is already taken.'
      case 'INVALID_VERIFICATION_CODE':
        return 'That verification code is invalid or expired. Check the code and try again.'
      case 'VERIFICATION_CODE_EXPIRED':
        return 'That verification code has expired. Request a new one.'
      case 'EMAIL_ALREADY_VERIFIED':
        return 'This email is already verified. You can sign in now.'
      case 'INVALID_VERIFICATION_REQUEST':
        return 'Unable to process the verification request. Please try again.'
      case 'OTP_RESEND_COOLDOWN':
        return 'Please wait a moment before requesting another verification code.'
      case 'INVALID_PASSWORD':
        return 'Password must be between 8 and 72 characters.'
      case 'INVALID_RESET_TOKEN':
        return 'This password reset link is invalid or has expired. Request a new one.'
      case 'RESET_TOKEN_EXPIRED':
        return 'This password reset link has expired. Request a new one.'
      case 'RESET_TOKEN_ALREADY_USED':
        return 'This password reset link has already been used. Request a new one.'
      case 'VALIDATION_ERROR':
        return 'Please check the highlighted fields and try again.'
      default:
        return fallback
    }
  }

  return fallback
}

/**
 * Extract per-field error messages from a backend VALIDATION_ERROR.
 * The backend returns them as `details: { field: message }`.
 */
export function getAuthFieldErrors(err) {
  if (
    err instanceof ApiError &&
    err.status === 400 &&
    err.code === 'VALIDATION_ERROR' &&
    err.details &&
    typeof err.details === 'object'
  ) {
    return err.details
  }
  return {}
}