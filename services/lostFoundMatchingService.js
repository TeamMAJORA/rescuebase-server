const LostFoundReport = require("../models/LostFoundReport");
const LostFoundMatch = require("../models/LostFoundMatch");

const MATCH_WEIGHTS = {
    species: 0.20,
    breed: 0.10,
    colour: 0.20,
    size: 0.10,
    sex: 0.10,
    distance: 0.15,
    date: 0.10,
    description: 0.05,
};

const MINIMUM_MATCH_SCORE = 45;
const MAX_MATCHES_PER_REPORT = 10;
const MAX_SEARCH_DISTANCE_KM = 50;
const MAX_DATE_DIFFERENCE_DAYS = 90;

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ");
}

function tokenize(value) {
    return new Set(
        normalize(value)
            .split(" ")
            .filter((word) => word.length > 1)
    );
}

function textSimilarity(first, second) {
    const a = normalize(first);
    const b = normalize(second);

    if (!a || !b) return null;
    if (a === b) return 1;

    const firstTokens = tokenize(a);
    const secondTokens = tokenize(b);

    if (!firstTokens.size || !secondTokens.size) {
        return 0;
    }

    const intersection = [...firstTokens].filter(
        (word) => secondTokens.has(word)
    ).length;

    const union = new Set([
        ...firstTokens,
        ...secondTokens,
    ]).size;

    return intersection / union;
}

function exactSimilarity(first, second) {
    const a = normalize(first);
    const b = normalize(second);

    if (!a || !b) return null;

    return a === b ? 1 : 0;
}

