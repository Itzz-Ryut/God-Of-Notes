import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Configure the "standard" environment, but deliberately leave the Google
// credentials absent to exercise the unconfigured path. Setting empty strings
// (rather than deleting) prevents dotenv (loaded by env.js) from re-populating
// the Google variables from the repository .env file.
process.env.GOOGLE_CLIENT_ID = "";
process.env.GOOGLE_CLIENT_SECRET = "";
process.env.GOOGLE_REDIRECT_URI = "";
process.env.DATABASE_URL = "postgres://test:test@localhost:5432/testdb";
process.env.JWT_SECRET = "test-jwt-secret";

const google = await import("./google.service.js");

describe("Google OAuth (unconfigured)", () => {
  it("disables OAuth when Google credentials are absent", () => {
    assert.equal(google.googleEnabled, false);
    assert.equal(google.googleClient, null);
  });

  it("getGoogleAuthorizationUrl throws a clear error", () => {
    assert.throws(
      () => google.getGoogleAuthorizationUrl("state"),
      /Google OAuth is not configured on this server/,
    );
  });

  it("getGoogleUser throws a clear error", async () => {
    await assert.rejects(
      () => google.getGoogleUser("code"),
      /Google OAuth is not configured on this server/,
    );
  });
});
