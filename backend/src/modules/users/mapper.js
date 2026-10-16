const toPublicUser = (user) => {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.email_verified,
    identityColor: user.identity_color,
  };
};

const toLookupUser = (user) => {
  return {
    id: user.id,
    username: user.username,
    identityColor: user.identity_color,
  };
};

export {
  toPublicUser,
  toLookupUser,
};