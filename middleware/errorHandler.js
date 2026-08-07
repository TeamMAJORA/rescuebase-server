module.exports = function errorHandler(error, req, res, next) {
    console.error("===SERVER ERROR===");
    console.error(error);
    console.error("==================");

    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
        success: false,
        message: error.message || "An expected error has occured."
    });
};