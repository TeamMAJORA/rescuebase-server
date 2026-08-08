const suspiciousStatus = new Set([
    401, 403, 404, 409, 429
]);

module.exports = function securityGuard(req, res, next) {
    const startTime = Date.now();

    res.on("finish", () => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;

        if (!suspiciousStatus.has(status)) {
            return;
        }

        const ip = req.ip || req.socket?.remoteAddress || "unknown";

        console.warn({
            ip,
            method: req.method,
            path: req.originalUrl,
            status,
            duration,
            userId: req.user?.id || null,
            role: req.user?.role || null,
            timestamp:
                new Date().toISOString(),
        });
    });

    next();
}