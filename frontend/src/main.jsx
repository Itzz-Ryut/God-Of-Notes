import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router.jsx'
import { ErrorBoundary } from './app/ErrorBoundary.jsx'
import { AuthProvider } from './features/auth/auth.context.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      {/* App-level fallback (F3.10): a render error anywhere in the router
          shows a clean recoverable screen instead of a blank page. */}
      <ErrorBoundary>
        <RouterProvider router={router} />
      </ErrorBoundary>
    </AuthProvider>
  </StrictMode>,
)
