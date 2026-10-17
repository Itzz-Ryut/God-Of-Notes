import { OAuth2Client } from "google-auth-library";

import env from "../../config/env.js";

const googleClientId = env.googleClientId;
const googleClientSecret = env.googleClientSecret;
const googleRedirectUri = env.googleRedirectUri;

const googleEnabled = Boolean(
  googleClientId && googleClientSecret && googleRedirectUri,
);

let googleClient = null;

if (googleEnabled) {
  googleClient = new OAuth2Client(
    googleClientId,
    googleClientSecret,
    googleRedirectUri,
  );
}

const getGoogleAuthorizationUrl = (state) => {
  if (!googleEnabled) {
    throw new Error("Google OAuth is not configured on this server.");
  }
  if (!googleClient) {
    throw new Error("Google OAuth client is not initialised.");
  }
  return googleClient.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
};

const getGoogleUser = async (code) => {
  if (!googleEnabled) {
    throw new Error("Google OAuth is not configured on this server.");
  }
  if (!code) {
    throw new Error("Google authorization code is required");
  }
  const { tokens } = await googleClient.getToken(code);

  if (!tokens.id_token) {
    throw new Error("Google did not return an ID token");
  }
  googleClient.setCredentials(tokens);

  const ticket = await googleClient.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.googleClientId,
  });

  const payload = ticket.getPayload();

  if (    
    !payload ||
    !payload.sub ||
    !payload.email
  ) {
    throw new Error("Google identity information is unavailable");
  }

  return {
    googleSub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    displayName: payload.name ?? null,
    avatarUrl: payload.picture ?? null,
  };
};

export { googleClient, getGoogleAuthorizationUrl, getGoogleUser, googleEnabled };
