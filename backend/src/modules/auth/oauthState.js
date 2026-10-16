import crypto from "crypto";

const OAUTH_STATE_BYTES = 32;

const generateOAuthState = () => {
  return crypto
    .randomBytes(OAUTH_STATE_BYTES)
    .toString("hex");
};

export default generateOAuthState;