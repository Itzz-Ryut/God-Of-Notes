import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar.jsx'
import { Topbar } from './Topbar.jsx'

/**
 * Application shell (F3.2 — application layout; F3.8 — responsive behavior).
 *
 * The permanent layout frame for every authenticated product page. Mounted at
 * the F3.1 pathless layout route, inside <RequireAuth>, so pages never build
 * global navigation themselves — they only render content into <Outlet/>.
 *
 * Responsive strategy (F3.8), deliberately small:
 * - Desktop (>= 48rem): static sidebar + content, exactly as F3.2 established.
 * - Below 48rem: the sidebar becomes off-canvas, toggled by a hamburger
 *   trigger in the Topbar (aria-expanded/aria-controls), closed by Escape
 *   (with focus returned to the trigger), by navigating, or by activating the
 *   subtle backdrop. One breakpoint, no drawer library, no focus trap — the
 *   sidebar is not modal.
 *
 * Authentication stays external: the shell consumes only what AuthContext
 * provides (through Topbar), and never inspects tokens or cookies itself.
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const menuTriggerRef = useRef(null)

  const closeSidebar = () => setSidebarOpen(false)

  // Escape closes the mobile sidebar and returns focus to the trigger so
  // keyboard users are not left inside a hidden panel. Active only while open.
  useEffect(() => {
    if (!sidebarOpen) return undefined

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeSidebar()
        menuTriggerRef.current?.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} onNavigate={closeSidebar} />
      <div className="app-shell-body">
        <Topbar
          menuOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen((open) => !open)}
          menuTriggerRef={menuTriggerRef}
        />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
      {sidebarOpen && (
        <button
          type="button"
          className="app-sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeSidebar}
        />
      )}
    </div>
  )
}