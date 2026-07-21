const mongoose = require("mongoose");

const adoptionDocumentSchema = new mongoose.Schema(
    {
        documentName: {
            type: String,
            default: "",
            trim: true,
        },

        documentUrl: {
            type: String,
            default: "",
        },

        publicId: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: ["pending", "verified", "rejected"],
            default: "pending",
        },
    },
    {
        _id: true,
        timestamps: true,
    }
);

const adoptionApplicationSchema = new mongoose.Schema(
    {
        applicantUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        fullName: {
            type: String,
            required: true,
            trim: true,
        },

        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        phone: {
            type: String,
            default: "",
            trim: true,
        },

        address: {
            type: String,
            default: "",
            trim: true,
        },

        animalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal",
            required: true,
        },

        petName: {
            type: String,
            required: true,
            trim: true,
        },

        petBreed: {
            type: String,
            default: "",
            trim: true,
        },

        petImage: {
            type: String,
            default: "",
        },

        homeType: {
            type: String,
            default: "",
            trim: true,
        },

        hasChildren: {
            type: String,
            default: "",
            trim: true,
        },

        hasOtherPets: {
            type: String,
            default: "",
            trim: true,
        },

        reason: {
            type: String,
            default: "",
            trim: true,
        },

        experience: {
            type: String,
            default: "",
            trim: true,
        },

        documents: {
            type: [adoptionDocumentSchema],
            default: [],
        },

        documentsVerified: {
            type: Boolean,
            default: false,
        },

        role: {
            type: String,
            enum: ["adopter"],
            default: "adopter",
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },

        reviewedByName: {
            type: String,
            default: "",
            trim: true,
        },

        reviewedByEmail: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },

        reviewNotes: {
            type: String,
            default: "",
            trim: true,
        },

        rejectionReason: {
            type: String,
            default: "",
            trim: true,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },

        interviewSchedule: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

adoptionApplicationSchema.index({
    email: 1,
    createdAt: -1,
});

adoptionApplicationSchema.index({
    animalId: 1,
    status: 1,
});

module.exports = mongoose.model(
    "AdoptionApplication",
    adoptionApplicationSchema
);