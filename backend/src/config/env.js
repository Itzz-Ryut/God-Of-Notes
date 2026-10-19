import "dotenv/config";

const requiredEnv = (name) => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const env = {
  port: Number(process.env.PORT) || 5000,

  databaseUrl: requiredEnv("DATABASE_URL"),

  jwtSecret: requiredEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",

  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || null,
  frontendUrl: process.env.FRONTEND_URL,
  resendApiKey: process.env.RESEND_API_KEY || null,

  // 17.8 Phase 6: how often the background scheduler runs the 7-day orphan
  // cleanup. Optional — falls back to once every 24 hours.
  orphanCleanupIntervalMs:
    Number(process.env.ORPHAN_CLEANUP_INTERVAL_MS) || 86_400_000,
};

export default env;