function calculateDistanceKm(first, second) {
    const firstCoordinates = first.coordinates;
    const secondCoordinates = second.coordinates;

    if (
        !firstCoordinates ||
        !secondCoordinates ||
        !Number.isFinite(firstCoordinates.latitude) ||
        !Number.isFinite(firstCoordinates.longitude) ||
        !Number.isFinite(secondCoordinates.latitude) ||
        !Number.isFinite(secondCoordinates.longitude)
    ) {
        return null;
    }

    const radians = (degrees) => degrees * (Math.PI / 180);

    const earthRadiusKm = 6371;

    const latitudeDifference = radians(
        secondCoordinates.latitude -
        firstCoordinates.latitude
    );

    const longitudeDifference = radians(
        secondCoordinates.longitude -
        firstCoordinates.longitude
    );

    const latitude1 = radians(firstCoordinates.latitude);
    const latitude2 = radians(secondCoordinates.latitude);

    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(latitude1) *
        Math.cos(latitude2) *
        Math.sin(longitudeDifference / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return earthRadiusKm * c;
}

function calculateDistanceSimilarity(distance) {
    if (distance === null) return null;

    if (distance >= MAX_SEARCH_DISTANCE_KM) {
        return 0;
    }

    return 1 - distance / MAX_SEARCH_DISTANCE_KM;
}

function calculateDateSimilarity(first, second) {
    const firstDate = first.eventDate || first.dateReported;
    const secondDate = second.eventDate || second.dateReported;

    if (!firstDate || !secondDate) return null;

    const differenceDays = Math.abs(
        new Date(firstDate).getTime() -
        new Date(secondDate).getTime()
    ) / (1000 * 60 * 60 * 24);

    if (!Number.isFinite(differenceDays)) return null;

    if (differenceDays >= MAX_DATE_DIFFERENCE_DAYS) {
        return 0;
    }

    return 1 - differenceDays / MAX_DATE_DIFFERENCE_DAYS;
}

function calculateMatchScore(first, second) {
    if (
        normalize(first.reportType) ===
        normalize(second.reportType)
    ) {
        return null;
    }

    const speciesSimilarity = exactSimilarity(
        first.species,
        second.species
    );

    if (speciesSimilarity !== 1) {
        return null;
    }

    const distance = calculateDistanceKm(first, second);

    const factors = {
        species: speciesSimilarity,
        breed: textSimilarity(first.breed, second.breed),
        colour: textSimilarity(first.colour, second.colour),
        size: exactSimilarity(first.size, second.size),
        sex: exactSimilarity(first.sex, second.sex),
        distance: calculateDistanceSimilarity(distance),
        date: calculateDateSimilarity(first, second),
        description: textSimilarity(
            first.description,
            second.description
        ),
    };

    let weightedScore = 0;
    let appliedWeight = 0;

    for (const [factor, weight] of Object.entries(MATCH_WEIGHTS)) {
        const similarity = factors[factor];

        if (
            similarity === null ||
            !Number.isFinite(similarity)
        ) {
            continue;
        }

        weightedScore += similarity * weight;
        appliedWeight += weight;
    }

    if (appliedWeight === 0) return null;

    const score = Number(
        ((weightedScore / appliedWeight) * 100).toFixed(2)
    );

    return {
        score,
        distanceKm: distance === null
            ? null
            : Number(distance.toFixed(2)),
        factors,
    };
}

function createPairKey(firstId, secondId) {
    return [String(firstId), String(secondId)]
        .sort()
        .join(":");
}

async function generateMatches(reportId) {
    const report = await LostFoundReport.findById(reportId);

    if (!report) {
        throw new Error("Lost and Found report not found.");
    }

    if (report.status !== "open") {
        return {
            success: true,
            matchesCreated: 0,
            message: "Report is not open for matching.",
        };
    }

    const oppositeType =
        report.reportType === "lost" ? "found" : "lost";

    const possibleReports = await LostFoundReport.find({
        reportType: oppositeType,
        status: "open",
        _id: { $ne: report._id },
    })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean();

    const candidates = [];

    for (const candidate of possibleReports) {
        if (
            candidate.reporterEmail &&
            report.reporterEmail &&
            candidate.reporterEmail.toLowerCase() ===
            report.reporterEmail.toLowerCase()
        ) {
            continue;
        }

        const result = calculateMatchScore(report, candidate);

        if (
            !result ||
            result.score < MINIMUM_MATCH_SCORE
        ) {
            continue;
        }

        candidates.push({
            candidate,
            ...result,
        });
    }

    candidates.sort((a, b) => b.score - a.score);

    const selectedCandidates = candidates.slice(
        0,
        MAX_MATCHES_PER_REPORT
    );

    let matchesCreated = 0;

    for (const candidate of selectedCandidates) {
        const pairKey = createPairKey(
            report._id,
            candidate.candidate._id
        );

        const existingMatch = await LostFoundMatch.findOne({
            pairKey,
        });

        if (existingMatch) {
            // Never overwrite a previous staff decision.
            if (existingMatch.status !== "suggested") {
                continue;
            }

            existingMatch.score = candidate.score;
            existingMatch.factors = {
                ...candidate.factors,
                distanceKm: candidate.distanceKm,
            };

            await existingMatch.save();
        } else {
            try {
                await LostFoundMatch.create({
                    reportA: report._id,
                    reportB: candidate.candidate._id,
                    pairKey,
                    score: candidate.score,
                    factors: {
                        ...candidate.factors,
                        distanceKm: candidate.distanceKm,
                    },
                    status: "suggested",
                    suggestedBy: "system",
                });
            } catch (error) {
                if (error.code === 11000) {
                    continue;
                }

                throw error;
            }
        }

        matchesCreated++;

        await LostFoundReport.updateMany(
            {
                _id: {
                    $in: [
                        report._id,
                        candidate.candidate._id,
                    ],
                },
                matchStatus: "none",
            },
            {
                $set: {
                    matchStatus: "suggested",
                },
            }
        );
    }

    return {
        success: true,
        matchesCreated,
        candidatesFound: candidates.length,
    };
}

module.exports = {
    generateMatches,
    calculateMatchScore,
    calculateDistanceKm,
    MATCH_WEIGHTS,
};