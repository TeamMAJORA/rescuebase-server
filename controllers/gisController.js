const mongoose = require("mongoose");
const GISLocation = require("../models/GISLocation");
const User = require("../models/User");

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
        uccess: true,
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
    const locations = await GISLocation.find({
        status: "open",
        latitude: { $exists: true },
        longitude: { $exists: true },
    }).select(
        "latitude longitude reportType species"
    );

    const GRID_SIZE = 0.01;

    const grid = new Map();

    for (const location of locations) {
        const latitude =
            Number(location.latitude);

        const longitude =
            Number(location.longitude);

        if (
            Number.isNaN(latitude) ||
            Number.isNaN(longitude)
        ) {
            continue;
        }

        const latCell =
            Math.floor(latitude / GRID_SIZE);

        const lngCell =
            Math.floor(longitude / GRID_SIZE);

        const key =
            `${latCell}:${lngCell}`;

        if (!grid.has(key)) {
            grid.set(key, {
                latCell,
                lngCell,

                count: 0,

                latitudeSum: 0,
                longitudeSum: 0,

                lost: 0,
                found: 0,
                stray: 0,
            });
        }

        const cell =
            grid.get(key);

        cell.count++;

        cell.latitudeSum += latitude;
        cell.longitudeSum += longitude;

        if (location.reportType === "lost") {
            cell.lost++;
        }

        if (location.reportType === "found") {
            cell.found++;
        }

        if (location.reportType === "stray") {
            cell.stray++;
        }
    }

    const hotspots =
        Array.from(grid.values())
            .map((cell) => ({
                latCell: cell.latCell,
                lngCell: cell.lngCell,

                count: cell.count,

                lost: cell.lost,
                found: cell.found,
                stray: cell.stray,

                latitude:
                    cell.latitudeSum /
                    cell.count,

                longitude:
                    cell.longitudeSum /
                    cell.count,
            }))
            .sort(
                (a, b) =>
                    b.count - a.count
            );

    return res.status(200).json({
        success: true,
        totalReports: locations.length,
        hotspots,
    });
};