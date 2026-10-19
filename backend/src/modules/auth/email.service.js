import { Resend } from "resend";
import env from "../../config/env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

const logSafe = (stage, correlationId, extra = {}) => {
  const { stage: _, operation: op, ...rest } = extra;
  console.log(JSON.stringify({
    service: "email",
    stage,
    correlationId,
    timestamp: new Date().toISOString(),
    ...(op ? { operation: op } : {}),
    ...rest,
  }));
};

const sendVerificationOtp = async ({ email, otp, correlationId = "none" }) => {
  if (!resend) {
    throw new Error("Resend API key not configured — email delivery unavailable");
  }
  logSafe("email-send-entered", correlationId, { provider: "resend", operation: "sendVerificationOtp" });
  const start = Date.now();
  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: "GoD of NOTES — Verification Code",
    text: `Your verification code is: ${otp}\nThis code expires in 10 minutes.`,
  }).catch((e) => ({ error: e }));
  const durationMs = Date.now() - start;
  if (result && result.error) {
    const safeCode = result.error?.statusCode || result.error?.name || "unknown";
    logSafe("email-send-failed", correlationId, { provider: "resend", operation: "sendVerificationOtp", durationMs, providerStatusCode: safeCode, delivered: false, emailId: null });
    throw new Error(`Resend delivery failed: provider status ${safeCode}`);
  }
  if (!result || !result.data) {
    logSafe("email-send-failed", correlationId, { provider: "resend", operation: "sendVerificationOtp", durationMs, providerStatusCode: "no_data", delivered: false, emailId: null });
    throw new Error("Resend delivery failed: no response data");
  }
  logSafe("email-send-completed", correlationId, { provider: "resend", operation: "sendVerificationOtp", durationMs, delivered: true, emailId: result.data?.id || null });
};

const sendPasswordResetEmail = async ({ email, resetToken, correlationId = "none" }) => {
  if (!resend) {
    throw new Error("Resend API key not configured — email delivery unavailable");
  }
  logSafe("email-send-entered", correlationId, { provider: "resend", operation: "sendPasswordResetEmail" });
  const start = Date.now();
  const baseUrl = env.frontendUrl || "";
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: "GoD of NOTES — Password Reset",
    text: `You requested a password reset. Use this link within 15 minutes:\n${resetLink}\nIf you did not request this, ignore this email.`,
  }).catch((e) => ({ error: e }));
  const durationMs = Date.now() - start;
  if (result && result.error) {
    const safeCode = result.error?.statusCode || result.error?.name || "unknown";
    logSafe("email-send-failed", correlationId, { provider: "resend", operation: "sendPasswordResetEmail", durationMs, providerStatusCode: safeCode, delivered: false, emailId: null });
    throw new Error(`Resend delivery failed: provider status ${safeCode}`);
  }
  if (!result || !result.data) {
    logSafe("email-send-failed", correlationId, { provider: "resend", operation: "sendPasswordResetEmail", durationMs, providerStatusCode: "no_data", delivered: false, emailId: null });
    throw new Error("Resend delivery failed: no response data");
  }
  logSafe("email-send-completed", correlationId, { provider: "resend", operation: "sendPasswordResetEmail", durationMs, delivered: true, emailId: result.data?.id || null });
};

export { sendVerificationOtp, sendPasswordResetEmail, resend as _resendClient };
