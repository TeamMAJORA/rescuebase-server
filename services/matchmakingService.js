const AI_SERVICE_URL =
    process.env.BEHAVIORAL_AI_URL || "http://127.0.0.1:8001";

const FACTOR_CONFIG = {
    energy: {
        weight: 0.12,
        animalField: "energyLevel",
        adopterField: "energyPreference",
        type: "preference",
    },

    friendliness: {
        weight: 0.10,
        animalField: "friendliness",
        adopterField: "friendlinessPreference",
        type: "preference",
    },

    humanSociability: {
        weight: 0.14,
        animalField: "humanSociability",
        adopterField: "humanSociabilityPreference",
        type: "preference",
    },

    animalSociability: {
        weight: 0.12,
        animalField: "animalSociability",
        adopterField: "animalSociabilityPreference",
        type: "preference",
    },

    trainability: {
        weight: 0.10,
        animalField: "trainability",
        adopterField: "trainabilityPreference",
        type: "preference",
    },

    anxiety: {
        weight: 0.14,
        animalField: "anxietyLevel",
        adopterField: "anxietyTolerance",
        type: "tolerance",
    },

    aggression: {
        weight: 0.18,
        animalField: "aggressionLevel",
        adopterField: "aggressionTolerance",
        type: "tolerance",
    },

    activity: {
        weight: 0.10,
        animalField: "activityLevel",
        adopterField: "activityPreference",
        type: "preference",
    },
};

function calculateFactorSimilarity(animalValue, adopterValue, type) {
    if (
        animalValue === null ||
        animalValue === undefined ||
        adopterValue === null ||
        adopterValue === undefined
    ) {
        return null;
    }

    const animalScore = Number(animalValue);
    const adopterScore = Number(adopterValue);

    if (
        !Number.isFinite(animalScore) ||
        !Number.isFinite(adopterScore)
    ) {
        return null;
    }

    if (type === "tolerance") {
        return Math.max(
            0,
            1 - Math.max(0, animalScore - adopterScore) / 4
        );
    }

    return Math.max(
        0,
        1 - Math.abs(animalScore - adopterScore) / 4
    );
}

function getMatchTier(score) {
    if (score >= 80) {
        return "Perfect Paw Match";
    }

    if (score >= 60) {
        return "Paws for Thought";
    }

    return "No Paw-sible Match";
}

function checkCriticalConflicts(animal, adopter) {
    const conflicts = [];

    const aggressionLevel = Number(animal.aggressionLevel);
    const aggressionTolerance = Number(adopter.aggressionTolerance);

    const anxietyLevel = Number(animal.anxietyLevel);
    const anxietyTolerance = Number(adopter.anxietyTolerance);

    if (
        Number.isFinite(aggressionLevel) &&
        Number.isFinite(aggressionTolerance) &&
        aggressionLevel > aggressionTolerance
    ) {
        conflicts.push(
            "The animal's aggression level exceeds the adopter's stated tolerance."
        );
    }

    if (
        Number.isFinite(anxietyLevel) &&
        Number.isFinite(anxietyTolerance) &&
        anxietyLevel > anxietyTolerance
    ) {
        conflicts.push(
            "The animal's anxiety level exceeds the adopter's stated tolerance."
        );
    }

    if (
        adopter.hasChildren === "Yes" &&
        Number.isFinite(aggressionLevel) &&
        aggressionLevel >= 5
    ) {
        conflicts.push(
            "The animal has a very high aggression level while children are present."
        );
    }

    return conflicts;
}

function calculateBehavioralScore(animal, adopter) {
    let weightScore = 0;
    let totalAppliedWeight = 0;

    const factorResults = {};

    for (const [factorName, config] of Object.entries(FACTOR_CONFIG)) {
        const animalValue = animal[config.animalField];
        const adopterValue = adopter[config.adopterField];

        const similarity = calculateFactorSimilarity(
            animalValue,
            adopterValue,
            config.type
        );

        factorResults[factorName] = {
            animalValue: animalValue ?? null,
            adopterValue: adopterValue ?? null,
            similarity:
                similarity === null
                    ? null
                    : Number(similarity.toFixed(4)),
            weight: config.weight,
        };

        if (similarity === null) {
            continue;
        }

        weightScore += config.weight * similarity;
        totalAppliedWeight += config.weight;
    }

    if (totalAppliedWeight === 0) {
        return {
            score: null,
            factorResults,
        };
    }

    const normalizedScore =
        (weightScore / totalAppliedWeight) * 100;

    return {
        score: Number(normalizedScore.toFixed(2)),
        factorResults,
    };
}

function hasCompleteBehavioralData(animal) {
    return Object.values(FACTOR_CONFIG).every((config) => {
        const value = animal[config.animalField];

        return (
            value !== null &&
            value !== undefined &&
            Number.isFinite(Number(value))
        );
    });
}

