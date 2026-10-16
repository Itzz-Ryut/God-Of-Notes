import { NavLink } from 'react-router-dom'

/**
 * Dependency-free outline icons (F3.3).
 *
 * No icon library exists in the project and none is warranted for two
 * navigation icons. Visually quiet 16px outline glyphs, secondary to the
 * text labels; hidden from assistive tech because the link text carries
 * the meaning.
 */
function DocumentIcon() {
  return (
    <svg className="app-sidebar-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M4 1.75h5.25L12.5 5v9.25h-8.5z" />
      <path d="M9 2v3.25h3.25" />
      <path d="M6 8h4M6 10.5h4" />
    </svg>
  )
}

function WorkspacesIcon() {
  return (
    <svg className="app-sidebar-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <rect x="1.75" y="1.75" width="5.5" height="5.5" rx="0.75" />
      <rect x="8.75" y="1.75" width="5.5" height="5.5" rx="0.75" />
      <rect x="1.75" y="8.75" width="5.5" height="5.5" rx="0.75" />
      <rect x="8.75" y="8.75" width="5.5" height="5.5" rx="0.75" />
    </svg>
  )
}

/**
 * Sidebar navigation (F3.3 — sidebar navigation; F3.8 — responsive).
 *
 * Lightweight per the UI direction: spacing and hierarchy over boxed
 * sections. Links only to routes that exist today; section entries that have
 * no route yet (Trash, User) arrive with their features, not here as dead
 * placeholders.
 *
 * Active state: NavLink matches prefix-style by default (no `end` prop), so
 * /documents/:documentId keeps Documents active and /workspaces/:workspaceId
 * keeps Workspaces active. The active class also sets aria-current="page",
 * and the emphasis is not color-only (weight + inset indicator), so it stays
 * understandable without relying on hue.
 *
 * Responsive (F3.8): below 48rem this panel is off-canvas, controlled by the
 * Topbar trigger. `open`/`onNavigate` come from AppShell; closing after a
 * navigation click is harmless on desktop and expected on mobile. The
 * navigation markup and matching are untouched — only visibility changes.
 */
const NAV_ITEMS = [
  { to: '/documents', label: 'Documents', Icon: DocumentIcon },
  { to: '/workspaces', label: 'Workspaces', Icon: WorkspacesIcon },
]

export function Sidebar({ open = false, onNavigate }) {
  return (
    <aside
      id="app-sidebar"
      className={open ? 'app-sidebar app-sidebar--open' : 'app-sidebar'}
    >
      <div className="app-sidebar-brand">
        GoD of
        <br />
        NOTES
      </div>
      <nav className="app-sidebar-nav" aria-label="Primary">
        <ul>
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  isActive ? 'app-sidebar-link app-sidebar-link--active' : 'app-sidebar-link'
                }
                onClick={onNavigate}
              >
                <Icon />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}