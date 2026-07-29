const mongoose = require("mongoose");

const fosterApplicationSchema = new mongoose.Schema(
    {
        applicantUserId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        applicantName: {
            type: String,
            required: true,
            trim: true,
        },

        applicantEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        phoneNumber: {
            type: String,
            default: "",
            trim: true,
        },

        address: {
            type: String,
            default: "",
            trim: true,
        },

        housingType: {
            type: String,
            enum: ["House", "Apartment", "Condo", "Boarding House", "Other"],
            default: "House",
        },

        hasPets: {
            type: Boolean,
            default: false,
        },

        hasChildren: {
            type: Boolean,
            default: false,
        },

        petFriendly: {
            type: Boolean,
            default: true,
        },

        availableSpace: {
            type: String,
            default: "",
            trim: true,
        },

        availableTime: {
            type: String,
            default: "",
            trim: true,
        },

        fosterExperience: {
            type: String,
            default: "",
            trim: true,
        },

        preferredAnimalType: {
            type: String,
            enum: ["Dog", "Cat", "Both", "Other"],
            default: "Both",
        },

        preferredSize: {
            type: String,
            enum: ["Small", "Medium", "Large", "Any"],
            default: "Any",
        },

        capacity: {
            type: Number,
            default: 1,
        },

        fosterDuration: {
            type: String,
            default: "1 Month",
            trim: true,
        },

        emergencyName: {
            type: String,
            default: "",
            trim: true,
        },

        emergencyRelationship: {
            type: String,
            default: "",
            trim: true,
        },

        emergencyPhone: {
            type: String,
            default: "",
            trim: true,
        },

        notes: {
            type: String,
            default: "",
            trim: true,
        },

        agreementAccepted: {
            type: Boolean,
            default: false,
        },

        assignmentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FosterAssignment",
            default: null,
        },

        status: {
            type: String,
            enum: [
                "pending",
                "approved",
                "rejected",
            ],
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
    },
    {
        timestamps: true,
    }
);

fosterApplicationSchema.index({
    applicantEmail: 1,
    createdAt: -1,
});

fosterApplicationSchema.index({
    status: 1,
});

module.exports = mongoose.model(
    "FosterApplication",
    fosterApplicationSchema
);