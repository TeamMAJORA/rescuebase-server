const mongoose = require("mongoose");

const quizResponseSchema = new mongoose.Schema(
    {
        adopterUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        adopterName: {
            type: String,
            default: "Adopter",
            trim: true,
        },

        adopterEmail: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },

        preferredPetType: {
            type: String,
            enum: ["Any", "Dog", "Cat", "Other"],
            default: "Any",
        },

        preferredSize: {
            type: String,
            enum: ["Any", "Small", "Medium", "Large"],
            default: "Any",
        },

        homeType: {
            type: String,
            enum: [
                "House",
                "Apartment",
                "Condominium",
                "Boarding House",
                "Other",
            ],
            default: "House",
        },

        homeOwnership: {
            type: String,
            enum: [
                "Owned",
                "Rented with permission",
                "Rented without confirmed permission",
            ],
            default: "Owned",
        },

        hasChildren: {
            type: String,
            enum: ["Yes", "No"],
            default: "No",
        },

        hasOtherPets: {
            type: String,
            enum: ["Yes", "No"],
            default: "No",
        },

        petExperience: {
            type: String,
            enum: [
                "Beginner",
                "Some experience",
                "Experienced",
                "Professional",
            ],
            default: "Beginner",
        },

        dailyAvailableHours: {
            type: String,
            enum: [
                "Less than 1",
                "1-2",
                "2-4",
                "More than 4",
            ],
            default: "2-4",
        },

        exerciseFrequency: {
            type: String,
            enum: [
                "Low",
                "Moderate",
                "High",
                "Very High",
            ],
            default: "Moderate",
        },

        willingToTrain: {
            type: String,
            enum: ["Yes", "Maybe", "No"],
            default: "Yes",
        },

        energyPreference: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        friendlinessPreference: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        humanSociabilityPreference: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        animalSociabilityPreference: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        trainabilityPreference: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        anxietyTolerance: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        aggressionTolerance: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 1,
        },

        activityPreference: {
            type: Number,
            enum: [1, 2, 3, 4, 5],
            default: 3,
        },

        completedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "QuizResponse",
    quizResponseSchema
);