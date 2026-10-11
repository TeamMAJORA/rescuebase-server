const mongoose = require("mongoose");
const GISLocation = require("../models/GISLocation");
const User = require("../models/User");
const Shelter = require("../models/Shelter");

exports.createLocation = async (req, res) => {
    const petName = String(req.body.petName || "").trim();
    const reportType = String(req.body.reportType || "").trim();
    const species = String(req.body.species || "").trim();
    const locationName = String(req.body.locationName || "").trim();
    const latitude = String(req.body.latitude || "").trim();
    const longitude = String(req.body.longitude || "").trim();
    const description = String(req.body.description || "").trim();


    if (!petName) {
        const error = new Error(
            "Pet name is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        ![
            "lost",
            "found",
            "stray",
            "rescue",
            "intake",
        ].includes(reportType)
    ) {
        const error = new Error(
            "Invalid GIS report type."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!locationName) {
        const error = new Error(
            "Location name is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        Number.isNaN(latitude) ||
        latitude < -90 ||
        latitude > 90
    ) {
        const error = new Error(
            "Invalid latitude."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        Number.isNaN(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
        const error = new Error(
            "Invalid longitude."
        );

        error.statusCode = 400;
        throw error;
    }

    const userId = req.user?.id;

    if (!userId) {
        const error = new Error(
            "Authenticated user is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const user = await User.findById(
        userId
    ).select(
        "_id name username email role"
    );

    if (!user) {
        const error = new Error(
            "Authenticated user account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const location =
        await GISLocation.create({
            petName,
            reportType,
            species,
            locationName,
            latitude,
            longitude,
            status: "open",
            description,

            createdBy: user._id,

            createdByName:
                user.name ||
                user.username ||
                "",

            createdByEmail:
                user.email || "",
        });

    return res.status(201).json({
        success: true,
        message:
            "GIS location created successfully.",
        location,
    });
};

exports.createStraySighting = async (req, res) => {
    const petName = String(req.body.petName || "Unkown Stray").trim();
    const species = String(req.body.species || "unknown").trim().toLowerCase();
    const locationName = String(req.body.locationName || "").trim();
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);
    const description = String(req.body.description || "").trim();

    if (!locationName) {
        const e = new Error("Location name is required.");
        e.statusCode = 400;
        throw e;
    }

    if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
        const e = new Error("Invalid latitude");
        e.statusCode = 400;
        throw e;
    }

    if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
        const e = new Error("Invalid longitude")
        e.statusCode = 400;
        throw e;
    }

    const userId = req.user?.id;

    if (!userId) {
        const e = new Error("Auth user is missing.");
        e.statusCode = 401;
        throw e;
    }

    const user = await User.findById(userId).select("_id name username email role");

    if (!user) {
        const e = new Error("Auth user account was not found.");
        e.statusCode = 401;
        throw e;
    }

    const sighting = await GISLocation.create({
        petName,
        reportType: "stray",
        species,
        locationName,
        latitude,
        longitude,
        status: "open",
        description,

        createdBy: user._id,

        createdByName:
            user.name ||
            user.username ||
            "",

        createdByEmail:
            user.email || "",
    });

    return res.status(201).json({
        success: true,
        message:
            "Stray sighting recorded successfully.",
        location: sighting,
    })
}

exports.getAllLocations = async (
    req,
    res
) => {
    const filter = {};

    if (req.query.reportType) {
        filter.reportType =
            String(
                req.query.reportType
            )
                .trim()
                .toLowerCase();
    }

    if (req.query.status) {
        filter.status =
            String(
                req.query.status
            )
                .trim()
                .toLowerCase();
    }

    if (req.query.species) {
        filter.species =
            String(
                req.query.species
            )
                .trim()
                .toLowerCase();
    }

    const locations =
        await GISLocation.find(
            filter
        ).sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        locations,
    });
};

exports.getPublicLocations = async (
    req,
    res
) => {
    const locations =
        await GISLocation.find({
            status: "open",
            reportType: {
                $in: [
                    "lost",
                    "found",
                    "stray",
                ],
            },
        })
            .select(
                "_id petName reportType species locationName latitude longitude status description createdAt"
            )
            .sort({
                createdAt: -1,
            });

    return res.status(200).json({
        success: true,
        locations,
    });
};

exports.getLocationById = async (
    req,
    res
) => {
    const locationId = String(
        req.params.id || ""
    ).trim();

    if (
        !mongoose.isValidObjectId(
            locationId
        )
    ) {
        const error = new Error(
            "Invalid GIS location ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const location =
        await GISLocation.findById(
            locationId
        );

    if (!location) {
        const error = new Error(
            "GIS location not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        location,
    });
};

exports.updateLocation = async (
    req,
    res
) => {
    const locationId = String(
        req.params.id || ""
    ).trim();

    if (
        !mongoose.isValidObjectId(
            locationId
        )
    ) {
        const error = new Error(
            "Invalid GIS location ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const allowedFields = [
        "petName",
        "reportType",
        "species",
        "locationName",
        "latitude",
        "longitude",
        "description",
        "status",
    ];

    const updates = {};

    for (
        const field of allowedFields
    ) {
        if (
            req.body[field] !==
            undefined
        ) {
            updates[field] =
                req.body[field];
        }
    }

    if (
        updates.reportType !==
        undefined
    ) {
        updates.reportType =
            String(
                updates.reportType
            )
                .trim()
                .toLowerCase();
    }

    if (
        updates.species !==
        undefined
    ) {
        updates.species =
            String(
                updates.species
            )
                .trim()
                .toLowerCase();
    }

    if (
        updates.status !==
        undefined
    ) {
        updates.status =
            String(
                updates.status
            )
                .trim()
                .toLowerCase();
    }

    if (
        updates.latitude !==
        undefined
    ) {
        updates.latitude =
            Number(
                updates.latitude
            );

        if (
            Number.isNaN(
                updates.latitude
            ) ||
            updates.latitude < -90 ||
            updates.latitude > 90
        ) {
            const error = new Error(
                "Invalid latitude."
            );

            error.statusCode = 400;
            throw error;
        }
    }

    if (
        updates.longitude !==
        undefined
    ) {
        updates.longitude =
            Number(
                updates.longitude
            );

        if (
            Number.isNaN(
                updates.longitude
            ) ||
            updates.longitude < -180 ||
            updates.longitude > 180
        ) {
            const error = new Error(
                "Invalid longitude."
            );

            error.statusCode = 400;
            throw error;
        }
    }

    if (
        Object.keys(updates)
            .length === 0
    ) {
        const error = new Error(
            "No valid fields provided for update."
        );

        error.statusCode = 400;
        throw error;
    }

    const location =
        await GISLocation.findByIdAndUpdate(
            locationId,
            {
                $set: updates,
            },
            {
                new: true,
                runValidators: true,
            }
        );

    if (!location) {
        const error = new Error(
            "GIS location not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "GIS location updated successfully.",
        location,
    });
};

exports.resolveLocation = async (
    req,
    res
) => {
    const locationId = String(
        req.params.id || ""
    ).trim();

    if (
        !mongoose.isValidObjectId(
            locationId
        )
    ) {
        const error = new Error(
            "Invalid GIS location ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const location =
        await GISLocation.findById(
            locationId
        );

    if (!location) {
        const error = new Error(
            "GIS location not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (
        location.status ===
        "resolved"
    ) {
        const error = new Error(
            "GIS location is already resolved."
        );

        error.statusCode = 400;
        throw error;
    }

    location.status =
        "resolved";

    await location.save();

    return res.status(200).json({
        success: true,
        message:
            "GIS location resolved successfully.",
        location,
    });
};

exports.deleteLocation = async (
    req,
    res
) => {
    const locationId = String(
        req.params.id || ""
    ).trim();

    if (
        !mongoose.isValidObjectId(
            locationId
        )
    ) {
        const error = new Error(
            "Invalid GIS location ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const location =
        await GISLocation.findByIdAndDelete(
            locationId
        );

    if (!location) {
        const error = new Error(
            "GIS location not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "GIS location deleted successfully.",
    });
};

exports.getHotspotAnalysis = async (req, res) => {
    const CLUSTER_DISTANCE_METERS = 500;

    const locations = await GISLocation.find({
        status: "open",
        reportType: {
            $in: ["lost", "found", "stray", "rescue", "intake"],
        },
        latitude: { $exists: true, $ne: null },
        longitude: { $exists: true, $ne: null },
    }).select("latitude longitude reportType");

    const reports = locations.filter((location) => {
        const latitude = Number(location.latitude);
        const longitude = Number(location.longitude);

        return (
            Number.isFinite(latitude) &&
            latitude >= -90 &&
            latitude <= 90 &&
            Number.isFinite(longitude) &&
            longitude >= -180 &&
            longitude <= 180
        );
    }).map((location) => ({
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        reportType: location.reportType,
    }));

    const toRadians = (degrees) => degrees * Math.PI / 180;

    function distanceMeters(a, b) {
        const earthRadius = 6371000;

        const dLat = toRadians(b.latitude - a.latitude);
        const dLon = toRadians(b.longitude - a.longitude);

        const lat1 = toRadians(a.latitude);
        const lat2 = toRadians(b.latitude);

        const value =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) *
                Math.cos(lat2) *
                Math.sin(dLon / 2) ** 2;

        const safeValue = Math.min(1, Math.max(0, value));

        return 2 * earthRadius * Math.asin(Math.sqrt(safeValue));
    }

    const visited = new Array(reports.length).fill(false);
    const hotspots = [];

    for (let i = 0; i < reports.length; i++) {
        if (visited[i]) continue;

        const queue = [i];
        const cluster = [];

        visited[i] = true;

        for (let head = 0; head < queue.length; head++) {
            const currentIndex = queue[head];
            const current = reports[currentIndex];

            cluster.push(current);

            for (let j = 0; j < reports.length; j++) {
                if (visited[j]) continue;

                if (
                    distanceMeters(current, reports[j]) <=
                    CLUSTER_DISTANCE_METERS
                ) {
                    visited[j] = true;
                    queue.push(j);
                }
            }
        }

        const counts = {
            lost: 0,
            found: 0,
            stray: 0,
            rescue: 0,
            intake: 0,
        };

        let latitudeSum = 0;
        let longitudeSum = 0;

        for (const report of cluster) {
            latitudeSum += report.latitude;
            longitudeSum += report.longitude;

            if (Object.hasOwn(counts, report.reportType)) {
                counts[report.reportType]++;
            }
        }

        hotspots.push({
            latitude: latitudeSum / cluster.length,
            longitude: longitudeSum / cluster.length,
            count: cluster.length,
            ...counts,
        });
    }

    hotspots.sort((a, b) => b.count - a.count);

    return res.status(200).json({
        success: true,
        totalReports: reports.length,
        clusterDistanceMeters: CLUSTER_DISTANCE_METERS,
        totalHotspots: hotspots.length,
        hotspots,
    });
};

exports.getShelters = async (req, res) => {
    const shelters = await Shelter.find({
        status: "active",
    }).sort({
        name: 1,
    });

    return res.status(200).json({
        success: true,
        shelters,
    });
};


exports.createShelter = async (req, res) => {
    const name = String(req.body.name || "").trim();
    const address = String(req.body.address || "").trim();
    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    const contact = String(req.body.contact || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const description = String(req.body.description || "").trim();

    if (!name) {
        const error = new Error("Shelter name is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!address) {
        const error = new Error("Shelter address is required.");
        error.statusCode = 400;
        throw error;
    }

    if (
        req.body.latitude === undefined ||
        req.body.latitude === "" ||
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90
    ) {
        const error = new Error("Invalid shelter latitude.");
        error.statusCode = 400;
        throw error;
    }

    if (
        req.body.longitude === undefined ||
        req.body.longitude === "" ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
    ) {
        const error = new Error("Invalid shelter longitude.");
        error.statusCode = 400;
        throw error;
    }

    const shelter = await Shelter.create({
        name,
        address,
        latitude,
        longitude,
        contact,
        email,
        description,
        status: "active",
    });

    return res.status(201).json({
        success: true,
        message: "Shelter created successfully.",
        shelter,
    });
};


exports.updateShelter = async (req, res) => {
    const shelterId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(shelterId)) {
        const error = new Error("Invalid shelter ID.");
        error.statusCode = 400;
        throw error;
    }

    const allowedFields = [
        "name",
        "address",
        "latitude",
        "longitude",
        "contact",
        "email",
        "description",
        "status",
    ];

    const updates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        const error = new Error("No valid fields provided for update.");
        error.statusCode = 400;
        throw error;
    }

    if (updates.name !== undefined) {
        updates.name = String(updates.name).trim();

        if (!updates.name) {
            const error = new Error("Shelter name cannot be empty.");
            error.statusCode = 400;
            throw error;
        }
    }

    if (updates.address !== undefined) {
        updates.address = String(updates.address).trim();

        if (!updates.address) {
            const error = new Error("Shelter address cannot be empty.");
            error.statusCode = 400;
            throw error;
        }
    }

    if (updates.latitude !== undefined) {
        if (updates.latitude === "") {
            const error = new Error("Shelter latitude is required.");
            error.statusCode = 400;
            throw error;
        }

        updates.latitude = Number(updates.latitude);

        if (
            !Number.isFinite(updates.latitude) ||
            updates.latitude < -90 ||
            updates.latitude > 90
        ) {
            const error = new Error("Invalid shelter latitude.");
            error.statusCode = 400;
            throw error;
        }
    }

    if (updates.longitude !== undefined) {
        if (updates.longitude === "") {
            const error = new Error("Shelter longitude is required.");
            error.statusCode = 400;
            throw error;
        }

        updates.longitude = Number(updates.longitude);

        if (
            !Number.isFinite(updates.longitude) ||
            updates.longitude < -180 ||
            updates.longitude > 180
        ) {
            const error = new Error("Invalid shelter longitude.");
            error.statusCode = 400;
            throw error;
        }
    }

    if (updates.contact !== undefined) {
        updates.contact = String(updates.contact).trim();
    }

    if (updates.email !== undefined) {
        updates.email = String(updates.email).trim().toLowerCase();
    }

    if (updates.description !== undefined) {
        updates.description = String(updates.description).trim();
    }

    if (updates.status !== undefined) {
        updates.status = String(updates.status).trim().toLowerCase();

        if (!["active", "inactive"].includes(updates.status)) {
            const error = new Error(
                "Shelter status must be active or inactive."
            );
            error.statusCode = 400;
            throw error;
        }
    }

    const shelter = await Shelter.findByIdAndUpdate(
        shelterId,
        { $set: updates },
        {
            new: true,
            runValidators: true,
        }
    );

    if (!shelter) {
        const error = new Error("Shelter not found.");
        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message: "Shelter updated successfully.",
        shelter,
    });
};

exports.getAllShelters = async (req, res) => {
    const shelters = await Shelter.find({})
        .sort({ name: 1 });

    return res.status(200).json({
        success: true,
        shelters,
    });
};