import crypto from "node:crypto";

const hashSecret = (value) => {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
};

export default hashSecret;