import { createBrowserRouter, Navigate } from 'react-router-dom'
import LoginPage from '../features/auth/LoginPage.jsx'
import RegisterPage from '../features/auth/RegisterPage.jsx'
import VerifyEmailPage from '../features/auth/VerifyEmailPage.jsx'
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage.jsx'
import ResetPasswordPage from '../features/auth/ResetPasswordPage.jsx'
import DocumentsPage from '../features/documents/DocumentsPage.jsx'
import DocumentPage from '../features/documents/DocumentPage.jsx'
import WorkspacesPage from '../features/workspaces/WorkspacesPage.jsx'
import WorkspacePage from '../features/workspaces/WorkspacePage.jsx'
import NotFoundPage from './NotFoundPage.jsx'
import { AppShell } from '../components/layout/AppShell.jsx'
import { RequireAuth } from '../features/auth/RequireAuth.jsx'
import { GuestOnly } from '../features/auth/GuestOnly.jsx'

/**
 * Application router (F3.1 — route architecture).
 *
 * The real application route tree, replacing the temporary F1/F2 scaffold:
 *
 *   /                          authenticated app entry → /documents
 *   /documents                 Documents placeholder (F4)
 *   /documents/:documentId     Document placeholder (F5)
 *   /workspaces                Workspaces placeholder (F7)
 *   /workspaces/:workspaceId   Workspace placeholder (F7)
 *   /login /register /verify-email /forgot-password /reset-password   auth UI
 *   *                          404
 *
 * Every authenticated product route is nested inside a single `RequireAuth`
 * layout route rendered through the F3.2 `AppShell` (<Sidebar/> + <Topbar/> +
 * <main><Outlet/></main>), so pages never build global navigation themselves.
 * Unauthenticated visitors are redirected to /login by RequireAuth, which
 * also preserves the intended destination.
 */
export const router = createBrowserRouter([
  {
    // Pathless authenticated layout — protects every nested app route.
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/documents" replace /> },
      { path: 'documents', element: <DocumentsPage /> },
      { path: 'documents/:documentId', element: <DocumentPage /> },
      { path: 'workspaces', element: <WorkspacesPage /> },
      { path: 'workspaces/:workspaceId', element: <WorkspacePage /> },
    ],
  },
  {
    path: '/login',
    element: (
      <GuestOnly>
        <LoginPage />
      </GuestOnly>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestOnly>
        <RegisterPage />
      </GuestOnly>
    ),
  },
  {
    path: '/verify-email',
    element: <VerifyEmailPage />,
  },
  {
    path: '/forgot-password',
    element: <ForgotPasswordPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])