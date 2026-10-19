import { describe, it } from "node:test";
import assert from "node:assert";
import env from "../../config/env.js";

let sendCalls = [];

const mockSend = async (payload) => {
  sendCalls.push(payload);
  return { data: { id: "test-id-" + Date.now() }, error: null };
};

describe("email.service with mocked Resend", () => {
  it("sends verification OTP with expiry text and correct sender", async () => {
    sendCalls = [];
    env.resendApiKey = "test-key";
    const mod = await import("./email.service.js?test=" + Date.now());
    if (mod._resendClient && mod._resendClient.emails) {
      mod._resendClient.emails.send = mockSend;
    }
    await mod.sendVerificationOtp({ email: "test@example.com", otp: "123456" });
    assert.strictEqual(sendCalls.length, 1);
    const p = sendCalls[0];
    assert.strictEqual(p.from, "onboarding@resend.dev");
    assert.strictEqual(p.to, "test@example.com");
    assert.ok(p.subject.includes("Verification"));
    assert.ok(p.text.includes("123456"));
    assert.ok(p.text.includes("10 minutes"));
  });

  it("constructs reset link using FRONTEND_URL and token query param", async () => {
    sendCalls = [];
    env.frontendUrl = "https://app.example.com";
    env.resendApiKey = "test-key";
    const mod = await import("./email.service.js?test2=" + Date.now());
    if (mod._resendClient && mod._resendClient.emails) {
      mod._resendClient.emails.send = mockSend;
    }
    await mod.sendPasswordResetEmail({ email: "t@e.co", resetToken: "abc123" });
    assert.strictEqual(sendCalls.length, 1);
    const p = sendCalls[0];
    assert.strictEqual(p.from, "onboarding@resend.dev");
    assert.strictEqual(p.to, "t@e.co");
    assert.ok(p.text.includes("https://app.example.com/reset-password?token=abc123"));
  });

  it("propagates provider errors when Resend returns error", async () => {
    sendCalls = [];
    env.resendApiKey = "test-key";
    const mod = await import("./email.service.js?test3=" + Date.now());
    if (mod._resendClient && mod._resendClient.emails) {
      mod._resendClient.emails.send = async () => ({ data: null, error: { message: "provider down" } });
    }
    await assert.rejects(
      async () => mod.sendVerificationOtp({ email: "a@b.co", otp: "000000" }),
      /provider down/
    );
  });

  it("fails clearly when RESEND_API_KEY missing", async () => {
    const prev = env.resendApiKey;
    env.resendApiKey = null;
    const mod = await import("./email.service.js?test4=" + Date.now());
    await assert.rejects(
      async () => mod.sendVerificationOtp({ email: "a@b.co", otp: "000000" }),
      /not configured/
    );
    if (prev !== undefined) env.resendApiKey = prev;
  });
});
