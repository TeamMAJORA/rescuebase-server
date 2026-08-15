const mongoose = require("mongoose");

const RescueAssignment = require("../models/RescueAssignment");
const User = require("../models/User");
const Animal = require("../models/Animal");
const Notification = require("../models/Notifications");

async function createNotification({
    userId,
    title,
    message,
    type = "rescue_update",
}) {
    if (!userId) return;

    await Notification.create({
        user: userId,
        title,
        message,
        type,
    });
}

exports.createAssignment = async (req, res) => {
    const volunteerId = String(req.body.volunteerId || "").trim();
    const animalId = String(req.body.animalId || "").trim();
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const location = String(req.body.location || "").trim();

    if (!mongoose.isValidObjectId(volunteerId)) {
        const e = new Error("Valid volunteer ID is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!title) {
        const e = new Error("Assignment title is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!description) {
        const e = new Error("Assignment description is required");
        e.statusCode = 400;
        throw e;
    }

    if (!location) {
        const e = new Error("Assignment location is required.");
        e.statusCode = 400;
        throw e;
    }

    const scheduledDate = new Date(req.body.scheduledDate);

    if (Number.isNaN(scheduledDate.getTime())) {
        const e = new Error("Valid scheduled date is required.");
        e.statusCode = 400;
        throw e;
    }

    const volunteer = await User.findOne({
        _id: volunteerId,
        role: "volunteer",
    }).select("_id name username email role");

    if (!volunteer) {
        const e = new Error("Volunteer account was not found.");
        e.statusCode = 400;
        throw e;
    }

    let animal = null;

    if (animalId && mongoose.isValidObjectId(animalId)) {
        animal = await Animal.findById(animalId);

        if (!animal) {
            const e = new Error("Animal profile was not found.");
            e.statusCode = 400;
            throw e;
        }
    }

    const adminId = req.user?.id;

    if (!adminId) {
        const e = new Error("Auth admin user is missing.");
        e.statusCode = 400;
        throw e;
    }

    const admin = await User.findById(adminId).select("_id name username email");

    if (!admin) {
        const e = new Error("Admin account was not found.");
        e.statusCode = 400;
        throw e;
    }

    const assignment = await RescueAssignment.create({
        volunteerId: volunteer._id,
        volunteerName:
            volunteer.name ||
            volunteer.username ||
            "Volunteer",
        volunteerEmail:
            volunteer.email,
        animalId:
            animal?._id || null,
        animalName:
            animal?.name || "",
        animalType:
            animal?.type || "",
        animalBreed:
            animal?.breed || "",
        animalImage:
            animal?.image || "",
        assignmentType:
            req.body.assignmentType ||
            "rescue",
        title,
        description,
        location,
        scheduledDate,
        scheduledTime:
            String(
                req.body.scheduledTime ||
                ""
            ).trim(),
        priority:
            req.body.priority ||
            "normal",
        status: "pending",
        adminId: admin._id,
        adminName:
            admin.name ||
            admin.username ||
            "Admin",
        adminEmail:
            admin.email || "",
    });

    await createNotification({
        userId: volunteer._id,
        title: "New Rescue Assignment.",
        message: `You have been assigned a new rescue task: ${assignment.title}.`,
        type: "rescue_update",
    });

    return res.status(201).json({
        success: true,
        message: "Rescue assignment created successfully.",
        assignment,
    });
};

exports.getAllAssignments = async (req, res) => {
    const assignments = await RescueAssignment.find().sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        assignments,
    });
}

exports.getMyAssignments = async (req, res) => {
    const volunteerId = req.user?.id;

    if (!volunteerId) {
        const e = new Error("Auth volunteer is missing.");
        e.statusCode = 401;
        throw e;
    }

    const assignments = await RescueAssignment.find({ volunteerId, }).sort({ scheduledDate: 1, createdAt: -1, });

    return res.status(200).json({
        success: true,
        assignments,
    });
};

exports.getAssignmentById = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    const assignment = await RescueAssignment.findById(assignmentId);

    if (!assignment) {
        const e = new Error("Rescue assignment not found.");
        e.statusCode = 404;
        throw e;
    }

    return res.status(200).json({
        success: true,
        assignment,
    });
};

