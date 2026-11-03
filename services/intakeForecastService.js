const mongoose = require("mongoose");
const Animal = require("../models/Animal");
const FoodInventory = require("../models/FoodInventory");

const ML_SERVICE_URL = (
    process.env.ML_SERVICE_URL || "http://127.0.0.1:8000"
).replace(/\/+$/, "");

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

async function buildFoodForecast(predictedIntake, generatedAt) {
    const [inventory, animals] = await Promise.all([
        FoodInventory.find()
            .select(
                "name quantityInStock unit foodRatePerAnimalPerDay forecastDays"
            )
            .sort({ name: 1 })
            .lean(),

        Animal.find({ intakeStatus: "approved" })
            .select("adoptionStatus")
            .lean(),
    ]);

    console.log("[Food Forecast] DB:", mongoose.connection.name);
    console.log("[Food Forecast] Collection:", FoodInventory.collection.name);
    console.log("[Food Forecast] Query returned:", inventory.length);
    console.log("[Food Forecast] Items:", inventory);

    const currentOccupancy = animals.filter(
        (animal) => animal.adoptionStatus !== "adopted"
    ).length;

    const expectedIntake = Math.max(0, predictedIntake);
    const projectedOccupancy = currentOccupancy + expectedIntake;

    const foodForecasts = inventory.map((item) => {
        const currentStock = Math.max(
            0,
            Number(item.quantityInStock) || 0
        );

        const foodRatePerAnimalPerDay = Math.max(
            0,
            Number(item.foodRatePerAnimalPerDay) || 0
        );

        const forecastDays = Math.max(
            1,
            Math.floor(Number(item.forecastDays) || 30)
        );

        const dailyRequirement =
            projectedOccupancy * foodRatePerAnimalPerDay;

        const forecastRequirement = dailyRequirement * forecastDays;
        const foodBalance = currentStock - forecastRequirement;

        const coverageDays =
            dailyRequirement > 0
                ? currentStock / dailyRequirement
                : null;

        const shortageDays =
            dailyRequirement > 0
                ? Math.max(0, forecastDays - (coverageDays || 0))
                : 0;

        const status =
            dailyRequirement > 0 && coverageDays < forecastDays
                ? "Food Shortage"
                : "Sufficient";

        return {
            inventoryId: item._id,
            foodName: item.name,
            unit: item.unit || "kg",

            currentStock: round(currentStock),
            foodRatePerAnimalPerDay: round(foodRatePerAnimalPerDay),
            forecastDays,

            currentOccupancy,
            predictedIntake: round(expectedIntake),
            projectedOccupancy: round(projectedOccupancy),

            dailyRequirement: round(dailyRequirement),
            forecastRequirement: round(forecastRequirement),
            foodBalance: round(foodBalance),

            coverageDays:
                coverageDays === null ? null : round(coverageDays),
            shortageDays: round(shortageDays),

            status,
        };
    });

    const overallStatus =
        foodForecasts.length === 0
            ? "No Inventory"
            : foodForecasts.some(
                (item) => item.status === "Food Shortage"
            )
                ? "Food Shortage"
                : "Sufficient";

    return {
        generatedAt,
        currentOccupancy,
        predictedIntake: round(expectedIntake),
        projectedOccupancy: round(projectedOccupancy),
        inventoryItems: foodForecasts.length,
        foodForecasts,
        overallStatus,
        assumptions: [
            "Projected occupancy equals current approved, non-adopted animals plus predicted intake.",
            "Predicted intake is treated as additional animals for the occupancy estimate.",
            "Food requirements assume the configured feeding rate remains constant for every animal.",
            "Forecast duration uses each inventory item's forecastDays, defaulting to 30 days.",
            "Food stock is evaluated independently for each inventory item.",
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
        prediction.predictedIntake,
        now.toISOString()
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
            currentMonthIsPartial:
                now.getUTCDate() < daysInCurrentMonth,
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
