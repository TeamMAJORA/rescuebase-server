
const intakeForecastService = require("../services/intakeForecastService");

exports.getIntakeForecast = async (req, res) => {
    try {
        const forecast = await intakeForecastService.getIntakeForecast();

        console.log("[Intake Forecast] Response keys:", Object.keys(forecast));
        console.log(
            "[Intake Forecast] Has foodStorage:",
            Object.prototype.hasOwnProperty.call(forecast, "foodStorage")
        );

        return res.status(200).json(forecast);
    } catch (error) {
        console.error("[Intake Forecast] Error:", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Failed to generate intake forecast.",
        });
    }
};
