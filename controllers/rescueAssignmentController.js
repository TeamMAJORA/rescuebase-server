const mongoose = require("mongoose");

const RescueAssignment = require("../models/RescueAssignment");
const User = require("../models/User");
const Animal = require("../models/Animal");
const Notification = require("../models/Notifications");
const { sendRescueAssignmentEmail } = require("../services/emailService");

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };

// Volunteers and staff can both be given a rescue
async function findAssignablePerson(personId) {
    if (!mongoose.isValidObjectId(personId)) {
        const e = new Error("Invalid volunteer ID.");
        e.statusCode = 400;
        throw e;
    }

    const person = await User.findOne({
        _id: personId,
        role: { $in: ["volunteer", "staff"] },
    }).select("_id name username email");

    if (!person) {
        const e = new Error("Volunteer or staff account was not found.");
        e.statusCode = 404;
        throw e;
    }

    return person;
}

async function emailSafely(email, title, message) {
    if (!email) return;

    try {
        await sendRescueAssignmentEmail(email, title, message);
    } catch (error) {
        console.error("Rescue assignment email failed:", error.message);
    }
}

// An open rescue is shown to every volunteer, so tell them all it's there
async function announceOpenRescue(assignment) {
    const volunteers = await User.find({ role: "volunteer" }).select("_id");

    if (!volunteers.length) return;

    await Notification.insertMany(
        volunteers.map((volunteer) => ({
            user: volunteer._id,
            title: "Open Rescue Available",
            message: `"${assignment.title}" at ${assignment.location} is open. The first volunteer to claim it takes it.`,
            type: "rescue_update",
        }))
    );
}