exports.acceptAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const volunteerId = req.user?.id;

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID");
        e.statusCode = 400;
        throw e;
    }

    const assignment = await RescueAssignment.findOne({
        _id: assignmentId,
        volunteerId,
    });

    if (!assignment) {
        const e = new Error("Rescue assignment not found.");
        e.statusCode = 404;
        throw e;
    }

    if (assignment.status !== "pending") {
        const e = new Error("Only pending assignments can be accepted.");
        e.statusCode = 400;
        throw e;
    }

    assignment.status = "accepted";
    assignment.acceptedAt = new Date();

    await assignment.save();

    await createNotification({
        userId: assignment.adminId,
        title: "Rescue Assignment Accepted",
        message:
            `${assignment.volunteerName} accepted "${assignment.title}".`,
        type: "rescue_update",
    });

    return res.status(200).json({
        success: true,
        message: "Rescue assignment accepted.",
        assignment,
    });
};

exports.declineAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const volunteerId = req.user?.id;

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    if (!volunteerId) {
        const e = new Error("Auth volunteer is missing.")
        e.statusCode = 401;
        throw e;
    }

    const assignment = await RescueAssignment.findOne({
        _id: assignmentId,
        volunteerId,
    });

    if (!assignment) {
        const e = new Error("Rescue assignment not found.");
        e.statusCode = 404;
        throw e;
    }

    if (assignment.status !== "pending") {
        const e = new Error("Only pending can be declined.");
        e.statusCode = 400;
        throw e;
    }

    const reason = String(req.body.reason || "").trim();

    assignment.status = "declined";
    assignment.declinedAt = new Date();
    assignment.volunteerNotes = reason;

    await assignment.save();

    await createNotification({
        userId: assignment.adminId,
        title: "Rescue Assignment Declined",
        message:
            `${assignment.volunteerName} declined "${assignment.title}".`,
        type: "rescue_update",
    });

    return res.status(200).json({
        success: true,
        message: "Rescue assignment declined.",
        assignment,
    });
};

exports.startAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const volunteerId = req.user?.id;

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Inavlid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    const assignment = await RescueAssignment.findOne({
        _id: assignmentId,
        volunteerId,
    });

    if (!assignment) {
        const e = new Error("Rescue assignment not found.");
        e.statusCode = 404;
        throw e;
    }

    if (assignment.status !== "accepted") {
        const e = new Error("Only accepted assignments can be started.");
        e.statusCode = 400;
        throw e;
    }

    assignment.status = "active";
    assignment.startedAt = new Date();

    await assignment.save();

    await createNotification({
        userId: assignment.adminId,
        title: "Rescue Assignment Started",
        message:
            `${assignment.volunteerName} started "${assignment.title}".`,
        type: "rescue_update",
    });

    return res.status(200).json({
        success: true,
        message: "Rescue assignment started.",
        assignment,
    });
};

exports.completeAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();

    const volunteerId = req.user?.id;

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    const assignment = await RescueAssignment.findOne({
        _id: assignmentId,
        volunteerId,
    });

    if (!assignment) {
        const e = new Error("Rescue assignment not found.");
        e.statusCode = 404;
        throw e;
    }

    if (assignment.status !== "active") {
        const e = new Error("Only active assignments can be completed.");
        e.statusCode = 400;
        throw e;
    }

    const completionNotes = String(req.body.completionNotes || "").trim();

    assignment.status = "completed";
    assignment.completedAt = new Date();
    assignment.completionNotes = completionNotes;

    await assignment.save();

    await createNotification({
        userId: assignment.adminId,
        title: "Rescue Assignment Completed",
        message:
            `${assignment.volunteerName} completed "${assignment.title}".`,
        type: "rescue_update",
    });

    return res.status(200).json({
        success: true,
        message: "Rescue assignment completed.",
        assignment,
    });
};

