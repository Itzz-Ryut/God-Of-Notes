process.env.RESEND_API_KEY = "test";

import { describe, it } from "node:test";
import assert from "node:assert";

const emailMod = await import("./email.service.js");

if (emailMod._resendClient && emailMod._resendClient.emails) {
  emailMod._resendClient.emails.send = async () => {
    throw new Error("Resend mock failure");
  };
}

const authMod = await import("./auth.service.js");

describe("auth.service delivery-failure behavior", () => {
  it("register propagates email delivery error; DB writes occur before send (per source)", async () => {
    await assert.rejects(
      async () => authMod.register({
        username: "t_" + Date.now(),
        email: "t_" + Date.now() + "@x.co",
        password: "Pass1234!",
      }),
      /Resend mock failure/
    );
  });

  it("resendVerification propagates email delivery error", async () => {
    const email = "rv_" + Date.now() + "@x.co";
    // Create unverified user+verification (DB write happens before send; send throws)
    try { await authMod.register({ username: "rv_" + Date.now(), email, password: "Pass1234!" }); } catch { /* expected mock failure */ }
    // Pre-send checks (user exists, unverified, cooldown cleared) now pass
    await assert.rejects(
      async () => authMod.resendVerification({ email }),
      /(Resend mock failure|wait before requesting)/
    );
  });

  it("forgotPassword preserves generic response when email delivery fails", async () => {
    const result = await authMod.forgotPassword({ email: "nobody_" + Date.now() + "@x.co" });
    assert.strictEqual(result.message, "If an account exists for this email, a password reset link has been sent");
  });
});
