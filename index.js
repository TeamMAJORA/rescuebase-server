
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cookie = require("cookie");

const {
    initializeApp,
    cert,
    getApps
} = require("firebase-admin/app");

// --------------------------------------------------
// MIDDLEWARE IMPORTS
// --------------------------------------------------

const securityGuard = require("./middleware/securityGuard");
const errorHandler = require("./middleware/errorHandler");
const maintenanceMode = require("./middleware/maintenanceMode");
const activityLogger = require("./middleware/activityLogger");

// --------------------------------------------------
// FIREBASE CONFIGURATION
// --------------------------------------------------

const serviceAccount = {
    type: "service_account",
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: process.env.PRIVATE_KEY?.replace(/\\n/g, "\n"),
    client_email: process.env.CLIENT_EMAIL,
    client_id: process.env.CLIENT_ID,
    auth_uri: process.env.AUTH_URI,
    token_uri: process.env.TOKEN_URI,
    auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.CLIENT_CERT_URL,
    universe_domain: process.env.UNI_DOMAIN || "googleapis.com"
};

function initializeFirebase() {
    if (getApps().length > 0) {
        return;
    }

    const requiredFields = [
        "project_id",
        "private_key",
        "client_email"
    ];

    const missingFields = requiredFields.filter(
        field => !serviceAccount[field]
    );

    if (missingFields.length > 0) {
        throw new Error(
            `[Firebase] Missing configuration: ${missingFields.join(", ")}`
        );
    }

    initializeApp({
        credential: cert(serviceAccount)
    });

    console.log("[Firebase] Initialized");
}

initializeFirebase();

// --------------------------------------------------
// ROUTE IMPORTS
// --------------------------------------------------

const authRoutes = require("./routes/authRoutes");
const adoptionRoutes = require("./routes/adoptionRoutes");
const ledgerRoutes = require("./routes/ledgerRoutes");
const fosterRoutes = require("./routes/fosterRoutes");
const userRoutes = require("./routes/userRoutes");
const donationRoutes = require("./routes/donationRoutes");
const animalRoutes = require("./routes/animalRoutes");
const fosterNotifications = require("./routes/fosterNotifications");
const medicalRequests = require("./routes/medicalRequests");
const lostFoundRoutes = require("./routes/lostFoundRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const rescueRoutes = require("./routes/rescueAssignmentRoutes");
const feedbackRoutes = require("./routes/feedbackRoutes");
const gisRoutes = require("./routes/gisRoutes");
const reportRoutes = require("./routes/reportsRoutes");
const suppliesRoutes = require("./routes/neededSuppliesRoutes");
const matchmakingRoutes = require("./routes/matchmakingRoutes");
const paymentMethodRoutes = require("./routes/paymentMethodRoutes");
const qrTagRoutes = require("./routes/qrTagRoutes");
const vaccinationRoutes = require("./routes/vaccinationRoutes");
const medicalRecordRoutes = require("./routes/medicalRecordRoutes");
const animalTransferRoutes = require("./routes/animalTransferRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const activityLogRoutes = require("./routes/activityLogRoutes");
const globalSettingsRoutes = require("./routes/globalSettingsRoutes");
const foodInventoryRoutes = require("./routes/foodInventoryRoutes");
const uploadRoutes = require("./routes/uploadRoutes");

// --------------------------------------------------
// APPLICATION INITIALIZATION
// --------------------------------------------------

const app = express();

app.set("trust proxy", 1);
app.disable("x-powered-by");

// --------------------------------------------------
// SECURITY HEADERS
// --------------------------------------------------

app.use(helmet());

// --------------------------------------------------
// CORS CONFIGURATION
// --------------------------------------------------

const allowedOrigins = (
    process.env.CLIENT_URL || "http://localhost:5173"
)
    .split(",")
    .map(origin => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }

        const normalizedOrigin = origin.replace(/\/+$/, "");

        if (allowedOrigins.includes(normalizedOrigin)) {
            return callback(null, true);
        }

        console.warn(`[CORS] Rejected origin: ${origin}`);

        return callback(new Error(`CORS blocked: ${origin}`));
    },

    credentials: true,

    methods: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "OPTIONS"
    ],

    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "ngrok-skip-browser-warning"
    ],

    optionsSuccessStatus: 204
}));

// --------------------------------------------------
// REQUEST PARSING
// --------------------------------------------------

app.use(express.json({
    limit: "1mb"
}));

