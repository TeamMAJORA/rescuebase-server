const Animal = require("../models/Animal");
const FoodInventory = require("../models/FoodInventory");

const ML_SERVICE_URL = (process.env.ML_SERVICE_URL || "http://127.0.0.1:8000").replace(/\+$/, "");

const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN || "";

const FEATURES = [
    "intake",
    "adoptions",
    "releases",
    "month_sin",
    "month_cos",
];

const SEQUENCE_LENGTH = 12;

function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
    ).padStart(2, "0")}`;
}

function createMonth(date) {
    const monthNumber = date.getUTCMonth() + 1;
    const angle = (2 * Math.PI * monthNumber) / 12;

    return {
        month: monthKey(date),
        intake: 0,
        adoptions: 0,
        releases: 0,
        month_sin: Math.sin(angle),
        month_cos: Math.cos(angle),
    };

}

function getNextMonth(date) {
    return new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    );
}

function formatMonth(date) {
    return {
        month: monthKey(date),
        label: date.toLocaleString("en-US", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
        }),
    };
}

function round(value, decimals = 2) {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

async function requestPrediction(history) {
    const headers = {
        "Content-Type": "application/json",
    };

    if (ML_SERVICE_TOKEN) {
        headers["X-Service-Token"] = ML_SERVICE_TOKEN;
    }

    let response;

    try {
        response = await fetch(`${ML_SERVICE_URL}/predict/intake`, {
            method: "POST",
            headers,
            body: JSON.stringify({ history }),
            signal: AbortSignal.timeout(15000),
        });
    } catch (error) {
        const serviceError = new Error(
            "Unable to connect to the intake forecasting service."
        );
        serviceError.statusCode = 502;
        throw serviceError;
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
        console.error("[Intake Forecast] ML service error:", body);

        const error = new Error(
            "The intake forecasting service rejected the request."
        );
        error.statusCode = 502;
        throw error;
    }

    if (
        body.success !== true ||
        typeof body.predictedIntake !== "number" ||
        !Number.isFinite(body.predictedIntake)
    ) {
        const error = new Error(
            "The intake forecasting service returned an invalid prediction."
        );
        error.statusCode = 502;
        throw error;
    }

    return body;

}

async function buildFoodForecast(predictedIntake) {
    const [inventory, animals] = await Promise.all([
        FoodInventory.find()
            .select(
                "name quantityInStock unit foodRatePerAnimalPerDay forecastDays"
            )
            .sort({ name: 1 })
            .lean(),

        Animal.find({
            intakeStatus: "approved",
        })
            .select("adoptionStatus")
            .lean(),
    ]);

    const currentOccupancy = animals.filter(
        (animal) => animal.adoptionStatus !== "adopted"
    ).length;

    const expectedIntake = Math.max(0, predictedIntake);

    const projectedOccupancy = Math.max(
        0,
        currentOccupancy + expectedIntake
    );

    const foodForecasts = inventory.map((item) => {
        const stock = Math.max(0, Number(item.quantityInStock) || 0);
        const foodRate = Math.max(
            0,
            Number(item.foodRatePerAnimalPerDay ?? 0.5)
        );
        const forecastDays = Math.max(
            1,
            Number(item.forecastDays) || 30
        );

        const dailyRequirement = projectedOccupancy * foodRate;
        const forecastRequirement = dailyRequirement * forecastDays;
        const foodBalance = stock - forecastRequirement;

        const coverageDays =
            dailyRequirement > 0 ? stock / dailyRequirement : null;

        let status = "Sufficient";

        if (dailyRequirement > 0 && coverageDays < forecastDays) {
            status = "Food Shortage";
        }

        return {
            inventoryId: item._id,
            foodName: item.name,
            unit: item.unit || "kg",

            currentStock: round(stock),
            foodRatePerAnimalPerDay: foodRate,
            forecastDays,

            currentOccupancy,
            predictedIntake: round(predictedIntake),
            projectedOccupancy: round(projectedOccupancy),

            dailyRequirement: round(dailyRequirement),
            forecastRequirement: round(forecastRequirement),
            foodBalance: round(foodBalance),

            coverageDays:
                coverageDays === null ? null : round(coverageDays),

            shortageDays:
                coverageDays === null
                    ? null
                    : round(Math.max(0, forecastDays - coverageDays)),

            status,
        };
    });

    return {
        generatedAt: new Date().toISOString(),
        currentOccupancy,
        predictedIntake: round(predictedIntake),
        projectedOccupancy: round(projectedOccupancy),

        inventoryItems: foodForecasts.length,
        foodForecasts,

        overallStatus:
            foodForecasts.length === 0
                ? "No Inventory"
                : foodForecasts.some(
                    (item) => item.status === "Food Shortage"
                )
                    ? "Food Shortage"
                    : "Sufficient",

        assumptions: [
            "Food requirements use the LSTM predicted intake for the target month.",
            "Projected occupancy equals current occupancy plus predicted intake.",
            "Adoptions and releases are not subtracted from projected occupancy because reliable future event forecasts are unavailable.",
            "Food consumption uses the rate configured for each inventory item.",
            "Current occupancy is estimated from approved, non-adopted animal records.",
            "Food coverage assumes the recorded stock is available for consumption.",
        ],
    };

}

exports.getIntakeForecast = async () => {
    const now = new Date();

    const firstMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
    );

    const nextMonth = getNextMonth(now);

    const months = Array.from(
        { length: SEQUENCE_LENGTH },
        (_, index) => {
            const date = new Date(
                Date.UTC(
                    firstMonth.getUTCFullYear(),
                    firstMonth.getUTCMonth() + index,
                    1
                )
            );

            return createMonth(date);
        }
    );

    const monthMap = new Map(
        months.map((month) => [month.month, month])
    );

    const animals = await Animal.find({
        intakeStatus: "approved",
        $or: [
            {
                intakeDate: {
                    $gte: firstMonth,
                    $lt: nextMonth,
                },
            },
            {
                adoptionStatus: "adopted",
                updatedAt: {
                    $gte: firstMonth,
                    $lt: now,
                },
            },
        ],
    })
        .select("intakeDate adoptionStatus updatedAt")
        .lean();

    for (const animal of animals) {
        if (animal.intakeDate) {
            const intakeDate = new Date(animal.intakeDate);

            if (intakeDate >= firstMonth && intakeDate < nextMonth) {
                const month = monthMap.get(monthKey(intakeDate));

                if (month) {
                    month.intake += 1;
                }
            }
        }

        if (animal.adoptionStatus === "adopted" && animal.updatedAt) {
            const adoptionDate = new Date(animal.updatedAt);

            if (adoptionDate >= firstMonth && adoptionDate < now) {
                const month = monthMap.get(monthKey(adoptionDate));

                if (month) {
                    month.adoptions += 1;
                }
            }
        }
    }

    for (const month of months) {
        month.releases = 0;
    }

    const history = months.map((month) =>
        FEATURES.map((feature) => month[feature])
    );

    const prediction = await requestPrediction(history);

    const target = formatMonth(nextMonth);
    const currentMonth = months[months.length - 1];

    const daysInCurrentMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)
    ).getUTCDate();

    const foodStorage = await buildFoodForecast(
        prediction.predictedIntake
    );

    return {
        success: true,
        generatedAt: now.toISOString(),
        model: "RESCUEBASE_LSTM_INTAKE",

        target: {
            month: target.month,
            label: target.label,
            predictedIntake: prediction.predictedIntake,
            roundedPredictedIntake:
                prediction.roundedPredictedIntake ??
                Math.round(prediction.predictedIntake),
            unit: "animals",
        },

        history: months,

        dataQuality: {
            monthsProvided: months.length,
            currentMonthIsPartial: now.getUTCDate() < daysInCurrentMonth,
            adoptionCountsAreApproximate: true,
            releaseCountsAreUnavailable: true,
            warnings: [
                "The current month's intake data may be incomplete.",
                "Adoption counts use Animal.updatedAt because no dedicated adoption-completion date is stored.",
                "Release counts are zero because no dedicated release-event source is available.",
                "The model was trained on monthly counts; an incomplete current month may reduce forecast reliability.",
                "Predictions are estimates, not guaranteed counts.",
            ],
        },

        foodStorage,
    };

};