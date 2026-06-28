const mongoose = require("mongoose");

const adoptionApplicationSchema = new mongoose.Schema(
    {
        fullName: String,
        email: String,
        phone: String,
        address: String,

        petName: String,
        petBreed: String,

        homeType: String,
        hasChildren: String,
        hasOtherPets: String,

        reason: String,
        experience: String,

        role: {
            type: String,
            default: "adopter",
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("AdoptionApplication", adoptionApplicationSchema);