async function notifyAssignedPerson(assignment) {
    const message = `You have been assigned a new rescue task: ${assignment.title}.`;

    await createNotification({
        userId: assignment.volunteerId,
        title: "New Rescue Assignment",
        message,
        type: "rescue_update",
    });

    await emailSafely(assignment.volunteerEmail, "New Rescue Assignment", message);
}

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

    if (!title) {
        const e = new Error("Assignment title is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!description) {
        const e = new Error("Assignment description is required.");
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

    // No one chosen = open for any volunteer to claim
    const volunteer = volunteerId ? await findAssignablePerson(volunteerId) : null;

    // Validate optional animal.
    let animal = null;

    if (animalId) {
        if (!mongoose.isValidObjectId(animalId)) {
            const e = new Error("Invalid animal ID.");
            e.statusCode = 400;
            throw e;
        }

        animal = await Animal.findById(animalId);

        if (!animal) {
            const e = new Error("Animal profile was not found.");
            e.statusCode = 404;
            throw e;
        }
    }

    const creatorId = req.user?.id || req.user?._id;

    if (!creatorId) {
        const e = new Error("Authenticated creator is missing.");
        e.statusCode = 401;
        throw e;
    }

    const creator = await User.findById(creatorId)
        .select("_id name username email role");

    if (!creator || !["admin", "staff"].includes(creator.role)) {
        const e = new Error("Only Admin and Staff can create rescues.");
        e.statusCode = 403;
        throw e;
    }

    const assignment = await RescueAssignment.create({
        volunteerId: volunteer?._id || null,
        volunteerName: volunteer
            ? volunteer.name || volunteer.username || "Volunteer"
            : "",
        volunteerEmail: volunteer?.email || "",

        animalId: animal?._id || null,
        animalName: animal?.name || "",
        animalType: animal?.type || "",
        animalBreed: animal?.breed || "",
        animalImage: animal?.image || "",

        assignmentType: req.body.assignmentType || "rescue",
        title,
        description,
        location,
        scheduledDate,
        scheduledTime: String(req.body.scheduledTime || "").trim(),
        priority: req.body.priority || "normal",

        // No volunteer = Open. Assigned volunteer = Pending.
        status: volunteer ? "pending" : "open",

        // Keep existing schema field names for compatibility.
        adminId: creator._id,
        adminName: creator.name || creator.username || "Staff",
        adminEmail: creator.email || "",
    });

    if (volunteer) {
        await notifyAssignedPerson(assignment);
    } else {
        await announceOpenRescue(assignment);
    }

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

exports.getOpenAssignments = async (req, res) => {
    const assignments = (await RescueAssignment.find({
        status: "open",
        $or: [
            { volunteerId: null },
            { volunteerId: { $exists: false } },
        ],
    }).sort({ scheduledDate: 1, createdAt: -1 }))
        // Most urgent first, then soonest
        .sort((first, second) => (PRIORITY_RANK[first.priority] ?? 2) - (PRIORITY_RANK[second.priority] ?? 2));

    return res.status(200).json({
        success: true,
        count: assignments.length,
        assignments,
    });
};

exports.claimAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const volunteerId = req.user?.id || req.user?._id;

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    if (!volunteerId || !mongoose.isValidObjectId(volunteerId)) {
        const e = new Error("Authenticated volunteer is missing.");
        e.statusCode = 401;
        throw e;
    }

    const volunteer = await User.findOne({
        _id: volunteerId,
        role: "volunteer",
    }).select("_id name username email");

    if (!volunteer) {
        const e = new Error("Volunteer account was not found.");
        e.statusCode = 403;
        throw e;
    }

    // Atomic claim: only one volunteer can update an Open assignment.
    const assignment = await RescueAssignment.findOneAndUpdate(
        {
            _id: assignmentId,
            status: "open",
            $or: [
                { volunteerId: null },
                { volunteerId: { $exists: false } },
            ],
        },
        {
            $set: {
                volunteerId: volunteer._id,
                volunteerName: volunteer.name || volunteer.username || "Volunteer",
                volunteerEmail: volunteer.email || "",
                status: "accepted",
                acceptedAt: new Date(),
            },
        },
        {
            new: true,
            runValidators: true,
        }
    );

    if (!assignment) {
        const existing = await RescueAssignment.findById(assignmentId);

        if (!existing) {
            const e = new Error("Rescue assignment not found.");
            e.statusCode = 404;
            throw e;
        }

        const e = new Error(
            existing.status !== "open"
                ? "This rescue is no longer available to claim."
                : "This rescue has already been claimed."
        );
        e.statusCode = 409;
        throw e;
    }

    await createNotification({
        userId: assignment.adminId,
        title: "Open Rescue Claimed",
        message: `${assignment.volunteerName} claimed "${assignment.title}".`,
        type: "rescue_update",
    });

    await emailSafely(
        assignment.adminEmail,
        "Open Rescue Claimed",
        `${assignment.volunteerName} claimed "${assignment.title}".`
    );

    return res.status(200).json({
        success: true,
        message: "Rescue assignment claimed successfully.",
        assignment,
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
        title: "Rescue Assignment Accepted.",
        message:
            `${assignment.volunteerName} accepted "${assignment.title}".`,
        type: "rescue_update",
    });

    await emailSafely(
        assignment.adminEmail,
        "Rescue Assignment Accepted",
        `${assignment.volunteerName} accepted "${assignment.title}".`,
    );

    return res.status(200).json({
        success: true,
        message: "Rescue assignment accepted.",
        assignment,
    });
};


exports.declineAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const volunteerId = req.user?.id || req.user?._id;
    const volunteer = await User.findById(volunteerId).select("name username");
    const volunteerName = volunteer?.name || volunteer?.username || "The assigned volunteer";

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    const reason = String(req.body.reason || "").trim();

    const assignment = await RescueAssignment.findOneAndUpdate(
        {
            _id: assignmentId,
            volunteerId,
            status: "pending",
        },
        {
            $set: {
                status: "open",
                volunteerId: null,
                volunteerName: "",
                volunteerEmail: "",
                declinedAt: new Date(),
                volunteerNotes: reason,
                acceptedAt: null,
            },
        },
        {
            new: true,
            runValidators: true,
        }
    );

    if (!assignment) {
        const existing = await RescueAssignment.findById(assignmentId);

        if (!existing) {
            const e = new Error("Rescue assignment not found.");
            e.statusCode = 404;
            throw e;
        }

        const e = new Error(
            "Only your pending assignments can be declined."
        );
        e.statusCode = 409;
        throw e;
    }

    const message = `${volunteerName} declined "${assignment.title}".`;

    await createNotification({
        userId: assignment.adminId,
        title: "Rescue Assignment Declined",
        message,
        type: "rescue_update",
    });

    if (assignment.adminEmail) {
        await emailSafely(
            assignment.adminEmail,
            "Rescue Assignment Declined",
            message
        );
    }

    await announceOpenRescue(assignment);

    return res.status(200).json({
        success: true,
        message: "Assignment declined and returned to the Open rescue queue.",
        assignment,
    });
};


