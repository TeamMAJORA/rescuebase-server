
const { getGlobalSettings } = require("./globalSettings");

function isStrongPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /\d/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
}

async function validatePassword(password) {
    const settings = await getGlobalSettings();

    if (settings.security.requireStrongPasswords) {
        if (!isStrongPassword(password)) {
            const error = new Error(
                "Password must be at least 8 characters and include uppercase, lowercase, number, and special character."
            );
            error.statusCode = 400;
            throw error;
        }
    } else if (
        typeof password !== "string" ||
        password.length < 6
    ) {
        const error = new Error(
            "Password must be at least 6 characters."
        );
        error.statusCode = 400;
        throw error;
    }
}

module.exports = {
    isStrongPassword,
    validatePassword,
};
