import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../features/auth/auth.context.jsx'
import { getAuthErrorMessage } from '../../features/auth/authErrors.js'

/**
 * Validate a backend-provided identityColor (F3.12).
 *
 * Only well-formed hex colors are applied; anything missing, malformed, or a
 * potential CSS injection (url(), expressions) is rejected so the established
 * sage fallback is used. Never an invalid CSS value, never a random color.
 */
function isValidIdentityColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)
}

/**
 * Topbar (F3.4 — topbar; F3.5 — user menu; F3.8 — responsive).
 *
 * Permanent header of the authenticated shell. The account area is an
 * interactive menu trigger (username + small initial avatar) backed by the
 * existing F2 authentication context; the Topbar never reads cookies/tokens
 * and never calls the auth API directly — logout goes through the context's
 * `logout()`, which uses the existing backend endpoint.
 *
 * Menu behavior (F3.5): toggles open/closed on the trigger, closes on Escape
 * (returning focus to the trigger) and on outside pointer-down (listener
 * cleaned up on close/unmount). The menu contains only real, in-scope items —
 * Logout — with no invented account/settings routes. While the logout request
 * is running the item is disabled to prevent duplicate submissions; a failure
 * surfaces a concise inline error and leaves the user signed in so they can
 * retry.
 *
 * Responsive (F3.8): below 48rem a hamburger trigger (left side) toggles the
 * off-canvas sidebar via AppShell state (`menuOpen`/`onMenuToggle`), next to
 * a compact serif brand. Both are hidden on desktop, where the sidebar is
 * always visible. The account area stays on the right; long usernames
 * truncate harder on small screens.
 *
 * `identityColor` is used sparingly as the avatar background (sage fallback)
 * and never becomes the application theme.
 */

function MenuIcon() {
  return (
    <svg className="app-topbar-menu-icon" viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M2 4h12M2 8h12M2 12h12" />
    </svg>
  )
}

export function Topbar({ sidebarOpen = false, onMenuToggle, menuTriggerRef }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState(null)
  const accountRef = useRef(null)
  const triggerRef = useRef(null)

  const username = user?.username ?? ''
  const initial = username.charAt(0).toUpperCase()

  // Close on outside pointer-down while the menu is open. A pointerdown
  // listener (not click) closes before the click can land elsewhere, and the
  // effect is only active while open, with proper cleanup.
  useEffect(() => {
    if (!menuOpen) return undefined

    function handleOutsidePointerDown(event) {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointerDown)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown)
  }, [menuOpen])

  function closeMenu({ returnFocus = false } = {}) {
    setMenuOpen(false)
    if (returnFocus) {
      triggerRef.current?.focus()
    }
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'Escape' && menuOpen) {
      event.stopPropagation()
      closeMenu({ returnFocus: true })
    }
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      closeMenu({ returnFocus: true })
    }
  }

  async function handleLogout() {
    if (loggingOut) return
    setLoggingOut(true)
    setLogoutError(null)
    try {
      await logout()
      setMenuOpen(false)
      navigate('/login', { replace: true })
    } catch (err) {
      // Keep the user signed in on failure; surface a concise, retryable error.
      setLogoutError(getAuthErrorMessage(err, { fallback: 'Could not log out. Please try again.' }))
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <button
          type="button"
          ref={menuTriggerRef}
          className="app-topbar-menu-trigger"
          aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={sidebarOpen}
          aria-controls="app-sidebar"
          onClick={onMenuToggle}
        >
          <MenuIcon />
        </button>
        <span className="app-topbar-brand-mobile" aria-hidden="true">
          GoD of NOTES
        </span>
      </div>

      {username && (
        <div className="app-topbar-user" ref={accountRef}>
          <button
            type="button"
            ref={triggerRef}
            className="app-topbar-trigger"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-controls="app-account-menu"
            onClick={() => setMenuOpen((open) => !open)}
            onKeyDown={handleTriggerKeyDown}
          >
            <span className="app-topbar-username">{username}</span>
            <span
              className="app-topbar-avatar"
              style={isValidIdentityColor(user?.identityColor) ? { background: user.identityColor } : undefined}
              aria-hidden="true"
            >
              {initial}
            </span>
          </button>

          {menuOpen && (
            <div
              id="app-account-menu"
              className="app-account-menu"
              role="menu"
              aria-label={`Account — ${username}`}
              onKeyDown={handleMenuKeyDown}
            >
              <p className="app-account-menu-header">{username}</p>
              {logoutError && (
                <p className="app-account-menu-error" role="alert">
                  {logoutError}
                </p>
              )}
              <button
                type="button"
                role="menuitem"
                className="app-account-menu-item"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? 'Logging out…' : 'Logout'}
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}