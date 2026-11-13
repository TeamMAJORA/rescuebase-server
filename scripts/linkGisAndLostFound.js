// One-time cleanup after the GIS map started reading lost/found pins straight from Lost & Found.
//
// 1. Lost & Found reports imported from CSV keep their map point in top-level "latitude"/"longitude"
//    fields the model doesn't read. Move them into "coordinates" so the reports show on the map.
// 2. Old GIS "lost"/"found" pins:
//    - copies of a Lost & Found report (same reporter email + type, within 100 m) -> deleted
//    - demo pins from seedDemoGisReports (demo-seed@rescuebase.local)          -> deleted
//    - pins staff made on the map with no Lost & Found report                  -> turned into "stray"
//
// Uses MONGO_URI from .env.
//   node scripts/linkGisAndLostFound.js           -> preview only, nothing saved
//   node scripts/linkGisAndLostFound.js --apply   -> make the changes

const path = require("path");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const GISLocation = require("../models/GISLocation");
const LostFoundReport = require("../models/LostFoundReport");

const shouldWriteChanges = process.argv.includes("--apply");
const DEMO_SEED_EMAIL = "demo-seed@rescuebase.local";
const DUPLICATE_DISTANCE_METERS = 100;

if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is missing from .env");
    process.exit(1);
}

function distanceMeters(a, b) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const dLat = toRadians(b.latitude - a.latitude);
    const dLng = toRadians(b.longitude - a.longitude);
    const value =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, value)));
}

async function moveImportedCoordinates() {
    const reports = await LostFoundReport.collection
        .find({ latitude: { $exists: true }, longitude: { $exists: true } })
        .project({ petName: 1, reportType: 1, latitude: 1, longitude: 1, coordinates: 1 })
        .toArray();

    console.log(`\n== Lost & Found reports with imported latitude/longitude: ${reports.length}`);
    for (const report of reports) {
        const latitude = Number(report.latitude);
        const longitude = Number(report.longitude);
        const label = `${report.reportType} ${report.petName || "(no name)"}`;

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            console.log(`  SKIP  ${label}: latitude/longitude are not numbers`);
            continue;
        }
        console.log(`  MOVE  ${label}: ${latitude}, ${longitude} -> coordinates`);
        if (shouldWriteChanges) {
            await LostFoundReport.collection.updateOne(
                { _id: report._id },
                { $set: { coordinates: { latitude, longitude } }, $unset: { latitude: "", longitude: "" } }
            );
        }
    }
}

async function cleanUpOldLostFoundPins() {
    const pins = await GISLocation.find({ reportType: { $in: ["lost", "found"] } }).lean();
    const reports = await LostFoundReport.find({})
        .select("reporterEmail reportType coordinates")
        .lean();

    console.log(`\n== Old GIS lost/found pins: ${pins.length}`);
    const summary = { deletedCopies: 0, deletedDemo: 0, turnedIntoStray: 0 };

    for (const pin of pins) {
        const label = `${pin.reportType} "${pin.petName}" at ${pin.locationName}`;

        if (pin.createdByEmail === DEMO_SEED_EMAIL) {
            console.log(`  DELETE demo pin   ${label}`);
            summary.deletedDemo++;
            if (shouldWriteChanges) await GISLocation.deleteOne({ _id: pin._id });
            continue;
        }

        const isCopyOfReport = reports.some((report) =>
            report.reportType === pin.reportType &&
            report.reporterEmail === String(pin.createdByEmail || "").toLowerCase() &&
            report.coordinates?.latitude != null &&
            distanceMeters(report.coordinates, pin) <= DUPLICATE_DISTANCE_METERS
        );

        if (isCopyOfReport) {
            console.log(`  DELETE copy       ${label}`);
            summary.deletedCopies++;
            if (shouldWriteChanges) await GISLocation.deleteOne({ _id: pin._id });
        } else {
            console.log(`  STRAY             ${label}`);
            summary.turnedIntoStray++;
            if (shouldWriteChanges) await GISLocation.updateOne({ _id: pin._id }, { $set: { reportType: "stray" } });
        }
    }
    console.log("\nPins:", summary);
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`Database: ${mongoose.connection.name} | Mode: ${shouldWriteChanges ? "APPLY" : "PREVIEW (nothing saved)"}`);

    await moveImportedCoordinates();
    await cleanUpOldLostFoundPins();

    if (!shouldWriteChanges) console.log("\nPreview only. Add --apply to save.");
    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error("Cleanup failed:", error);
    await mongoose.disconnect();
    process.exit(1);
});
