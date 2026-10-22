
const Animal = require("../models/Animal");

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

exports.getIntakeForecast = async () => {
    const now = new Date();

    // The model requires 12 chronological months, including this month.
    const firstMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)
    );

    const nextMonth = getNextMonth(now);

    const months = Array.from({ length: SEQUENCE_LENGTH }, (_, index) => {
        const date = new Date(
            Date.UTC(
                firstMonth.getUTCFullYear(),
                firstMonth.getUTCMonth() + index,
                1
            )
        );

        return createMonth(date);
    });

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
    };
};
