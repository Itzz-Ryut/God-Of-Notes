import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Configure the "Google OAuth enabled" environment before importing the module,
// because google.service.js reads these variables at module load time.
process.env.GOOGLE_CLIENT_ID = "test-client-id";
process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:5000/api/auth/google/callback";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-jwt-secret";

const google = await import("./google.service.js");

describe("Google OAuth (configured)", () => {
  it("enables OAuth only when all three Google environment variables are set", () => {
    assert.equal(google.googleEnabled, true);
  });

  it("constructs the OAuth2 client when Google is enabled", () => {
    assert.ok(google.googleClient !== null);
    assert.equal(typeof google.googleClient.generateAuthUrl, "function");
  });

  it("getGoogleAuthorizationUrl returns a Google authorization URL", () => {
    const url = google.getGoogleAuthorizationUrl("state");

    assert.equal(typeof url, "string");
    assert.match(url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth/);
    assert.match(url, /client_id=test-client-id/);
    assert.match(url, /scope=openid%20email%20profile/);
  });

  it("getGoogleUser rejects when no authorization code is provided", async () => {
    await assert.rejects(
      () => google.getGoogleUser(undefined),
      /authorization code is required/,
    );
  });
});
