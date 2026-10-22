
const intakeForecastService = require("../services/intakeForecastService");

exports.getIntakeForecast = async (req, res) => {
    try {
        const forecast = await intakeForecastService.getIntakeForecast();

        return res.status(200).json(forecast);
    } catch (error) {
        console.error("[Intake Forecast]", error);

        return res.status(error.statusCode || 500).json({
            success: false,
            message:
                error.statusCode === 502
                    ? "The intake forecasting service is unavailable."
                    : "Failed to generate the intake forecast.",
        });
    }
};