exports.dropAssignment = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const volunteerId = req.user?.id || req.user?._id;

    if (!mongoose.isValidObjectId(assignmentId)) {
        const e = new Error("Invalid rescue assignment ID.");
        e.statusCode = 400;
        throw e;
    }

    const volunteer = await User.findById(volunteerId)
        .select("name username");

    if (!volunteer) {
        const e = new Error("Volunteer account was not found.");
        e.statusCode = 404;
        throw e;
    }

    const volunteerName =
        volunteer.name || volunteer.username || "Volunteer";

    const assignment = await RescueAssignment.findOneAndUpdate(
        {
            _id: assignmentId,
            volunteerId,
            status: "accepted",
        },
        {
            $set: {
                status: "open",
                volunteerId: null,
                volunteerName: "",
                volunteerEmail: "",
                acceptedAt: null,
                startedAt: null,
                declinedAt: null,
                volunteerNotes: String(req.body.reason || "").trim(),
            },
        },
        {
            new: true,
            runValidators: true,
        }
    );

    if (!assignment) {
        const existing = await RescueAssignment.findById(assignmentId);

        if (!existing) {
            const e = new Error("Rescue assignment not found.");
            e.statusCode = 404;
            throw e;
        }

        const e = new Error(
            "Only your accepted rescue assignments can be dropped."
        );
        e.statusCode = 409;
        throw e;
    }

    const message =
        `${volunteerName} released "${assignment.title}" back to the Open rescue queue.`;

    await createNotification({
        userId: assignment.adminId,
        title: "Rescue Assignment Released",
        message: `${volunteerName} released "${assignment.title}" back to the Open rescue list.`,
        type: "rescue_update",
    });

    if (assignment.adminEmail) {
        await emailSafely(
            assignment.adminEmail,
            "Rescue Assignment Released",
            message
        );
    }

    await announceOpenRescue(assignment);

    return res.status(200).json({
        success: true,
        message: "Rescue assignment released successfully.",
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

    await emailSafely(
        assignment.adminEmail,
        "Rescue Assignment Started",
        `${assignment.volunteerName} started "${assignment.title}".`
    );

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

    await emailSafely(
        assignment.adminEmail,
        "Rescue Assignment Completed",
        `${assignment.volunteerName} completed "${assignment.title}".`
    );

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

    // Change who it's for ("" = open). Not once someone has accepted or started it.
    let assigneeChange = null;

    if (req.body.volunteerId !== undefined) {
        const newVolunteerId = String(req.body.volunteerId || "").trim();
        const currentVolunteerId = assignment.volunteerId ? String(assignment.volunteerId) : "";

        if (newVolunteerId !== currentVolunteerId) {
            if (!["open", "pending", "declined"].includes(assignment.status)) {
                const error = new Error(
                    "Someone is already working on this rescue, so it can't be reassigned."
                );
                error.statusCode = 409;
                throw error;
            }

            const person = newVolunteerId ? await findAssignablePerson(newVolunteerId) : null;

            assignment.volunteerId = person?._id || null;
            assignment.volunteerName = person ? person.name || person.username || "Volunteer" : "";
            assignment.volunteerEmail = person?.email || "";
            assignment.status = person ? "pending" : "open";
            assignment.acceptedAt = null;
            assigneeChange = person ? "assigned" : "opened";
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

    if (assigneeChange === "assigned") {
        await notifyAssignedPerson(assignment);
    } else if (assigneeChange === "opened") {
        await announceOpenRescue(assignment);
    } else if (assignment.volunteerId) {
        const message = `Your rescue assignment "${assignment.title}" has been updated.`;

        await createNotification({
            userId: assignment.volunteerId,
            title: "Rescue Assignment Updated",
            message,
            type: "rescue_update",
        });

        await emailSafely(assignment.volunteerEmail, "Rescue Assignment Updated", message);
    }

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

    await emailSafely(
        assignment.volunteerEmail,
        "Rescue Assignment Cancelled",
        `Your rescue assignment "${assignment.title}" has been cancelled.`
    );

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