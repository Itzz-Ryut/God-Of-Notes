import { Router } from "express";
import {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleLogin,
  googleCallback,
  logout,
} from "./auth.controller.js";

import { googleEnabled } from "./google.service.js";

import authenticate from "../../middleware/authenticate.js";
import {   
  loginRateLimit,
  registerRateLimit,
  otpRateLimit,
  resendOtpRateLimit,
  forgotPasswordRateLimit,
  resetPasswordRateLimit,
  googleRateLimit, } from "../../middleware/ratelimit.js";

const router = Router();

router.post("/register",registerRateLimit, register);
router.post("/login",loginRateLimit, login);
router.post("/verify-email",otpRateLimit, verifyEmail);
router.post("/resend-verification",resendOtpRateLimit, resendVerification);

router.post("/forgot-password",forgotPasswordRateLimit, forgotPassword); 
router.post("/reset-password",resetPasswordRateLimit, resetPassword);

router.post("/logout",logout);

if (googleEnabled) {
  router.get("/google",googleRateLimit, googleLogin);
  router.get("/google/callback",googleRateLimit, googleCallback);
}


export default router;