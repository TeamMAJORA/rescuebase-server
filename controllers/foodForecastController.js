const foodForecastService = require("../services/FoodForecastService");

exports.getFoodForecast = async (req, res) => {
    const forecast = await foodForecastService.getFoodForecast();

    return res.status(200).json({
        success: true,
        ...forecast,
    });
};