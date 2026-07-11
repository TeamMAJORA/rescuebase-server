const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const {
    initializeApp, cert
} = require("firebase-admin/app");
const admin = require("firebase-admin");

dotenv.config();

const serviceAccount = require("./config/serviceAccountKey.json");
const authRoutes = require("./routes/authRoutes");
const adoptionRoutes = require("./routes/adoptionRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const fosterRoutes = require("./routes/fosterRoutes");
const userRoutes = require("./routes/userRoutes");
const donationRoutes = require("./routes/donationRoutes");
const animalRoutes = require("./routes/animalRoutes")

const app = express();

const allowedOrigins = [
    // This will be put in the env and put it the ipv4 adress with the port used in it.
    process.env.CLIENT_URL,
    "http://localhost:5173",
    "http://192.168.1.15:5173"
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS blocked origin: ${origin}`));
        }
    },
    credentials: true,
}));

app.use(express.json());

initializeApp({
    credential: cert(serviceAccount),
});

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB Connected"))
    .catch((error) => console.error("MongoDB error :", error));

app.use("/api/auth", authRoutes);
app.use("/api/adoptions", adoptionRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/foster", fosterRoutes);
app.use("/api/users", userRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/animals", animalRoutes)

app.get("/", (req, res) => {
    res.send("RescueBase Backend is now running.");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`)
});
