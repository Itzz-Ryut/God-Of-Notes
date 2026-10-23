import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "./auth.context.jsx";
import { authApi } from "./auth.api.js";
import { getAuthErrorMessage, getAuthFieldErrors } from "./authErrors.js";
import { ApiError } from "../../lib/api/errors.js";
import GoogleAuthButton from "./GoogleAuthButton.jsx";

/**
 * Resolve the intended destination preserved by RequireAuth (router state
 * `from`, a location object), safely (F3.6).
 *
 * Internal-only by construction: the value comes from React Router state, not
 * from a user-controllable query string, and it is accepted only when it is a
 * plain object whose pathname is an app-internal absolute path. Anything else
 * (missing, malformed, protocol-relative, external) falls back to the
 * authenticated app entry — an open redirect is not possible.
 */
function getSafeRedirectLocation(locationState) {
  const from = locationState?.from;
  if (!from || typeof from !== "object") return null;

  const { pathname, search, hash } = from;
  if (
    typeof pathname !== "string" ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//")
  ) {
    return null;
  }

  return {
    pathname,
    search: typeof search === "string" ? search : "",
    hash: typeof hash === "string" ? hash : "",
  };
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { setAuthenticatedUser } = useAuth();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const clearErrors = () => {
    setFormError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    clearErrors();

    const errors = {};
    if (!identifier.trim()) errors.identifier = "Email or username is required";
    if (!password) errors.password = "Password is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      // Backend authenticates and sets the HttpOnly access_token cookie.
      const response = await authApi.login({
        identifier: identifier.trim(),
        password,
      });
      // Only public user data enters React state. The token stays in the cookie.
      setAuthenticatedUser(response.user);
      // Return to the intended protected destination when the user was sent
      // here by RequireAuth; otherwise the authenticated app entry from F3.1
      // (lands on /documents).
      navigate(getSafeRedirectLocation(location.state) ?? "/", {
        replace: true,
      });
    } catch (err) {
      setFieldErrors(getAuthFieldErrors(err));
      const normalizedIdentifier = identifier.trim();
      const isNotVerified =
        err instanceof ApiError && err.code === "EMAIL_NOT_VERIFIED";
      const isEmail = normalizedIdentifier.includes("@");
      const verifyLink = isNotVerified ? (
        <Link
          to='/verify-email'
          state={isEmail ? { email: normalizedIdentifier } : undefined}
        >
          Verify your email
        </Link>
      ) : null;
      setFormError(
        <>
          {getAuthErrorMessage(err, {
            fallback: "Unable to sign in. Please try again.",
          })}
          {isNotVerified && (
            <>
              <br />
              {verifyLink || "Please verify your email before signing in."}
            </>
          )}
        </>,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='auth-page'>
      <div className='auth-card'>
        <h1 className='auth-brand'>GoD of NOTES</h1>

        <div className='demo-access-notice'>
          <div className='demo-access-heading'>
            <span className='demo-access-icon'>ⓘ</span>
            <strong>Demo access</strong>
          </div>

          <p>
            This project is currently in development. For the best demo
            experience, sign in with Google. Password-based access is not
            currently available.
          </p>

          <p className='demo-access-hint'>
            If sign-in fails, check your browser's cookie settings or try
            another browser.
          </p>
        </div>

        <h2 className='auth-title'>Sign in</h2>

        {formError && (
          <p className='form-error' role='alert'>
            {formError}
          </p>
        )}

        <form className='auth-form' onSubmit={handleSubmit} noValidate>
          <div className='form-group'>
            <label className='form-label' htmlFor='login-identifier'>
              Email or username
            </label>
            <input
              id='login-identifier'
              className='form-input'
              type='text'
              autoComplete='username'
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                clearErrors();
              }}
              disabled={isSubmitting}
            />
            {fieldErrors.identifier && (
              <p className='field-error' role='alert'>
                {fieldErrors.identifier}
              </p>
            )}
          </div>

          <div className='form-group' style={{ position: "relative" }}>
            <label className='form-label' htmlFor='login-password'>
              Password
            </label>
            <div style={{ position: "relative", width: "100%" }}>
              <input
                id='login-password'
                className='form-input'
                type={showPassword ? "text" : "password"}
                autoComplete='current-password'
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearErrors();
                }}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  paddingRight: "44px",
                }}
                disabled={isSubmitting}
              />
              <button
                type='button'
                className='btn btn-secondary'
                style={{
                  fontSize: "0.75rem",
                  padding: "0.15rem 0.35rem",
                  position: "absolute",
                  right: "12px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
                disabled={isSubmitting}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className='field-error' role='alert'>
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button
            className='btn btn-primary'
            type='submit'
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className='auth-divider'>or</div>
        <GoogleAuthButton />

        <div className='auth-links'>
          <Link to='/forgot-password'>Forgot password?</Link>
          <Link to='/register'>Create an account</Link>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
