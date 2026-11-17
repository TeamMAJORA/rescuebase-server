const { describe, test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const {
    calculateFactorSimilarity,
    calculateBehavioralScore,
    calculateAnimalMatch,
    matchesBasicPreferences,
    getMatchTier,
} = require("../services/matchmakingService");

const ANIMAL_FIELDS = [
    "energyLevel",
    "friendliness",
    "humanSociability",
    "animalSociability",
    "trainability",
    "anxietyLevel",
    "aggressionLevel",
    "activityLevel",
];

const ADOPTER_FIELDS = [
    "energyPreference",
    "friendlinessPreference",
    "humanSociabilityPreference",
    "animalSociabilityPreference",
    "trainabilityPreference",
    "anxietyTolerance",
    "aggressionTolerance",
    "activityPreference",
];

function buildAnimalWithAllScores(score, overrides = {}) {
    const animal = { _id: "animal-1", name: "Test Animal" };
    for (const field of ANIMAL_FIELDS) animal[field] = score;
    return { ...animal, ...overrides };
}

function buildAdopterWithAllAnswers(answer, overrides = {}) {
    const adopter = {};
    for (const field of ADOPTER_FIELDS) adopter[field] = answer;
    return { ...adopter, ...overrides };
}

function mockAiServiceReturningPercentage(percentage) {
    return mock.method(globalThis, "fetch", async () => ({
        ok: true,
        json: async () => ({
            compatibilityScore: percentage / 100,
            percentage,
            tier: "Perfect Paw Match",
        }),
    }));
}

afterEach(() => {
    mock.restoreAll();
});

describe("Table 35 - matchmakingService.calculateFactorSimilarity", () => {
    test("U-01 preference, identical values", () => {
        assert.equal(calculateFactorSimilarity(3, 3, "preference"), 1);
    });

    test("U-02 preference, far apart", () => {
        assert.equal(calculateFactorSimilarity(1, 5, "preference"), 0);
    });

    test("U-03 preference, two apart", () => {
        assert.equal(calculateFactorSimilarity(2, 4, "preference"), 0.5);
    });

    test("U-04 tolerance, animal above limit", () => {
        assert.equal(calculateFactorSimilarity(4, 2, "tolerance"), 0.5);
    });

    test("U-05 tolerance, animal below limit costs nothing", () => {
        assert.equal(calculateFactorSimilarity(2, 4, "tolerance"), 1);
    });

    test("U-06 tolerance, maximum overshoot", () => {
        assert.equal(calculateFactorSimilarity(5, 1, "tolerance"), 0);
    });

    test("U-07 missing or non-numeric value is skipped", () => {
        assert.equal(calculateFactorSimilarity(null, 3, "preference"), null);
        assert.equal(calculateFactorSimilarity("abc", 3, "preference"), null);
    });
});

describe("Table 35 - matchmakingService.calculateBehavioralScore", () => {
    test("U-08 perfect match on all 8 factors", () => {
        const { score } = calculateBehavioralScore(
            buildAnimalWithAllScores(3),
            buildAdopterWithAllAnswers(3)
        );
        assert.equal(score, 100);
    });

    test("U-09 no usable factors", () => {
        const { score } = calculateBehavioralScore(
            buildAnimalWithAllScores(null),
            buildAdopterWithAllAnswers(3)
        );
        assert.equal(score, null);
    });
});

describe("Table 35 - matchmakingService.getMatchTier", () => {
    test("U-10 tier boundaries", () => {
        assert.equal(getMatchTier(80), "Perfect Paw Match");
        assert.equal(getMatchTier(79.99), "Paws for Thought");
        assert.equal(getMatchTier(60), "Paws for Thought");
        assert.equal(getMatchTier(59.99), "No Paw-sible Match");
    });
});

describe("Table 35 - matchmakingService.matchesBasicPreferences", () => {
    test("U-11 type and size filter", () => {
        const dogAndSmallAdopter = { preferredPetType: "Dog", preferredSize: "Small" };

        assert.equal(
            matchesBasicPreferences({ type: "Cat", size: "Small" }, dogAndSmallAdopter),
            false
        );
        assert.equal(
            matchesBasicPreferences({ type: "Dog", size: "Large" }, dogAndSmallAdopter),
            false
        );
        assert.equal(
            matchesBasicPreferences(
                { type: "Dog", size: "Large" },
                { preferredPetType: "Any", preferredSize: "Any" }
            ),
            true
        );
    });
});

describe("Table 35 - matchmakingService.calculateAnimalMatch (AI service mocked)", () => {
    test("U-12 no conflict keeps the AI score", async () => {
        mockAiServiceReturningPercentage(90);

        const match = await calculateAnimalMatch(
            buildAnimalWithAllScores(3),
            buildAdopterWithAllAnswers(3)
        );

        assert.equal(match.score, 90);
        assert.equal(match.tier, "Perfect Paw Match");
        assert.equal(match.eligible, true);
        assert.deepEqual(match.criticalConflicts, []);
    });

    test("U-13 aggression above tolerance caps the score", async () => {
        mockAiServiceReturningPercentage(90);

        const match = await calculateAnimalMatch(
            buildAnimalWithAllScores(3, { aggressionLevel: 4 }),
            buildAdopterWithAllAnswers(3, { aggressionTolerance: 3 })
        );

        assert.equal(match.score, 59.99);
        assert.equal(match.tier, "No Paw-sible Match");
        assert.equal(match.criticalConflicts.length, 1);
        assert.match(match.criticalConflicts[0], /aggression/i);
    });

    test("U-14 very high aggression with children caps the score", async () => {
        mockAiServiceReturningPercentage(90);

        // Tolerance 5 so the only conflict is the children rule.
        const match = await calculateAnimalMatch(
            buildAnimalWithAllScores(3, { aggressionLevel: 5 }),
            buildAdopterWithAllAnswers(3, {
                aggressionTolerance: 5,
                hasChildren: "Yes",
            })
        );

        assert.equal(match.score, 59.99);
        assert.equal(match.criticalConflicts.length, 1);
        assert.match(match.criticalConflicts[0], /children/i);
    });

    test("U-15 AI service down gives no score", async () => {
        mock.method(console, "error", () => {});
        mock.method(globalThis, "fetch", async () => {
            throw new Error("connect ECONNREFUSED");
        });

        const match = await calculateAnimalMatch(
            buildAnimalWithAllScores(3),
            buildAdopterWithAllAnswers(3)
        );

        assert.equal(match.score, null);
        assert.equal(match.tier, "AI Prediction Unavailable");
        assert.equal(match.eligible, false);
    });

    test("U-16 missing behavior data never calls the AI", async () => {
        const fetchMock = mockAiServiceReturningPercentage(90);

        const match = await calculateAnimalMatch(
            buildAnimalWithAllScores(null),
            buildAdopterWithAllAnswers(3)
        );

        assert.equal(match.tier, "Insufficient Behavioral Data");
        assert.equal(match.eligible, false);
        assert.equal(fetchMock.mock.callCount(), 0);
    });
});
