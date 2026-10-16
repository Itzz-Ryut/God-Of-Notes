import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from './auth.api.js'
import { getAuthErrorMessage, getAuthFieldErrors } from './authErrors.js'

function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [requestedEmail, setRequestedEmail] = useState(null)

  const clearErrors = () => {
    setFormError(null)
    setFieldErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    clearErrors()

    const errors = {}
    const normalizedEmail = email.trim()
    if (!normalizedEmail) errors.email = 'Email is required'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      // The backend deliberately returns the same generic message whether or
      // not an account exists for this email (account-enumeration protection).
      await authApi.forgotPassword({ email: normalizedEmail })
      setRequestedEmail(normalizedEmail)
      setFormError(null)
    } catch (err) {
      setFieldErrors(getAuthFieldErrors(err))
      setFormError(
        getAuthErrorMessage(err, {
          fallback: 'Unable to send a password reset link. Please try again.',
        }),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (requestedEmail !== null) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-brand">GoD of NOTES</h1>
          <h2 className="auth-title">Check your email</h2>
          <div className="auth-success">
            <p>
              If an account exists for <strong>{requestedEmail}</strong>, we&apos;ve sent a
              password reset link. Follow the link in the email to choose a new password.
            </p>
            <p>The reset link expires shortly, so use it soon.</p>
          </div>
          <div className="auth-links">
            <Link to="/login">Back to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-brand">GoD of NOTES</h1>
        <h2 className="auth-title">Forgot password</h2>

        <p className="auth-success">
          Enter the email address for your account and we&apos;ll send you a link to reset your
          password.
        </p>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="forgot-email">
              Email
            </label>
            <input
              id="forgot-email"
              className="form-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearErrors()
              }}
              disabled={isSubmitting}
            />
            {fieldErrors.email && (
              <p className="field-error" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending link...' : 'Send reset link'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage