import { Component } from 'react'
import { Link } from 'react-router-dom'

/**
 * Application-level error boundary (F3.10 — error/fallback).
 *
 * The smallest useful fallback: catches render errors anywhere in the router
 * tree and shows a clean, recoverable screen instead of a blank page or raw
 * stack trace. Not a telemetry/reporting platform — errors are only logged to
 * the console for development diagnostics; user-facing content stays clean.
 *
 * "Try again" resets the boundary state (React re-renders the subtree).
 * "Go to Documents" gives an explicit recovery path into the application.
 * The layout reuses the placeholder/404 visual language so the fallback feels
 * like the same product.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    // Development diagnostics only — never rendered to the user.
    console.error(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="placeholder-page" role="alert">
          <h1>Something went wrong</h1>
          <p>An unexpected error occurred. You can try again or return to your documents.</p>
          <div className="placeholder-actions">
            <button type="button" className="btn btn-primary" onClick={() => this.setState({ hasError: false })}>
              Try again
            </button>
            <Link to="/documents" className="btn btn-secondary">
              Go to Documents
            </Link>
          </div>
        </section>
      )
    }

    return this.props.children
  }
}