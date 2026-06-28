const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        firebaseUid : {
            type : String,
            required : true,
            unique : true
        },

        name : {
            type : String,
            default : "",
        },

        email : {
            type : String,
            required : true,
            unique : true
        },
        
        profileImage : {
            type : String,
            default : ""
        },

        provider : {
            type : String,
            default : "google"
        },

        role : {
            type : String,
            enum : ["adopter", "volunteer", "staff", "admin"],
            default : "adopter"
        },

        status : {
            type : String,
            enum : ["active", "pending", "disabled"],
            default : "active"
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);