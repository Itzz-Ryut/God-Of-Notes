const sendVerificationOtp = async ({
  email,
  otp,
}) => {
  console.log(
    `[DEV] Verification OTP for ${email}: ${otp}`
  );
};

const sendPasswordResetEmail = async ({
  email,
  resetToken,
}) => {
  console.log(
    `[DEV] Password reset token for ${email}: ${resetToken}`
  );
};

export {
  sendVerificationOtp, sendPasswordResetEmail
};