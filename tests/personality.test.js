const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const { derivePersonality } = require("../services/personalityService");

describe("personalityService.derivePersonality", () => {
    test("U-17 | Description: Animal has no behavior scores. | Expected: Shown as unassessed with no tags.", () => {
        const personality = derivePersonality({ name: "No Scores" });

        assert.equal(personality.status, "unassessed");
        assert.deepEqual(personality.tags, []);
    });

    test("U-18 | Description: Animal has all 8 behavior scores. | Expected: Shown as complete with tags.", () => {
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