app.use(express.urlencoded({
    extended: true,
    limit: "1mb"
}));

// Cookie parsing
app.use((req, res, next) => {
    try {
        req.cookies = cookie.parse(
            req.headers.cookie || ""
        );

        next();
    } catch (error) {
        next(error);
    }
});

// --------------------------------------------------
// RATE LIMITING
// --------------------------------------------------

app.use(
    "/api",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 300,
        standardHeaders: "draft-7",
        legacyHeaders: false,

        message: {
            success: false,
            message: "Too many requests. Please try again later."
        }
    })
);

// --------------------------------------------------
// MONGODB CONNECTION
// --------------------------------------------------

let mongoConnectionPromise = null;

async function connectDatabase() {
    if (mongoose.connection.readyState === 1) {
        return;
    }

    if (!process.env.MONGO_URI) {
        throw new Error("[MongoDB] MONGO_URI is not configured");
    }

    if (!mongoConnectionPromise) {
        mongoConnectionPromise = mongoose.connect(
            process.env.MONGO_URI
        )
            .then(() => {
                console.log("[MongoDB] Connected");
            })
            .catch(error => {
                mongoConnectionPromise = null;

                console.error(
                    "[MongoDB] Connection failed:",
                    error.message
                );

                throw error;
            });
    }

    return mongoConnectionPromise;
}

// Only API requests require MongoDB.
// Health checks remain accessible if MongoDB is unavailable.
app.use("/api", async (req, res, next) => {
    try {
        await connectDatabase();
        next();
    } catch (error) {
        next(error);
    }
});

// --------------------------------------------------
// RESCUEBASE MIDDLEWARE
// --------------------------------------------------

app.use(securityGuard);
app.use(maintenanceMode);
app.use(activityLogger);

// --------------------------------------------------
// HEALTH CHECK
// --------------------------------------------------

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "online",
        message: "RescueBase application loaded",
        database: mongoose.connection.readyState === 1
            ? "connected"
            : "disconnected"
    });
});

// --------------------------------------------------
// API ROUTES
// --------------------------------------------------

app.use("/api/auth", authRoutes);
app.use("/api/adoptions", adoptionRoutes);
app.use("/api/ledger", ledgerRoutes);
app.use("/api/foster", fosterRoutes);
app.use("/api/users", userRoutes);
app.use("/api/donations", donationRoutes);
app.use("/api/animals", animalRoutes);
app.use("/api/foster/notifications", fosterNotifications);
app.use("/api/foster/medical", medicalRequests);
app.use("/api/lost-found", lostFoundRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/rescue-assignments", rescueRoutes);
app.use("/api/feedback", feedbackRoutes);
app.use("/api/gis", gisRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/supplies", suppliesRoutes);
app.use("/api/matchmaking", matchmakingRoutes);
app.use("/api/payment-methods", paymentMethodRoutes);
app.use("/api/qr-tags", qrTagRoutes);
app.use("/api/vaccinations", vaccinationRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/medical-records", medicalRecordRoutes);
app.use("/api/animal-transfers", animalTransferRoutes);
app.use("/api/activity-logs", activityLogRoutes);
app.use("/api/settings", globalSettingsRoutes);
app.use("/api/food-inventory", foodInventoryRoutes);
app.use("/api/uploads", uploadRoutes);

// --------------------------------------------------
// ROOT ENDPOINT
// --------------------------------------------------

app.get("/", (req, res) => {
    res.status(200).json({
        name: "RescueBase Backend",
        version: "1.0.0",
        status: "online",
        database: mongoose.connection.readyState === 1
            ? "connected"
            : "disconnected"
    });
});

// --------------------------------------------------
// 404 HANDLER
// --------------------------------------------------

app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found"
    });
});

// --------------------------------------------------
// ERROR HANDLER
// --------------------------------------------------

app.use(errorHandler);

// --------------------------------------------------
// EXPORT APPLICATION
// --------------------------------------------------

module.exports = app;

// --------------------------------------------------
// LOCAL DEVELOPMENT SERVER
// --------------------------------------------------

if (require.main === module) {
    const PORT = process.env.PORT || 5000;

    connectDatabase()
        .then(() => {
            console.log("[Server] MongoDB ready");

            app.listen(PORT, "0.0.0.0", () => {
                console.log(`[Server] Running on port ${PORT}`);
            });
        })
        .catch(error => {
            console.error(
                "[Server] Startup failed:",
                error
            );

            process.exit(1);
        });
}
