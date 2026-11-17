const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { derivePersonality } = require("../services/personalityService");

describe("Table 35 - personalityService.derivePersonality", () => {
    test("U-17 animal with no scores is unassessed and gets no tags", () => {
        const personality = derivePersonality({ name: "No Scores" });

        assert.equal(personality.status, "unassessed");
        assert.deepEqual(personality.tags, []);
    });

    test("U-18 animal with all scores is complete and tagged only where a rule passes", () => {
        const personality = derivePersonality({
            energyLevel: 1,
            friendliness: 3,
            humanSociability: 5,
            animalSociability: 2,
            trainability: 5,
            anxietyLevel: 1,
            aggressionLevel: 1,
            activityLevel: 3,
        });

        assert.equal(personality.status, "complete");
        assert.deepEqual(personality.tags, [
            "Well-trained",
            "Gentle",
            "Calm",
            "Friendly",
        ]);
    });
});
