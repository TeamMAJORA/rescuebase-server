const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const {
    calculateDistanceKm,
    calculateMatchScore,
} = require("../services/lostFoundMatchingService");

const MINIMUM_MATCH_SCORE = 45;

const CEBU_CITY_HALL = { latitude: 10.2926, longitude: 123.9026 };
const MACTAN_CEBU_AIRPORT = { latitude: 10.3075, longitude: 123.9794 };

function buildFoundDogReport() {
    return {
        reportType: "found",
        species: "dog",
        breed: "Aspin",
        colour: "brown",
        size: "medium",
        sex: "male",
        description: "brown aspin with a red collar",
        eventDate: "2026-11-10",
        coordinates: CEBU_CITY_HALL,
    };
}

describe("Table 35 - lostFoundMatchingService", () => {
    test("U-22 distance is 0 for the same point and plausible for two Cebu points", () => {
        const samePoint = calculateDistanceKm(
            { coordinates: CEBU_CITY_HALL },
            { coordinates: CEBU_CITY_HALL }
        );
        assert.equal(samePoint, 0);

        // City Hall to Mactan-Cebu airport is roughly 8.5 km in a straight line.
        const cebuDistance = calculateDistanceKm(
            { coordinates: CEBU_CITY_HALL },
            { coordinates: MACTAN_CEBU_AIRPORT }
        );
        assert.ok(
            cebuDistance > 8 && cebuDistance < 9.5,
            `expected about 8.5 km, got ${cebuDistance}`
        );
    });

    test("U-23 same species, colour and location scores high; dog vs cat is not a match", () => {
        const lostDog = {
            ...buildFoundDogReport(),
            reportType: "lost",
            coordinates: { latitude: 10.2931, longitude: 123.9029 },
        };

        const matchingResult = calculateMatchScore(buildFoundDogReport(), lostDog);
        assert.ok(matchingResult, "expected a result for the matching pair");
        assert.ok(
            matchingResult.score >= 90,
            `expected a high score, got ${matchingResult.score}`
        );

        const lostCat = { ...lostDog, species: "cat" };
        const differentSpeciesResult = calculateMatchScore(buildFoundDogReport(), lostCat);
        assert.ok(
            differentSpeciesResult === null ||
                differentSpeciesResult.score < MINIMUM_MATCH_SCORE
        );
    });
});
