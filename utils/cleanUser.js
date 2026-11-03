function cleanUser(user) {
    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.emailOtp;
    delete userObject.emailOtpExpires;
    delete userObject.emailOtpAttempts;
    delete userObject.loginOtp;
    delete userObject.loginOtpExpires;
    delete userObject.loginOtpAttempts;
    delete userObject.loginOtpLockedUntil;
    delete userObject.passwordResetToken;
    delete userObject.passwordResetExpires;

    return userObject;
}

module.exports = cleanUser;