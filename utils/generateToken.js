
const jwt = require("jsonwebtoken");

function generateToken(user, sessionTimeoutMinutes = 120) {
    if (!user) {
        throw new Error("User information is required to generate an auth token.");
    }

    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured.");
    }

    const timeout = Number(sessionTimeoutMinutes);

    if (!Number.isInteger(timeout) || timeout < 5 || timeout > 10080) {
        throw new Error(
            "Session timeout must be an integer between 5 and 10080 minutes."
        );
    }

    const payload = {
        id: user._id.toString(),
        email: user.email,
        role: String(user.role).toLowerCase(),
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: `${timeout}m`,
        issuer: "RescueBase",
        audience: "rescuebase-client",
    });
}

module.exports = generateToken;
