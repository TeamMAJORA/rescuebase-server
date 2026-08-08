module.exports = (...allowedRoles) => {
    const roles = allowedRoles
        .map((role) =>
            String(role).trim().toLowerCase()
        )
        .filter(Boolean);

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
            });
        }

        if (roles.length === 0) {
            console.error(
                "authorizeRoles: No allowed roles were provided."
            );

            return res.status(500).json({
                success: false,
                message: "Authorization configuration error.",
            });
        }

        const currentRole = String(
            req.user.role || ""
        )
            .trim()
            .toLowerCase();

        if (!currentRole) {
            return res.status(403).json({
                success: false,
                message: "User role is missing.",
            });
        }

        if (!roles.includes(currentRole)) {
            return res.status(403).json({
                success: false,
                message:
                    "You do not have permission to perform this action.",
            });
        }

        next();
    };
};