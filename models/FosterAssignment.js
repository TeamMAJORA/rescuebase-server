const mongoose = require('mongoose');

const fosterUpdateSchema = new mongoose.Schema(
    {
        note: String,
        photoUrl: String,
        submittedBy: String,
        submittedByEmail: String,
    },
    { timestamps: true }
);

const fosterBehaviorEvaluationSchema = new mongoose.Schema(
    {
        energyLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        friendliness: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        humanSociability: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        animalSociability: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        trainability: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        anxietyLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        aggressionLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        activityLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        notes: {
            type: String,
            default: "",
        },

        submittedBy: {
            type: String,
            default: "",
        },

        submittedByEmail: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: ["not_submitted", "pending", "accepted", "revision"],
            default: "not_submitted",
        },

        submittedAt: {
            type: Date,
            default: null,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    { _id: false }
);

const medicalRequestSchema = new mongoose.Schema(
    {
        issue: {
            type: String,
            required: true,
            trim: true,
        },

        urgency: {
            type: String,
            enum: ["Low", "Medium", "High", "Emergency"],
            default: "Medium",
        },

        status: {
            type: String,
            enum: ["pending", "in_progress", "resolved"],
            default: "pending",
        },

        submittedBy: {
            type: String,
            default: "",
        },

        submittedByEmail: {
            type: String,
            default: "",
        },

        reviewedBy: {
            type: String,
            default: "",
        },

        resolutionNotes: {
            type: String,
            default: "",
            trim: true,
        },

        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);


const fosterAssignmentSchema = new mongoose.Schema(
    {
        petName: {
            type: String,
            required: true,
        },

        petBreed: String,
        petImage: String,

        fosterName: {
            type: String,
            required: true,
        },

        fosterEmail: {
            type: String,
            required: true,
        },

        fosterApplicationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FosterApplication",
            default: null,
        },

        shelterName: {
            type: String,
            default: "RescueBase Shelter",
        },

        careInstructions: {
            type: String,
            default: "Provide food, water, shelter, and weekly updates.",
        },

        status: {
            type: String,
            enum: ["active", "completed", "cancelled"],
            default: "active",
        },

        startDate: {
            type: Date,
            default: Date.now,
        },

        endDate: Date,

        behaviorEvaluation: {
            type: fosterBehaviorEvaluationSchema,
            default: () => ({}),
        },

        updates: [fosterUpdateSchema],
        
        medicalRequests: {
            type: [medicalRequestSchema],
            default: [],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("FosterAssignment", fosterAssignmentSchema);