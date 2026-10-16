import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authApi } from './auth.api.js'
import { getAuthErrorMessage, getAuthFieldErrors } from './authErrors.js'

const OTP_PATTERN = /^\d{6}$/
const RESEND_COOLDOWN_MS = 60_000

function VerifyEmailPage() {
  const location = useLocation()
  const prefilledEmail =
    typeof location.state?.email === 'string' ? location.state.email : ''

  const [email, setEmail] = useState(prefilledEmail)
  const [otp, setOtp] = useState('')

  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [isResending, setIsResending] = useState(false)
  const [resendMessage, setResendMessage] = useState(null)
  // Timestamp (ms) before which the resend button is disabled.
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0)
  const [now, setNow] = useState(0)

  const [isVerified, setIsVerified] = useState(false)
  const [verifiedEmail, setVerifiedEmail] = useState(null)

  const clearErrors = () => {
    setFormError(null)
    setFieldErrors({})
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting || isVerified) return
    clearErrors()

    const errors = {}
    const normalizedEmail = email.trim()
    if (!normalizedEmail) errors.email = 'Email is required'
    if (!OTP_PATTERN.test(otp.trim())) errors.otp = 'Enter the 6-digit verification code'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setIsSubmitting(true)
    try {
      await authApi.verifyEmail({ email: normalizedEmail, otp: otp.trim() })
      setVerifiedEmail(normalizedEmail)
      setIsVerified(true)
      setFormError(null)
    } catch (err) {
      setFieldErrors(getAuthFieldErrors(err))
      setFormError(getAuthErrorMessage(err, { fallback: 'Unable to verify your email. Please try again.' }))
    } finally {
      setIsSubmitting(false)
    }
  }

  const startCooldown = (durationMs = RESEND_COOLDOWN_MS) => {
    setResendCooldownUntil(Date.now() + durationMs)
    setNow(Date.now())
  }

  const handleResend = async () => {
    if (isResending || !email.trim() || isVerified) return
    setIsResending(true)
    setResendMessage(null)
    try {
      await authApi.resendVerification({ email: email.trim() })
      setResendMessage('A new verification code has been sent.')
      startCooldown()
    } catch (err) {
      const message = getAuthErrorMessage(err, {
        fallback: 'Unable to send a new code. Please try again.',
      })
      setResendMessage(message)
      // The backend enforces a 60s cooldown; reflect it even on the client
      // when the backend reports it (429 OTP_RESEND_COOLDOWN) so the user
      // isn't left guessing.
      if (err?.status === 429) startCooldown()
    } finally {
      setIsResending(false)
    }
  }

  // Drive the resend cooldown countdown.
  useEffect(() => {
    if (resendCooldownUntil === 0) return undefined
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [resendCooldownUntil])

  const cooldownLeftMs = Math.max(0, resendCooldownUntil - now)
  const cooldownSeconds = Math.ceil(cooldownLeftMs / 1000)
  const resendDisabled =
    isResending || cooldownLeftMs > 0 || isVerified

  const renderVerifiedSuccess = () => (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-brand">GoD of NOTES</h1>
        <h2 className="auth-title">Email verified</h2>
        <div className="auth-success">
          <p>
            Your email <strong>{verifiedEmail}</strong> has been verified. You can now
            sign in.
          </p>
        </div>
        <div className="auth-links">
          <Link to="/login">Go to sign in</Link>
        </div>
      </div>
    </div>
  )

  if (isVerified) return renderVerifiedSuccess()
  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-brand">GoD of NOTES</h1>
        <h2 className="auth-title">Verify your email</h2>

        <p className="auth-success">
          We&apos;ve sent a 6-digit verification code to{' '}
          <strong>{prefilledEmail || 'your inbox'}</strong>. Enter it below to activate your
          account.
        </p>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="verify-email">
              Email
            </label>
            <input
              id="verify-email"
              className="form-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearErrors()
              }}
              disabled={isSubmitting || isResending}
            />
            {fieldErrors.email && (
              <p className="field-error" role="alert">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="verify-otp">
              Verification code
            </label>
            <input
              id="verify-otp"
              className="form-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                clearErrors()
              }}
              disabled={isSubmitting || isResending}
            />
            {fieldErrors.otp && (
              <p className="field-error" role="alert">
                {fieldErrors.otp}
              </p>
            )}
          </div>

          <button className="btn btn-primary" type="submit" disabled={isSubmitting || isResending}>
            {isSubmitting ? 'Verifying...' : 'Verify email'}
          </button>
        </form>

        <div className="auth-links">
          {resendMessage && !formError && (
            <p className="form-error" role="alert">
              {resendMessage}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleResend}
            disabled={resendDisabled}
          >
            {isResending
              ? 'Sending...'
              : cooldownLeftMs > 0
                ? `Resend code in ${cooldownSeconds}s`
                : 'Resend code'}
          </button>
          <Link to="/login">Go to sign in</Link>
        </div>
      </div>
    </div>
  )
}

export default VerifyEmailPage