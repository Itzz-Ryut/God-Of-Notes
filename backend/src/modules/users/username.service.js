import { findUsernamesLike } from "./users.repository.js";

import { sanitizeUsernameBase, buildUsernameCandidate } from "./username.js";

const generateUniqueUsername = async (email, db) => {
  const base = sanitizeUsernameBase(email);

  const usernames = await findUsernamesLike(base, db);

  const used = new Set(usernames);

  if (!used.has(base)) {
    return base;
  }

  for (let suffix = 1; suffix <= 999999; suffix++) {
    const candidate = buildUsernameCandidate(base, suffix);

    if (!used.has(candidate)) {
      return candidate;
    }
  }

  throw new Error("Unable to generate unique username");
};

export { generateUniqueUsername };
