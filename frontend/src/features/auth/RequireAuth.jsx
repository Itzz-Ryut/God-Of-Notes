import { Navigate, useLocation } from 'react-router-dom'
import { AUTH_STATUS, useAuth } from './auth.context.jsx'

/**
 * Route protection guard for authenticated content.
 *
 * State handling is deliberate:
 * - `checking`: session restoration is still running — render a loading state
 *   and DO NOT redirect (avoids flickering an unauthenticated page while the
 *   backend is queried).
 * - `authenticated`: render the protected children.
 * - `unauthenticated`: redirect to /login and preserve the intended destination
 *   so the user can be returned after signing in.
 * - `error` (non-sessionless failure): do NOT silently treat the user as logged
 *   out; surface the failure with a retry instead.
 */
export function RequireAuth({ children }) {
  const { status, refresh } = useAuth()
  const location = useLocation()

  if (status === AUTH_STATUS.CHECKING) {
    return (
      <div className="route-loading">
        <p role="status">Checking your session...</p>
      </div>
    )
  }

  if (status === AUTH_STATUS.AUTHENTICATED) {
    return children
  }

  if (status === AUTH_STATUS.ERROR) {
    return (
      <div className="auth-error-screen" role="alert">
        <h1>Something went wrong</h1>
        <p>We couldn&apos;t verify your session. Please try again.</p>
        <button type="button" className="btn btn-primary" onClick={refresh}>
          Try again
        </button>
      </div>
    )
  }

  return <Navigate to="/login" replace state={{ from: location }} />
}