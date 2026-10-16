const sanitizeUsernameBase = (email) => {
  const localPart = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

  const base = localPart.slice(0, 30);

  return base || "user";
};

const buildUsernameCandidate = (
  base,
  suffix
) => {
  if (suffix === 0) {
    return base.slice(0, 30);
  }

  return `${base.slice(
    0,
    30 - String(suffix).length
  )}${suffix}`;
};

export {
  sanitizeUsernameBase,
  buildUsernameCandidate,
};