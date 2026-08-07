module.exports = (...allowedRoles) => {

    const roles = allowedRoles.map((role) =>
        String(role).trim().toLowerCase()
    );

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        const currentRole = String(req.user.role || "").trim().toLowerCase();

        if (!roles.includes(currentRole)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action.",
            });
        }

        next();
    };
};