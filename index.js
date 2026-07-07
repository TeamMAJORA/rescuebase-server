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

const app = express();

app.use(cors({
    origin: process.env.CLIENT_URL,
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

app.get("/", (req, res) => {
    res.send("RescueBase Backend is now running.");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
});