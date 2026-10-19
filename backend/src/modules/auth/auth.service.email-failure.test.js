process.env.RESEND_API_KEY = "test";

import { describe, it, before, after } from "node:test";
import assert from "node:assert";

const emailMod = await import("./email.service.js");
const authMod = await import("./auth.service.js");

let originalSend;
let originalConsoleLog;

describe("email diagnostic (isolated, no production DB required)", () => {
  before(() => {
    originalSend = emailMod._resendClient ? emailMod._resendClient.emails.send : null;
    originalConsoleLog = console.log;
  });

  after(() => {
    if (originalSend && emailMod._resendClient && emailMod._resendClient.emails) {
      emailMod._resendClient.emails.send = originalSend;
    }
    console.log = originalConsoleLog;
  });

  it("sendVerificationOtp accepts correlationId and logs safe stages", async () => {
    const logs = [];
    console.log = (...args) => logs.push(args);
    emailMod._resendClient.emails.send = async () => ({ data: { id: "diag-id" } });
    await emailMod.sendVerificationOtp({ email: "test@x.co", otp: "123456", correlationId: "diag-1" });
    console.log = originalConsoleLog;
    const text = logs.map((a) => (typeof a[0] === "string" ? a[0] : JSON.stringify(a))).join(" ");
    assert.ok(text.includes("diag-1"), "correlationId should appear in email-service log");
    assert.ok(text.includes("delivered"), "delivered status should be logged");
  });

  it("sendVerificationOtp throws sanitized error without exposing provider message", async () => {
    const secretMessage = "SECRET_PROVIDER_ERROR_42";
    emailMod._resendClient.emails.send = async () => ({ error: { statusCode: 401, name: "validation_error", message: secretMessage } });
    let thrownMsg = "";
    try {
      await emailMod.sendVerificationOtp({ email: "t@x.co", otp: "000000", correlationId: "diag-2" });
    } catch (e) {
      thrownMsg = e.message || "";
    }
    assert.ok(!thrownMsg.includes(secretMessage), "raw provider message must not reach thrown error");
    assert.ok(thrownMsg.includes("provider status"), "sanitized status code should appear");
  });

  it("resendVerification accepts correlationId second param (signature only, pre-send lookup fails)", async () => {
    await assert.rejects(
      async () => authMod.resendVerification({ email: "no-such-user@x.co" }, "diag-corr-3"),
      /Unable to process verification request/
    );
  });

  it("forgotPassword preserves generic response when user missing (no DB mutation asserted)", async () => {
    emailMod._resendClient.emails.send = async () => ({ error: { statusCode: 500, name: "internal_error" } });
    const result = await authMod.forgotPassword({ email: "no-such-user@x.co" });
    assert.strictEqual(result.message, "If an account exists for this email, a password reset link has been sent");
  });
});
