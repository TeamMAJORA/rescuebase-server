const mongoose = require("mongoose");

const medicalRecordSchema = new mongoose.Schema(
    {
        animal_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal",
            required: true,
        },

        // Checkup, Treatment, Surgery, Deworming
        record_type: {
            type: String,
            required: true,
            trim: true,
        },

        veterinarian: {
            type: String,
            required: true,
            trim: true,
        },

        record_date: {
            type: Date,
            required: true,
        },

        notes: {
            type: String,
            trim: true,
            default: "",
        },

        recorded_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("MedicalRecord", medicalRecordSchema);