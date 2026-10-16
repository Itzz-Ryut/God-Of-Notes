const ACCESS_TOKEN_COOKIE = "access_token";

const getAccessTokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 15 * 60 * 1000,
  path: "/",
});

const setAccessTokenCookie = (res, accessToken) => {
  res.cookie(
    ACCESS_TOKEN_COOKIE,
    accessToken,
    getAccessTokenCookieOptions(),
  );
};

const clearAccessTokenCookie = (res) => {
  res.clearCookie(
    ACCESS_TOKEN_COOKIE,
    getAccessTokenCookieOptions(),
  );
};

export {
  ACCESS_TOKEN_COOKIE,
  setAccessTokenCookie,
  clearAccessTokenCookie,
};