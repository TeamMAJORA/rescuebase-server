const mongoose = require("mongoose");

// One claim on a report:
// - "ownership": "this is my pet", on a found report
// - "found": "I found your pet", on a lost report (only the lost pet's owner sees it)
// A report can have several pending at once; whoever decides approves one and the rest are rejected.
const claimSchema = new mongoose.Schema({
    claimType: {
        type: String,
        enum: ["ownership", "found"],
        default: "ownership",
    },

    claimantName: {
        type: String,
        required: true,
        trim: true,
    },

    claimantEmail: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
    },

    contactNumber: {
        type: String,
        default: "",
        trim: true,
    },

    proofNotes: {
        type: String,
        default: "",
        trim: true,
    },

    proofPhotoUrl: {
        type: String,
        default: "",
        trim: true,
    },

    // Found claims: where and when the claimant found the pet
    foundLocation: {
        type: String,
        default: "",
        trim: true,
    },

    foundDate: {
        type: Date,
        default: null,
    },

    // When the person who decides first opened it; unseen pending claims show as "New"
    seenByReviewerAt: {
        type: Date,
        default: null,
    },

    status: {
        type: String,
        enum: ["pending", "approved", "rejected", "cancelled"],
        default: "pending",
    },

    claimedAt: {
        type: Date,
        default: Date.now,
    },

    reviewedByName: {
        type: String,
        default: "",
    },

    reviewedByEmail: {
        type: String,
        default: "",
        lowercase: true,
    },

    reviewedAt: {
        type: Date,
        default: null,
    },
});

const lostFoundReportSchema = new mongoose.Schema(
    {
        reporterName: {
            type: String,
            required: true,
            trim: true,
        },

        reporterEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        // Staff and the reporter only, never shown publicly.
        reporterContactNumber: {
            type: String,
            default: "",
            trim: true,
        },

        reportType: {
            type: String,
            enum: ["lost", "found"],
            required: true,
        },

        petName: {
            type: String,
            default: "",
            trim: true,
        },

        species: {
            type: String,
            required: true,
            trim: true,
        },

        breed: {
            type: String,
            default: "",
            trim: true,
        },

        colour: {
            type: String,
            default: "",
            trim: true,
        },

        size: {
            type: String,
            default: "",
            trim: true,
        },

        sex: {
            type: String,
            default: "",
            trim: true,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },

        location: {
            type: String,
            required: true,
            trim: true,
        },

        coordinates: {
            latitude: {
                type: Number,
                min: -90,
                max: 90,
                default: null,
            },
            longitude: {
                type: Number,
                min: -180,
                max: 180,
                default: null,
            },
        },

        eventDate: {
            type: Date,
            default: null,
        },

        dateReported: {
            type: Date,
            default: Date.now,
        },

        photoUrl: {
            type: String,
            default: "",
        },

        linkedAnimal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal",
            default: null,
        },

        status: {
            type: String,
            enum: [
                "open",
                "matched",
                "claimed",
                "reunited",
                "rejected",
            ],
            default: "open",
        },

        matchStatus: {
            type: String,
            enum: [
                "none",
                "suggested",
                "confirmed",
            ],
            default: "none",
        },

        // Summary of claims: "pending" while any claim waits for staff
        claimStatus: {
            type: String,
            enum: [
                "none",
                "pending",
                "approved",
            ],
            default: "none",
        },

        claims: {
            type: [claimSchema],
            default: [],
        },

        // When the latest claim was submitted (drives the staff sidebar dot)
        claimedAt: {
            type: Date,
            default: null,
        },

        // Shelter animal's availability before a claim, restored if the claim is cancelled or rejected
        linkedAnimalAvailabilityBeforeClaim: {
            type: String,
            default: "",
        },


        reunitedAt: {
            type: Date,
            default: null,
        },


        colour: {
            type: String,
            enum: [
                "",
                "Black",
                "White",
                "Brown",
                "Tan",
                "Gray",
                "Grey",
                "Cream",
                "Golden",
                "Orange",
                "Red",
                "Mixed",
                "Other",
            ],
            default: "",
            trim: true,
        },

        size: {
            type: String,
            enum: [
                "",
                "Small",
                "Medium",
                "Large",
                "Extra Large",
            ],
            default: "",
            trim: true,
        },

        sex: {
            type: String,
            enum: [
                "",
                "Male",
                "Female",
                "Unknown",
            ],
            default: "",
            trim: true,
        },

    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "LostFoundReport",
    lostFoundReportSchema
);