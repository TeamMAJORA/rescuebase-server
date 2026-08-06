module.exports = (...allowedRoles) => {
    const roles = allowedRoles.map(
        (role) => String(role).toLowerCase()
    );

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success : false,
                message : "Unauthorized.",
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success : false,
                message : "You do not have permission to perform this action."
            });
        }

        next();
    };
};