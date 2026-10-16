import { Link } from 'react-router-dom'

/**
 * Global 404 fallback (F3.1).
 *
 * Catch-all for unmatched routes. Links back into the authenticated app entry.
 */
function NotFoundPage() {
  return (
    <section className="placeholder-page">
      <h1>Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/documents">Go to Documents</Link>
    </section>
  )
}

export default NotFoundPage
