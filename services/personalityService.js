// The 8 scores used by the assessment and the matching AI
const SCORE_FIELDS = [
    "energyLevel",
    "friendliness",
    "humanSociability",
    "animalSociability",
    "trainability",
    "anxietyLevel",
    "aggressionLevel",
    "activityLevel",
];

// One rule = one tag. A tag is given only if its score exists and passes the test.
const PERSONALITY_RULES = [
    { label: "Well-trained", field: "trainability", test: (score) => score >= 4 },
    { label: "Gentle", field: "aggressionLevel", test: (score) => score <= 2 },
    { label: "Calm", field: "energyLevel", test: (score) => score <= 2 },
    { label: "Energetic", field: "energyLevel", test: (score) => score >= 4 },
    { label: "Needs patience", field: "anxietyLevel", test: (score) => score >= 4 },
    { label: "Friendly", field: "humanSociability", test: (score) => score >= 4 },
    { label: "Pet-friendly", field: "animalSociability", test: (score) => score >= 4 },
];

// A valid score is a number from 1 to 5.
// null / undefined / "" are NOT scores. This stops an unassessed
// animal from passing "aggression <= 2" and being tagged Gentle.
function isValidScore(value) {
    return typeof value === "number" && value >= 1 && value <= 5;
}

function toPlainObject(animal) {
    if (!animal) return {};
    return typeof animal.toObject === "function"
        ? animal.toObject()
        : animal;
}

/**
 * derivePersonality(animal)
 * @returns {{ tags: string[], status: "complete"|"partial"|"unassessed", summary: string|null }}
 */
function derivePersonality(animal) {
    const data = toPlainObject(animal);

    const assessedCount = SCORE_FIELDS.filter((field) =>
        isValidScore(data[field])
    ).length;

    let status = "complete";
    if (assessedCount === 0) status = "unassessed";
    else if (assessedCount < SCORE_FIELDS.length) status = "partial";

    const tags = PERSONALITY_RULES
        .filter((rule) => isValidScore(data[rule.field]) && rule.test(data[rule.field]))
        .map((rule) => rule.label);

    const summary = String(data.behaviorNotes || "").trim() || null;

    return { tags, status, summary };
}

/**
 * withPersonality(animal)
 * Returns a plain copy of the animal with a "personality" field added.
 * Use this on everything the API sends back.
 */
function withPersonality(animal) {
    if (!animal) return animal;

    const data = toPlainObject(animal);

    return {
        ...data,
        personality: derivePersonality(data),
    };
}

module.exports = {
    SCORE_FIELDS,
    PERSONALITY_RULES,
    derivePersonality,
    withPersonality,
};
