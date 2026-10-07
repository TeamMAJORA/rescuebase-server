const mongoose = require("mongoose");

const vaccinationRecordSchema =
    new mongoose.Schema(
        {
            animal_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Animal",
                required: true,
            },

            vaccine_name: {
                type: String,
                required: true,
                trim: true,
            },

            vaccination_date: {
                type: Date,
                required: true,
            },

            next_due_date: {
                type: Date,
                default: null,
            },

            veterinarian: {
                type: String,
                trim: true,
                default: null,
            },
        },
        {
            timestamps: true,
        }
    );

module.exports = mongoose.model(
    "VaccinationRecord",
    vaccinationRecordSchema
);