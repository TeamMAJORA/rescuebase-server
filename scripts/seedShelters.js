// Adds real Cebu and Lapu-Lapu shelters, pounds and vet clinics to the Shelter
// collection so they show on the GIS map. Run: node scripts/seedShelters.js


const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Shelter = require("../models/Shelter");

dotenv.config();

// Coordinates come from each place's Google Maps pin (via clinicfinderph.com)
// or are approximate for the shelters. Check them on the map before the defense.

// ===== Cebu Island (mainland Cebu + nearby small islands) =====
const cebuIsland = [
    {
        name: "Mayari Animal Rescue Organization (MARO)",
        address: "Sapangdaku, Guadalupe, Cebu City",
        latitude: 10.333,
        longitude: 123.865,
        contact: "",
        email: "",
        description:
            "Non-profit caring for hundreds of rescued dogs and cats across centers in the hills and city. Adoption program (about PHP 1,000 fee covering spay/neuter, bath and health clearance). Website: mayarirescue.com",
        category: "shelter",
        island: "cebu",
        status: "active",
    },
    {
        name: "Island Rescue Organization (IRO)",
        address: "Brgy. Guba Rd, Cebu City",
        latitude: 10.401,
        longitude: 123.864,
        contact: "",
        email: "",
        description:
            "Volunteer-run non-profit with foster homes, dog shelters and catteries for disabled cats. Holds adoption events and community volunteer days. Website: iroislandrescue.org",
        category: "shelter",
        island: "cebu",
        status: "active",
    },
    {
        name: "Happy Tails Animal Welfare Organization, Inc.",
        address: "78-C Andres Abellana, Guadalupe, Cebu City",
        latitude: 10.3065,
        longitude: 123.8885,
        contact: "",
        email: "",
        description:
            "Rescue and advocacy group providing rehoming, support and welfare initiatives for strays. Website: happytailsph.org",
        category: "shelter",
        island: "cebu",
        status: "active",
    },
    {
        name: "Moalboal Animal Welfare Outpost",
        address: "Bantayan Road, Moalboal, Cebu",
        latitude: 9.94,
        longitude: 123.396,
        contact: "",
        email: "",
        description:
            "Charity caring for over 100 rescued, abandoned or injured animals in southern Cebu.",
        category: "shelter",
        island: "cebu",
        status: "active",
    },
    {
        name: "Malapascua Paw Heroes",
        address: "Malapascua Island, Daanbantayan, Cebu",
        latitude: 11.329,
        longitude: 124.113,
        contact: "",
        email: "",
        description:
            "Animal rescue center for strays and community animal welfare on Malapascua Island (off northern Cebu).",
        category: "shelter",
        island: "cebu",
        status: "active",
    },
    {
        name: "Department of Veterinary Medicine and Fisheries (DVMF) / City Pound",
        address: "F. Cabahug St., Mabolo, Cebu City (near SM City Cebu)",
        latitude: 10.318,
        longitude: 123.911,
        contact: "(032) 401 0418",
        email: "",
        description:
            "City government office for animal control, anti-rabies vaccination, low-cost/free spay and neuter, and impounded animals. Open Monday to Friday, 8:00 AM to 5:00 PM.",
        category: "pound",
        island: "cebu",
        status: "active",
    },
    {
        name: "Cebu Veterinary Doctors - Main Hospital",
        address: "Unit 107-109, F. Ramos St, Cebu City",
        latitude: 10.3085522,
        longitude: 123.8952451,
        contact: "(032) 256 3056",
        email: "",
        description:
            "Veterinary hospital. Open daily, 8:00 AM to 5:00 PM.",
        category: "clinic",
        island: "cebu",
        status: "active",
    },
    {
        name: "Animal Kingdom Veterinary Hospital",
        address: "38 Gorordo Ave, Cebu City",
        latitude: 10.3138885,
        longitude: 123.9021912,
        contact: "(032) 383 7512",
        email: "",
        description:
            "Veterinary hospital. Open daily, 8:00 AM to 6:00 PM.",
        category: "clinic",
        island: "cebu",
        status: "active",
    },
    {
        name: "Cebu Animal Doctor's Hospital - Main Branch",
        address: "Cebu City (Plus Code 8WR6+VWF)",
        latitude: 10.3421785,
        longitude: 123.9123014,
        contact: "0956 308 6855",
        email: "",
        description:
            "Veterinary hospital. Open 24 hours, daily.",
        category: "clinic",
        island: "cebu",
        status: "active",
    },
    {
        name: "Aycardo Veterinary Center Inc. - Main Branch",
        address: "68 J. Alcantara St, Cebu City",
        latitude: 10.2998995,
        longitude: 123.8904166,
        contact: "(032) 407 8004",
        email: "",
        description:
            "Veterinary clinic. Monday to Saturday, 9:00 AM to 6:00 PM (lunch break 12 to 1). Closed Sunday.",
        category: "clinic",
        island: "cebu",
        status: "active",
    },
    {
        name: "Responsivet Animal Clinic 24/7 Emergency",
        address: "Cebu South Rd, Cebu City",
        latitude: 10.2722293,
        longitude: 123.8472603,
        contact: "0995 553 8241",
        email: "",
        description:
            "Emergency veterinary clinic. Open 24 hours, daily.",
        category: "clinic",
        island: "cebu",
        status: "active",
    },
];

// ===== Mactan Island (Lapu-Lapu City) =====
// No private rescue shelter found in Lapu-Lapu; the city vet office handles impounding.
const mactanIsland = [
    {
        name: "Lapu-Lapu City Veterinarian's Office",
        address: "Lapu-Lapu City (Plus Code 8XC8+6JX)",
        latitude: 10.3206181,
        longitude: 123.9666168,
        contact: "(032) 341 2612",
        email: "",
        description:
            "City government veterinary office for animal control, anti-rabies vaccination and impounded animals in Lapu-Lapu City.",
        category: "pound",
        island: "mactan",
        status: "active",
    },
    {
        name: "Cebu Veterinary Doctors - Mactan Branch",
        address: "CVD Centrum, Kagudoy Road, Basak, Lapu-Lapu City",
        latitude: 10.2929093,
        longitude: 123.9707221,
        contact: "(032) 509 6857",
        email: "",
        description:
            "Veterinary clinic. Monday to Saturday, 8:00 AM to 5:00 PM. Closed Sunday.",
        category: "clinic",
        island: "mactan",
        status: "active",
    },
    {
        name: "Mactan Cat and Dog Clinic",
        address: "Maximo V. Patalinjug Jr. Ave, Lapu-Lapu City",
        latitude: 10.2941038,
        longitude: 123.965832,
        contact: "(032) 495 9293",
        email: "",
        description:
            "Veterinary clinic for cats and dogs.",
        category: "clinic",
        island: "mactan",
        status: "active",
    },
    {
        name: "Mactan Veterinary Clinic",
        address: "ML Tan Bldg., S. Osme\u00f1a Street, Lapu-Lapu City",
        latitude: 10.3025452,
        longitude: 123.9579763,
        contact: "(032) 520 6249",
        email: "",
        description:
            "Veterinary clinic. Monday to Saturday, 10:00 AM to 6:00 PM; Sunday, 10:00 AM to 1:00 PM.",
        category: "clinic",
        island: "mactan",
        status: "active",
    },
];

const shelters = [...cebuIsland, ...mactanIsland];

async function run() {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not set. Check rescuebase-server/.env");
    }

    await mongoose.connect(process.env.MONGO_URI);

    for (const shelter of shelters) {
        const saved = await Shelter.findOneAndUpdate(
            { name: shelter.name },
            { $set: shelter },
            { upsert: true, returnDocument: "after", runValidators: true }
        );
        console.log(`Saved [${saved.island}/${saved.category}]: ${saved.name}`);
    }

    await mongoose.disconnect();
    console.log(
        `Done. ${cebuIsland.length} on Cebu, ${mactanIsland.length} on Mactan (${shelters.length} total).`
    );
}

run().catch(async (err) => {
    console.error("Seeding shelters failed:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
