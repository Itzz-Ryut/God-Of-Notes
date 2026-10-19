import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { authApi } from './auth.api.js'
import { getAuthErrorMessage, getAuthFieldErrors } from './authErrors.js'
import { ApiError } from '../../lib/api/errors.js'
import GoogleAuthButton from './GoogleAuthButton.jsx'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function RegisterPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState(null)

  const clearErrors = () => {
    setFormError(null)
    setFieldErrors({})
  }

  const validateForm = () => {
    const errors = {}

    if (!username.trim()) errors.username = 'Username is required'
    else if (username.trim().length < 3 || username.trim().length > 30) {
      errors.username = 'Username must be between 3 and 30 characters'
    }

    if (!email.trim()) errors.email = 'Email is required'
    else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address'

    if (!password) errors.password = 'Password is required'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'

    if (!confirmPassword) errors.confirmPassword = 'Please confirm your password'
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
      // Backend payload contains ONLY username/email/password. confirmPassword
      // is frontend state only and is never sent. Registration creates the
      // account and starts email verification; it does NOT log the user in.
      const normalizedEmail = email.trim()
      await authApi.register({
        username: username.trim(),
        email: normalizedEmail,
        password,
      })
      setRegisteredEmail(normalizedEmail)
      setFormError(null)
    } catch (err) {
      setFieldErrors(getAuthFieldErrors(err))
      const normalizedEmail = email.trim()
      const isAlreadyExists = err instanceof ApiError && err.code === 'EMAIL_ALREADY_EXISTS'
      const recoveryLink = normalizedEmail ? (
        <Link to="/verify-email" state={{ email: normalizedEmail }}>
          Verify your email
        </Link>
      ) : null
      if (isAlreadyExists) {
        setFormError(
          <>
            An account with this email already exists. If you just created it,{' '}
            {recoveryLink || 'please verify your email'} before signing in.
          </>
        )
      } else {
        setFormError(
          <>
            {getAuthErrorMessage(err, {
              fallback: 'Unable to create your account. Please try again.',
            })}
            {normalizedEmail ? (
              <>
                {' '}If an account was created,{' '}
                {recoveryLink || 'please verify your email'} before signing in.
              </>
            ) : null}
          </>
        )
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (registeredEmail !== null) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-brand">GoD of NOTES</h1>
          <h2 className="auth-title">Account created</h2>
          <div className="auth-success">
            <p>
              Your account has been created. We&apos;ve sent a verification code to{' '}
              <strong>{registeredEmail}</strong>.
            </p>
            <p>
              Complete email verification before signing in. You can sign in once your email is
              verified.
            </p>
          </div>
          <div className="auth-links">
            <Link to="/verify-email" state={{ email: registeredEmail }}>
              Verify email now
            </Link>
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
        <h2 className="auth-title">Create an account</h2>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="register-username">
              Username
            </label>
            <input
              id="register-username"
              className="form-input"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                clearErrors()
              }}
              disabled={isSubmitting}
            />
            {fieldErrors.username && (
              <p className="field-error" role="alert">
                {fieldErrors.username}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">
              Email
            </label>
            <input
              id="register-email"
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

          <div className="form-group" style={{ position: 'relative' }}>
            <label className="form-label" htmlFor="register-password">
              Password
            </label>
            <div style={{ position: 'relative', display: 'block', width: '100%' }}>
              <input
                id="register-password"
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
            <label className="form-label" htmlFor="register-confirm-password">
              Confirm password
            </label>
            <div style={{ position: 'relative', display: 'block', width: '100%' }}>
              <input
                id="register-confirm-password"
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
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="auth-divider">or</div>
        <GoogleAuthButton label="Sign up with Google" />

        <div className="auth-links">
          <Link to="/login">Already have an account? Sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage