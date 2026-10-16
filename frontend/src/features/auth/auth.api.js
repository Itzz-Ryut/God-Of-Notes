import { api, API_BASE_URL } from '../../lib/api/client.js'

/**
 * Authentication API functions.
 *
 * Every endpoint here mirrors the backend `/api/auth` routes exactly:
 *   - method, path, request body fields, and response behavior
 *   - see backend/src/modules/auth/auth.routes.js
 *
 * Cookie-based authentication: the browser stores the HttpOnly access-token
 * cookie set by the backend. `api` sends it automatically via credentials.
 */
export const authApi = {
  register({ username, email, password }) {
    return api.post('/auth/register', { username, email, password })
  },

  login({ identifier, password }) {
    return api.post('/auth/login', { identifier, password })
  },

  verifyEmail({ email, otp }) {
    return api.post('/auth/verify-email', { email, otp })
  },

  resendVerification({ email }) {
    return api.post('/auth/resend-verification', { email })
  },

  forgotPassword({ email }) {
    return api.post('/auth/forgot-password', { email })
  },

  resetPassword({ token, password }) {
    return api.post('/auth/reset-password', { token, password })
  },

  logout() {
    return api.post('/auth/logout')
  },

  /**
   * URL the browser should navigate to start the Google sign-in flow.
   * The backend sets its oauth_state cookie and redirects to Google.
   */
  getGoogleLoginUrl() {
    return `${API_BASE_URL}/auth/google`
  },

  /**
   * Fetch the currently authenticated user (or signal that there is none).
   *
   * This is a users endpoint (`GET /api/users/me`) rather than an `/api/auth`
   * route, but it is the authoritative session-check used for auth-state
   * restoration. It requires credentials (the HttpOnly access-token cookie).
   *
   * Response (200): { user: { id, username, email, emailVerified, identityColor } }
   * Unauthenticated (401): AUTHENTICATION_REQUIRED | TOKEN_EXPIRED | INVALID_TOKEN
   */
  getCurrentUser() {
    return api.get('/users/me')
  },
}