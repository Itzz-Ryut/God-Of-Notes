import withTransaction from "../../database/transaction.js";

import AppError from "../../errors/AppError.js";
import ERROR_CODES from "../../errors/errorCodes.js";

import {
  findUserById,
  findUserByEmail,
  createUser,
  createGoogleAccount,
  findGoogleAccountBySub,
} from "./auth.repository.js";

import generateIdentityColor from "../users/identityColor.js";
import generateAccessToken from "./token.js";

import { getGoogleUser } from "./google.service.js";

import { toPublicUser } from "../users/mapper.js";

import { generateUniqueUsername } from "../users/username.service.js";

const handleGoogleCallback = async (code) => {
  if (!code) {
    throw new AppError(
      400,
      ERROR_CODES.INVALID_GOOGLE_AUTH_CODE,
      "Google authorization code is required",
    );
  }

  let googleUser;

  try {
    googleUser = await getGoogleUser(code);
  } catch (error) {
    console.log("GOOGLE ERROR: ", error);

    throw new AppError(
      401,
      ERROR_CODES.INVALID_GOOGLE_IDENTITY,
      "Unable to authenticate with Google",
    );
  }

  if (!googleUser.googleSub || !googleUser.email) {
    throw new AppError(
      401,
      ERROR_CODES.INVALID_GOOGLE_IDENTITY,
      "Unable to authenticate with Google",
    );
  }

  if (!googleUser.emailVerified) {
    throw new AppError(
      403,
      ERROR_CODES.EMAIL_NOT_VERIFIED,
      "Google email is not verified",
    );
  }

  // 1. Existing Google account
  const existingGoogleAccount =
    await findGoogleAccountBySub(
      googleUser.googleSub,
    );

  if (existingGoogleAccount) {
    const user = await findUserById(
      existingGoogleAccount.user_id,
    );

    if (!user) {
      throw new AppError(
        401,
        ERROR_CODES.INVALID_GOOGLE_IDENTITY,
        "Unable to authenticate with Google",
      );
    }

    const accessToken =
      generateAccessToken(user);

    return {
      user: toPublicUser(user),
      accessToken,
    };
  }

  // 2. Existing application user
  const normalizedEmail =
    googleUser.email.toLowerCase();

  const existingUser =
    await findUserByEmail(
      normalizedEmail,
    );

  if (existingUser) {
    await withTransaction(async (client) => {
      await createGoogleAccount(
        {
          userId: existingUser.id,
          googleSub: googleUser.googleSub,
          googleEmail: googleUser.email,
          displayName: googleUser.displayName,
          avatarUrl: googleUser.avatarUrl,
        },
        client,
      );
    });

    const accessToken =
      generateAccessToken(existingUser);

    return {
      user: toPublicUser(existingUser),
      accessToken,
    };
  }

  // 3. Completely new Google user
  const user =
    await createGoogleUser(googleUser);

  const accessToken =
    generateAccessToken(user);

  return {
    user: toPublicUser(user),
    accessToken,
  };
};


const createGoogleUser = async (googleUser) => {
  const user =
    await withTransaction(async (client) => {
      const username =
        await generateUniqueUsername(
          googleUser.email,
          client,
        );

      const createdUser =
        await createUser(
          {
            username,
            email:
              googleUser.email.toLowerCase(),
            identityColor:
              generateIdentityColor(),
            emailVerified: true,
          },
          client,
        );

      await createGoogleAccount(
        {
          userId: createdUser.id,
          googleSub:
            googleUser.googleSub,
          googleEmail:
            googleUser.email,
          displayName:
            googleUser.displayName,
          avatarUrl:
            googleUser.avatarUrl,
        },
        client,
      );

      return createdUser;
    });

  return user;
};


export {
  handleGoogleCallback,
  createGoogleUser,
};