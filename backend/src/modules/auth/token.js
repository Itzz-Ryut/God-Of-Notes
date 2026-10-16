import jwt from "jsonwebtoken";
import env from "../../config/env.js";

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      sub: user.id,
    },
    env.jwtSecret,
    {
      expiresIn: env.jwtExpiresIn,
    }
  );
};

export default generateAccessToken;