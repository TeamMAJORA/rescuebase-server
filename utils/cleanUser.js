function cleanUser(user) {
    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.emailOtp;
    delete userObject.emailOtpExpires;
    delete userObject.emailOtpAttempts;

    return userObject;
}

module.exports = cleanUser;