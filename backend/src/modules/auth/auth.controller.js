import asyncHandler from "../../middleware/asyncHandler.js";
import * as authService from "./auth.service.js";

import { getGoogleAuthorizationUrl } from "./google.service.js";

import * as googleAuthService from "./google.auth.service.js";

import generateOAuthState from "./oauthState.js";

import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import env from "../../config/env.js";
import { setAccessTokenCookie, clearAccessTokenCookie, } from "./auth.cookie.js";

import { log } from "console";

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);

  res.status(201).json(result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);

  setAccessTokenCookie(
    res,
    result.accessToken,
  )

  res.status(200).json({
    user: result.user,
  });
});

const verifyEmail = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.body);

  res.status(200).json(result);
});

const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification(req.body);

  res.status(200).json(result);
});

const forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);

  res.status(200).json(result);
});

const resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);

  res.status(200).json(result);
});

const googleLogin = asyncHandler(async (req, res) => {
  const state = generateOAuthState();

  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
  });
  
  const url = getGoogleAuthorizationUrl(state);
  res.redirect(url);
});

const googleCallback = asyncHandler(
  async (req, res) => {
    const { code, state } = req.query;
    const storedState = req.cookies.oauth_state;

    if (
      !state ||
      !storedState ||
      state !== storedState
    ) {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_GOOGLE_OAUTH_STATE,
        "Unable to authenticate with Google",
      );
    }

    res.clearCookie(
      "oauth_state",
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    );

    const result =
      await googleAuthService.handleGoogleCallback(
        code,
      );

    setAccessTokenCookie(
      res,
      result.accessToken,
    )

    res.redirect(env.frontendUrl);
  },
);

const logout = asyncHandler(async (req, res) => {
  clearAccessTokenCookie(res);
  
  res.status(200).json({
    status: "ok",
    message: "Logged out successfully",
  });
});

export {
  register,
  login,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  googleLogin,
  googleCallback,
  logout,
};
