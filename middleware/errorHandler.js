module.exports = function errorHandler(error, req, res, next) {
    // A malformed ID in the URL (e.g. /api/users/abc) is the caller's mistake, not a server crash
    if (error.name === "CastError" && error.kind === "ObjectId") {
        return res.status(400).json({
            success: false,
            message: "Invalid ID.",
        });
    }

    console.error("===SERVER ERROR===");
    console.error(error);
    console.error("==================");

    // Mongoose validation (missing or invalid fields) is a bad request, not a server error
    const statusCode = error.statusCode || (error.name === "ValidationError" ? 400 : 500);

    return res.status(statusCode).json({
        success: false,
        message: error.message || "An unexpected error occurred.",
    });
};