async function getAIPrediction(animal, adopter) {
    if (!hasCompleteBehavioralData(animal)) {
        return null;
    }

    const requestBody = {
        animal: {
            energyLevel: Number(animal.energyLevel),
            friendliness: Number(animal.friendliness),
            humanSociability: Number(animal.humanSociability),
            animalSociability: Number(animal.animalSociability),
            trainability: Number(animal.trainability),
            anxietyLevel: Number(animal.anxietyLevel),
            aggressionLevel: Number(animal.aggressionLevel),
            activityLevel: Number(animal.activityLevel),
        },

        adopter: {
            energyPreference: Number(adopter.energyPreference),
            friendlinessPreference: Number(adopter.friendlinessPreference),
            humanSociabilityPreference: Number(adopter.humanSociabilityPreference),
            animalSociabilityPreference: Number(adopter.animalSociabilityPreference),
            trainabilityPreference: Number(adopter.trainabilityPreference),
            anxietyTolerance: Number(adopter.anxietyTolerance),
            aggressionTolerance: Number(adopter.aggressionTolerance),
            activityPreference: Number(adopter.activityPreference),
        },
    };

    try {
        const response = await fetch(
            `${AI_SERVICE_URL}/predict`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(requestBody),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();

            throw new Error(
                `AI service returned ${response.status}: ${errorText}`
            );
        }

        const result = await response.json();

        return {
            score: Number(result.compatibilityScore ?? 0) * 100,
            percentage: Number(result.percentage ?? 0),
            tier: result.tier ?? "No Paw-sible Match",
        };
    } catch (error) {
        console.error(
            "Behavioral AI service error:",
            error.message
        );

        return null;
    }
}

async function calculateAnimalMatch(animal, adopter) {
    const {
        score: formulaScore,
        factorResults,
    } = calculateBehavioralScore(animal, adopter);

    if (formulaScore === null) {
        return {
            animalId: animal._id,
            animalName: animal.name,
            score: null,
            formulaScore: null,
            aiScore: null,
            tier: "Insufficient Behavioral Data",
            factorResults,
            criticalConflicts: [],
            eligible: false,
        };
    }

    const aiPrediction = await getAIPrediction(
        animal,
        adopter
    );

    if (aiPrediction === null) {
        return {
            animalId: animal._id,
            animalName: animal.name,
            score: null,
            formulaScore: Number(formulaScore.toFixed(2)),
            aiScore: null,
            tier: "AI Prediction Unavailable",
            factorResults,
            criticalConflicts: [],
            eligible: false,
        };
    }

    let finalScore = aiPrediction.percentage;

    const criticalConflicts = checkCriticalConflicts(
        animal,
        adopter
    );

    if (
        criticalConflicts.length > 0 &&
        finalScore >= 60
    ) {
        finalScore = 59.99;
    }

    return {
        animalId: animal._id,
        animalName: animal.name,
        score: Number(finalScore.toFixed(2)),
        formulaScore: Number(formulaScore.toFixed(2)),
        aiScore: Number(aiPrediction.percentage.toFixed(2)),
        aiTier: aiPrediction.tier,
        tier: getMatchTier(finalScore),
        factorResults,
        criticalConflicts,
        eligible: true,
    };
}

function matchesBasicPreferences(animal, adopter) {
    if (
        adopter.preferredPetType &&
        adopter.preferredPetType !== "Any" &&
        animal.type !== adopter.preferredPetType
    ) {
        return false;
    }

    if (
        adopter.preferredSize &&
        adopter.preferredSize !== "Any" &&
        animal.size !== adopter.preferredSize
    ) {
        return false;
    }

    return true;
}

async function generateMatches(animals, adopter) {
    const matches = [];

    for (const animal of animals) {
        if (!matchesBasicPreferences(animal, adopter)) {
            continue;
        }

        const match = await calculateAnimalMatch(
            animal,
            adopter
        );

        matches.push({
            ...match,

            animal: {
                _id: animal._id,
                name: animal.name,
                type: animal.type,
                breed: animal.breed,
                age: animal.age,
                gender: animal.gender,
                size: animal.size,
                color: animal.color,
                image: animal.image,
                description: animal.description,
                behaviorNotes: animal.behaviorNotes,
                location: animal.location,
                adoptionStatus: animal.adoptionStatus,
            },
        });
    }

    matches.sort((a, b) => {
        if (a.score === null && b.score !== null) {
            return 1;
        }

        if (a.score !== null && b.score === null) {
            return -1;
        }

        if (a.score === null && b.score === null) {
            return 0;
        }

        return b.score - a.score;
    });

    return matches;
}

module.exports = {
    FACTOR_CONFIG,
    calculateFactorSimilarity,
    calculateBehavioralScore,
    calculateAnimalMatch,
    matchesBasicPreferences,
    generateMatches,
    getMatchTier,
    getAIPrediction,
};