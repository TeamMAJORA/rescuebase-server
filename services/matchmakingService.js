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
        return Math.max(0, 1 - Math.max(0, animalScore - adopterScore) / 4)
    }

    return Math.max(0, 1 - Math.abs(animalScore - adopterScore) / 4);
}

function getMatchTier(score) {
    if (score >= 80) {
        return "Perfect Paw Match";
    }

    if (score >= 60) {
        return "Paws for thought";
    }

    return "No Paw-sible match";
}

function checkCriticalConflicts(animal, adopter) {
    const conflicts = [];

    if (
        Number.isFinite(animal.aggressionLevel) &&
        Number.isFinite(animal.aggressionTolerance) &&
        animal.aggressionLevel >
        adopter.aggressionTolerance
    ) {
        conflicts.push("The animal's aggression level exceeds the adopter's stated tolerance");
    }

    if (
        Number.isFinite(animal.anxietyLevel) &&
        Number.isFinite(animal.anxietyTolerance) &&
        animal.anxietyLevel >
        adopter.anxietyTolerance
    ) {
        conflicts.push("The animal's axiety level exceeds the adopter's stated tolerance");
    }

    // If Children is stated in the questionare
    if (
        adopter.hasChildren === "Yes" &&
        Number.isFinite(animal.aggressionLevel) &&
        animal.aggressionLevel >= 5
    ) {
        conflicts.push("The animal has a very high aggression level while children are present.");
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
        const similarity = calculateFactorSimilarity(animalValue, adopterValue, config.type);

        factorResults[factorName] = {
            animalValue: animalValue ?? null,
            adopterValue: adopterValue ?? null,
            similarity: similarity === null ? null : Number(similarity.toFixed(4)),
            weight: config.weight,
        }

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

    const normalizedScore = (weightScore / totalAppliedWeight) * 100;

    return {
        score: Number(normalizedScore.toFixed(2)),
        factorResults,
    }
}

function calculateAnimalMatch(animal, adopter) {
    const { score, factorResults } = calculateBehavioralScore(animal, adopter);

    if (score === null) {
        return {
            animalId: animal._id,
            animalName: animal.name,
            score: null,
            tier: "Insufficient Behavioral Data",
            factorResults,
            criticalConflicts: [],
            eligible: false,
        };
    }

    const criticalConflicts = checkCriticalConflicts(animal, adopter);
    let finalScore = score;

    // Critical conflicts prevent the animal from being classified as a high qual match.

    if (criticalConflicts.length > 0 && finalScore >= 60) {
        finalScore = 59.99;
    }

    return {
        animalId: animal._id,
        animalName: animal.name,
        score: Number(finalScore.toFixed(2)),
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
        animal.type !==
        adopter.preferredPetType
    ) {
        return false;
    }

    if (
        adopter.preferredSize &&
        adopter.preferredSize !== "Any" &&
        animal.size !==
        adopter.preferredSize
    ) {
        return false;
    }

    return true;
}

function generateMatch(animals, adopter) {
    const matches = [];

    for (const animal of animals) {
        if (!matchesBasicPreferences(animal, adopter)) {
            continue;
        }

        const match = calculateAnimalMatch(animal, adopter)

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
                description:
                    animal.description,
                behaviorNotes:
                    animal.behaviorNotes,
                location: animal.location,
                adoptionStatus:
                    animal.adoptionStatus,
            },
        });
    }

    matches.sort((a, b) => {
        if (
            a.score === null &&
            b.score !== null
        ) {
            return 1;
        }

        if (
            a.score !== null &&
            b.score === null
        ) {
            return -1;
        }

        if (
            a.score === null &&
            b.score === null
        ) {
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
    generateMatch,
    getMatchTier,
}