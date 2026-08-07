/*
    Generic request validation middleware (BETA)
*/
module.exports = function validateRequest(requiredFields = []) {
    return (req, res, next) => {
        if (!req.body || typeof req.body !== "object") {
            return res.status(400).json({
                success: false,
                message: "Request body is required.",
            });
        }

        const missingFields = [];

        for (const field of requiredFields) {
            const vaule = req.body[field];

            if (value === undefined ||
                value === null ||
                String(value).trim() === ""
            ) {
                missingFields.push(field);
            }
        }

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message : "Validation failed.",
                missingFields,
            });
        }
        next();
    }
}