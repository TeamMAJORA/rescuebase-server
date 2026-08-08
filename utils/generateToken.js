const jwt = require("jsonwebtoken");

function generateToken(user) {
    if (!user) {
        throw new Error("User information is required to generate a auth token.");
    }

    if (!process.env.JWT_SECRET) {
        throw new Error("JWT_SECRET is not configured.");
    }

    const payload = {
        id: user._id.toString(),
        email: user.email,
        role: String(user.role).toLowerCase(),
    }

    return jwt.sign(payload, process.env.JWT_SECRET,
        {
            expiresIn: "2h",
            issuer: "RescueBase",
            audience: "rescuebase-client"
        }
    );
}

module.exports = generateToken;