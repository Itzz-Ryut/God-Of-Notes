import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { authApi } from './auth.api.js'
import { getAuthErrorMessage, getAuthFieldErrors } from './authErrors.js'

function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const urlToken =
    typeof searchParams.get('token') === 'string' ? searchParams.get('token') : ''

  const [token, setToken] = useState(urlToken)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isReset, setIsReset] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const clearErrors = () => {
    setFormError(null)
    setFieldErrors({})
  }

  const validateForm = () => {
    const errors = {}
    if (!token.trim()) errors.token = 'Reset token is required'
    if (!password) errors.password = 'New password is required'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'
    else if (password.length > 72) errors.password = 'Password must be at most 72 characters'
    if (!confirmPassword) errors.confirmPassword = 'Please confirm your new password'
    else if (password && confirmPassword !== password) {
      errors.confirmPassword = 'Passwords do not match'
    }
    return errors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    clearErrors()

    const errors = validateForm()
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      // The backend payload is exactly { token, password }. confirmPassword is
      // frontend-only validation and is never sent.
      await authApi.resetPassword({ token: token.trim(), password })
      setIsReset(true)
      setFormError(null)
    } catch (err) {
      setFieldErrors(getAuthFieldErrors(err))
      setFormError(
        getAuthErrorMessage(err, {
          fallback: 'Unable to reset your password. Please try again.',
        }),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isReset) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-brand">GoD of NOTES</h1>
          <h2 className="auth-title">Password reset</h2>
          <div className="auth-success">
            <p>
              Your password has been reset successfully. You can now sign in with your new
              password.
            </p>
          </div>
          <div className="auth-links">
            <Link to="/login">Go to sign in</Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-brand">GoD of NOTES</h1>
        <h2 className="auth-title">Reset password</h2>

        <p className="auth-success">
          Enter the reset token from the email and choose a new password.
        </p>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="reset-token">
              Reset token
            </label>
            <input
              id="reset-token"
              className="form-input"
              type="text"
              autoComplete="off"
              spellCheck="false"
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                clearErrors()
              }}
              placeholder="Paste the token from the email, or open the reset link"
              disabled={isSubmitting}
            />
            {fieldErrors.token && (
              <p className="field-error" role="alert">
                {fieldErrors.token}
              </p>
            )}
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" htmlFor="reset-password">
              New password
            </label>
            <div style={{ position: 'relative', display: 'block', width: '100%' }}>
              <input
                id="reset-password"
                className="form-input"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  clearErrors()
                }}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem', position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                disabled={isSubmitting}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="field-error" role="alert">
                {fieldErrors.password}
              </p>
            )}
          </div>

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" htmlFor="reset-confirm-password">
              Confirm new password
            </label>
            <div style={{ position: 'relative', display: 'block', width: '100%' }}>
              <input
                id="reset-confirm-password"
                className="form-input"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value)
                  clearErrors()
                }}
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '0.15rem 0.35rem', position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowConfirmPassword((p) => !p)}
                aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                title={showConfirmPassword ? 'Hide password' : 'Show password'}
                disabled={isSubmitting}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.confirmPassword && (
              <p className="field-error" role="alert">
                {fieldErrors.confirmPassword}
              </p>
            )}
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Resetting...' : 'Reset password'}
          </button>
        </form>

        <div className="auth-links">
          <Link to="/login">Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage