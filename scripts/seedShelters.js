// Adds real Cebu shelters to the Shelter collection so they show on the GIS map.


const dotenv = require("dotenv");
const mongoose = require("mongoose");
const Shelter = require("../models/Shelter");

dotenv.config();

const shelters = [
    {
        name: "Mayari Animal Rescue Organization (MARO)",
        address: "Sapangdaku, Guadalupe, Cebu City",
        latitude: 10.333,
        longitude: 123.865,
        contact: "",
        email: "",
        description:
            "Non-profit caring for hundreds of rescued dogs and cats across centers in the hills and city. Adoption program (about PHP 1,000 fee covering spay/neuter, bath and health clearance). Website: mayarirescue.com",
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
            "Animal rescue center for strays and community animal welfare on Malapascua Island.",
        status: "active",
    },
    {
        name: "Department of Veterinary Medicine and Fisheries (DVMF) / City Pound",
        address: "F. Cabahug St., Mabolo, Cebu City (near SM City Cebu)",
        latitude: 10.318,
        longitude: 123.911,
        contact: "",
        email: "",
        description:
            "City government office for animal control, anti-rabies vaccination, low-cost/free spay and neuter, and impounded animals. Open Monday to Friday, 8:00 AM to 5:00 PM.",
        status: "active",
    },
];

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
        console.log(`Saved: ${saved.name}`);
    }

    await mongoose.disconnect();
    console.log(`Done. ${shelters.length} shelters saved.`);
}

run().catch(async (err) => {
    console.error("Seeding shelters failed:", err.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
