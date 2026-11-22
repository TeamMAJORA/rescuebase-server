const AdoptionApplication = require("../models/AdoptionApplication");
const Notification = require("../models/Notifications");
const { sendApplicationUpdateEmail } = require("./emailService");

const OPEN_APPLICATION_STATUSES = ["pending", "interview_scheduled", "interview_completed"];

// The pet can no longer be adopted: reject every open application for it,
// tell each applicant why (in-app notice and email). Never throws.
async function closeApplicationsForUnavailablePet(animalId, petName, reason) {
    try {
        const openApplications = await AdoptionApplication.find({
            animalId,
            status: { $in: OPEN_APPLICATION_STATUSES },
        });

        if (!openApplications.length) return;

        const rejectionReason =
            `${petName || "This pet"} is no longer available for adoption` +
            (reason ? ` (${reason}).` : ".");

        await AdoptionApplication.updateMany(
            { _id: { $in: openApplications.map((application) => application._id) } },
            {
                $set: {
                    status: "rejected",
                    reviewedByName: "System",
                    reviewedByEmail: "",
                    reviewNotes: rejectionReason,
                    rejectionReason,
                    reviewedAt: new Date(),
                },
            }
        );

        for (const application of openApplications) {
            try {
                if (application.applicantUserId) {
                    await Notification.create({
                        user: application.applicantUserId,
                        title: "Adoption Application Closed",
                        message:
                            `Your application for ${application.petName} was closed. ` +
                            `${rejectionReason} You can browse other pets that are available.`,
                        type: "application_update",
                    });
                }

                if (application.email) {
                    await sendApplicationUpdateEmail(application.email, "rejected", "adoption");
                }
            } catch (notifyError) {
                console.error("Failed to notify applicant:", notifyError);
            }
        }
    } catch (error) {
        console.error("Close applications for unavailable pet error:", error);
    }
}

module.exports = { closeApplicationsForUnavailablePet };
