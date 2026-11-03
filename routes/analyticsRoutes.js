
const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const analyticsController = require("../controllers/analyticsController");
const intakeForecastController = require("../controllers/intakeForecastController");
const foodForecastController = require("../controllers/foodForecastController");

router.get(
    "/overview",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(analyticsController.getOverview)
);

router.get(
    "/intake-forecast",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(intakeForecastController.getIntakeForecast)
);

router.get(
    "/food-forecast",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(foodForecastController.getFoodForecast)
);

module.exports = router;
