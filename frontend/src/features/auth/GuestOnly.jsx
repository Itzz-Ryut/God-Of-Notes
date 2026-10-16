import { Navigate } from 'react-router-dom'
import { AUTH_STATUS, useAuth } from './auth.context.jsx'

/**
 * Guard for public/guest-only auth pages (login, register).
 *
 * While the session is still `checking` the guest page is rendered as-is; once
 * restoration resolves, an `authenticated` visitor is redirected to the
 * authenticated app entry (`/`, which lands on /documents) so they don't
 * linger on a sign-in form.
 */
export function GuestOnly({ children }) {
  const { status } = useAuth()

  if (status === AUTH_STATUS.AUTHENTICATED) {
    return <Navigate to="/" replace />
  }

  return children
}