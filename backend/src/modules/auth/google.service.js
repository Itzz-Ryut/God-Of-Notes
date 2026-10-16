import { OAuth2Client } from "google-auth-library";

import env from "../../config/env.js";

const googleClient = new OAuth2Client(
  env.googleClientId,
  env.googleClientSecret,
  env.googleRedirectUri,
);

const getGoogleAuthorizationUrl = (state) => {
  return googleClient.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
};

const getGoogleUser = async (code) => {
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

export { googleClient, getGoogleAuthorizationUrl, getGoogleUser };
