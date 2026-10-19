import { Resend } from "resend";
import env from "../../config/env.js";

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;

const sendVerificationOtp = async ({ email, otp }) => {
  if (!resend) {
    throw new Error("Resend API key not configured — email delivery unavailable");
  }
  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: "GoD of NOTES — Verification Code",
    text: `Your verification code is: ${otp}\nThis code expires in 10 minutes.`,
  }).catch((e) => ({ error: e }));
  if (result && result.error) {
    const msg = result.error?.message || String(result.error);
    throw new Error(`Resend delivery failed: ${msg}`);
  }
  if (!result || !result.data) {
    throw new Error("Resend delivery failed: no response data");
  }
};

const sendPasswordResetEmail = async ({ email, resetToken }) => {
  if (!resend) {
    throw new Error("Resend API key not configured — email delivery unavailable");
  }
  const baseUrl = env.frontendUrl || "";
  const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;
  const result = await resend.emails.send({
    from: "onboarding@resend.dev",
    to: email,
    subject: "GoD of NOTES — Password Reset",
    text: `You requested a password reset. Use this link within 15 minutes:\n${resetLink}\nIf you did not request this, ignore this email.`,
  }).catch((e) => ({ error: e }));
  if (result && result.error) {
    const msg = result.error?.message || String(result.error);
    throw new Error(`Resend delivery failed: ${msg}`);
  }
  if (!result || !result.data) {
    throw new Error("Resend delivery failed: no response data");
  }
};

export { sendVerificationOtp, sendPasswordResetEmail, resend as _resendClient };
