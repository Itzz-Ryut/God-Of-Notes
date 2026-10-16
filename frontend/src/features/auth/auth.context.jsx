import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { authApi } from './auth.api.js'
import { ApiError } from '../../lib/api/errors.js'

/**
 * Authentication state machine for the GoD of NOTES frontend.
 *
 * The backend is the single source of truth. It owns the credential as an
 * HttpOnly cookie; this layer only reflects the session that the backend
 * reports through `GET /api/users/me`. No token is ever read, decoded,
 * stored, or exposed here — these are UI/application state only.
 *
 *   checking -> authenticated | unauthenticated | error
 *
 * `checking` is the initial view state so consumers never briefly assume a
 * user is logged out while session restoration is still running (important
 * for future protected routes).
 */
// oxlint-disable-next-line react/only-export-components -- shared constant used by consumers
export const AUTH_STATUS = Object.freeze({
  CHECKING: 'checking',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
  ERROR: 'error',
})

/** Backend error codes that mean "there is no usable authenticated session". */
const SESSIONLESS_CODES = new Set([
  'AUTHENTICATION_REQUIRED',
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
])

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.CHECKING)
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)

  // Guard against duplicate session requests caused by React StrictMode's
  // development double-invocation of effects (one request per provider mount).
  const sessionStarted = useRef(false)

  const restoreSession = useCallback(async () => {
    setStatus(AUTH_STATUS.CHECKING)
    setError(null)

    try {
      const payload = await authApi.getCurrentUser()
      setUser(payload?.user ?? null)
      setStatus(AUTH_STATUS.AUTHENTICATED)
    } catch (err) {
      // A 401 with a sessionless code is the backend telling us the user is
      // not authenticated. Anything else (5xx, network, unexpected) is NOT
      // treated as proof of logout.
      const isApiError = err instanceof ApiError
      const isUnauthenticated =
        isApiError && err.status === 401 && SESSIONLESS_CODES.has(err.code)

      if (isUnauthenticated) {
        setUser(null)
        setStatus(AUTH_STATUS.UNAUTHENTICATED)
        return
      }

      setUser(null)
      setError(
        isApiError
          ? err
          : new ApiError(0, 'UNKNOWN_ERROR', err?.message || 'Failed to check session'),
      )
      setStatus(AUTH_STATUS.ERROR)
    }
  }, [])

  useEffect(() => {
    if (sessionStarted.current) return
    sessionStarted.current = true
    restoreSession()
  }, [restoreSession])

  /**
   * Update the session state after a future login, register, or Google-OAuth
   * completion. No such flows exist yet (F2.2 / F2.5).
   */
  const setAuthenticatedUser = useCallback((nextUser) => {
    setUser(nextUser ?? null)
    setError(null)
    setStatus(nextUser ? AUTH_STATUS.AUTHENTICATED : AUTH_STATUS.UNAUTHENTICATED)
  }, [])

  /**
   * Clear the session state after a future logout flow.
   */
  const clearAuth = useCallback(() => {
    setUser(null)
    setError(null)
    setStatus(AUTH_STATUS.UNAUTHENTICATED)
  }, [])

  /**
   * Log the user out through the existing backend endpoint and clear the
   * local authenticated-user state (F3.5). The backend owns cookie
   * invalidation; this layer only owns its own state.
   *
   * A sessionless 401 is treated as success (the session was already gone),
   * mirroring the restoration logic above. Any other failure is rethrown so
   * callers can surface it and allow a retry — the state is left untouched
   * (still authenticated), never pretending a failed logout succeeded.
   */
  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (err) {
      const isApiError = err instanceof ApiError
      const isAlreadySessionless =
        isApiError && err.status === 401 && SESSIONLESS_CODES.has(err.code)

      if (!isAlreadySessionless) {
        throw err
      }
    }
    clearAuth()
  }, [clearAuth])

  const value = useMemo(
    () => ({
      status,
      user,
      isAuthenticated: status === AUTH_STATUS.AUTHENTICATED,
      isLoading: status === AUTH_STATUS.CHECKING,
      error,
      refresh: restoreSession,
      setAuthenticatedUser,
      clearAuth,
      logout,
    }),
    [status, user, error, restoreSession, setAuthenticatedUser, clearAuth, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components -- hook co-located with provider
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
