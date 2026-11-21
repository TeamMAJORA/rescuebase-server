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

describe("matchmakingService.calculateFactorSimilarity", () => {
    test("U-01 | Description: Trait equals the adopter's preference (3 vs 3) | Expected: Factor scores 1", () => {
        assert.equal(calculateFactorSimilarity(3, 3, "preference"), 1);
    });

    test("U-02 | Description: Trait is far from the preference (1 vs 5) | Expected: Factor scores 0", () => {
        assert.equal(calculateFactorSimilarity(1, 5, "preference"), 0);
    });

    test("U-03 | Description: Trait is two steps from the preference (2 vs 4) | Expected: Factor scores 0.5", () => {
        assert.equal(calculateFactorSimilarity(2, 4, "preference"), 0.5);
    });

    test("U-04 | Description: Pet trait is above the adopter's tolerance (4 vs 2) | Expected: Factor scores 0.5", () => {
        assert.equal(calculateFactorSimilarity(4, 2, "tolerance"), 0.5);
    });

    test("U-05 | Description: Pet trait is below the adopter's tolerance (2 vs 4) | Expected: Factor scores 1; no penalty", () => {
        assert.equal(calculateFactorSimilarity(2, 4, "tolerance"), 1);
    });

    test("U-06 | Description: Pet trait is 5 and the adopter's tolerance is 1 | Expected: Factor scores 0", () => {
        assert.equal(calculateFactorSimilarity(5, 1, "tolerance"), 0);
    });

    test("U-07 | Description: A trait value is missing or not a number | Expected: Factor is skipped (null)", () => {
        assert.equal(calculateFactorSimilarity(null, 3, "preference"), null);
        assert.equal(calculateFactorSimilarity("abc", 3, "preference"), null);
    });
});

describe("matchmakingService.calculateBehavioralScore", () => {
    test("U-08 | Description: Pet matches the adopter on all 8 factors | Expected: Score is 100", () => {
        const { score } = calculateBehavioralScore(
            buildAnimalWithAllScores(3),
            buildAdopterWithAllAnswers(3)
        );
        assert.equal(score, 100);
    });

    test("U-09 | Description: No factor can be used | Expected: Score is null", () => {
        const { score } = calculateBehavioralScore(
            buildAnimalWithAllScores(null),
            buildAdopterWithAllAnswers(3)
        );
        assert.equal(score, null);
    });
});

describe("matchmakingService.getMatchTier", () => {
    test("U-10 | Description: Scores on a tier boundary: 80, 79.99, 60, 59.99 | Expected: Perfect Paw Match, Paws for Thought, Paws for Thought, No Paw-sible Match", () => {
        assert.equal(getMatchTier(80), "Perfect Paw Match");
        assert.equal(getMatchTier(79.99), "Paws for Thought");
        assert.equal(getMatchTier(60), "Paws for Thought");
        assert.equal(getMatchTier(59.99), "No Paw-sible Match");
    });
});

describe("matchmakingService.matchesBasicPreferences", () => {
    test("U-11 | Description: Adopter filters the pets by type and size | Expected: Only pets of that type and size are kept", () => {
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

describe("matchmakingService.calculateAnimalMatch (AI service mocked)", () => {
    test("U-12 | Description: Pet has no conflict with the adopter | Expected: AI score 90 kept; Perfect Paw Match; eligible", async () => {
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

    test("U-13 | Description: Pet's aggression is above the adopter's tolerance | Expected: Score capped at 59.99; No Paw-sible Match; 1 aggression conflict", async () => {
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

    test("U-14 | Description: Pet has very high aggression and the adopter has children | Expected: Score capped at 59.99; 1 'children' conflict", async () => {
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

    test("U-15 | Description: AI service is down while matching | Expected: Score null; 'AI Prediction Unavailable'; not eligible", async () => {
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

    test("U-16 | Description: Pet has no behavior data | Expected: 'Insufficient Behavioral Data'; not eligible; AI is not called", async () => {
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