exports.updateAssignment = async (req, res) => {
    const assignmentId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(assignmentId)) {
        const error = new Error(
            "Invalid rescue assignment ID."
        );
        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await RescueAssignment.findById(
            assignmentId
        );

    if (!assignment) {
        const error = new Error(
            "Rescue assignment not found."
        );
        error.statusCode = 404;
        throw error;
    }

    if (
        ["completed", "cancelled"].includes(
            assignment.status
        )
    ) {
        const error = new Error(
            "Completed or cancelled assignments cannot be edited."
        );
        error.statusCode = 400;
        throw error;
    }

    const allowedFields = [
        "animalId",
        "assignmentType",
        "title",
        "description",
        "location",
        "scheduledDate",
        "scheduledTime",
        "priority",
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            assignment[field] =
                req.body[field];
        }
    }

    if (req.body.animalId !== undefined) {
        const animalId = String(
            req.body.animalId || ""
        ).trim();

        if (
            animalId &&
            !mongoose.isValidObjectId(animalId)
        ) {
            const error = new Error(
                "Invalid animal ID."
            );
            error.statusCode = 400;
            throw error;
        }

        if (animalId) {
            const animal =
                await Animal.findById(
                    animalId
                );

            if (!animal) {
                const error = new Error(
                    "Animal profile was not found."
                );
                error.statusCode = 404;
                throw error;
            }

            assignment.animalId = animal._id;
            assignment.animalName =
                animal.name || "";
            assignment.animalType =
                animal.type || "";
            assignment.animalBreed =
                animal.breed || "";
            assignment.animalImage =
                animal.image || "";
        } else {
            assignment.animalId = null;
            assignment.animalName = "";
            assignment.animalType = "";
            assignment.animalBreed = "";
            assignment.animalImage = "";
        }
    }

    if (
        req.body.scheduledDate !==
        undefined
    ) {
        const date = new Date(
            req.body.scheduledDate
        );

        if (Number.isNaN(date.getTime())) {
            const error = new Error(
                "Invalid scheduled date."
            );
            error.statusCode = 400;
            throw error;
        }

        assignment.scheduledDate = date;
    }

    await assignment.save();

    await createNotification({
        userId: assignment.volunteerId,
        title: "Rescue Assignment Updated",
        message:
            `Your rescue assignment "${assignment.title}" has been updated.`,
        type: "rescue_update",
    });

    return res.status(200).json({
        success: true,
        message:
            "Rescue assignment updated successfully.",
        assignment,
    });
};

exports.cancelAssignment = async (req, res) => {
    const assignmentId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(assignmentId)) {
        const error = new Error(
            "Invalid rescue assignment ID."
        );
        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await RescueAssignment.findById(
            assignmentId
        );

    if (!assignment) {
        const error = new Error(
            "Rescue assignment not found."
        );
        error.statusCode = 404;
        throw error;
    }

    if (
        ["completed", "cancelled"].includes(
            assignment.status
        )
    ) {
        const error = new Error(
            "This assignment can no longer be cancelled."
        );
        error.statusCode = 400;
        throw error;
    }

    assignment.status = "cancelled";
    assignment.cancelledAt = new Date();

    await assignment.save();

    await createNotification({
        userId: assignment.volunteerId,
        title: "Rescue Assignment Cancelled",
        message:
            `Your rescue assignment "${assignment.title}" has been cancelled.`,
        type: "rescue_update",
    });

    return res.status(200).json({
        success: true,
        message:
            "Rescue assignment cancelled.",
        assignment,
    });
};

exports.deleteAssignment = async (req, res) => {
    const assignmentId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(assignmentId)) {
        const error = new Error(
            "Invalid rescue assignment ID."
        );
        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await RescueAssignment.findById(
            assignmentId
        );

    if (!assignment) {
        const error = new Error(
            "Rescue assignment not found."
        );
        error.statusCode = 404;
        throw error;
    }

    if (
        ["accepted", "active", "completed"].includes(
            assignment.status
        )
    ) {
        const error = new Error(
            "Assignments that have been accepted or started cannot be deleted."
        );
        error.statusCode = 400;
        throw error;
    }

    await RescueAssignment.findByIdAndDelete(
        assignmentId
    );

    if (
        assignment.status !== "cancelled"
    ) {
        await createNotification({
            userId: assignment.volunteerId,
            title: "Rescue Assignment Removed",
            message:
                `The rescue assignment "${assignment.title}" has been removed.`,
            type: "rescue_update",
        });
    }

    return res.status(200).json({
        success: true,
        message:
            "Rescue assignment deleted successfully.",
    });
};