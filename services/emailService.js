const nodemailer = require("nodemailer");

const UserEmail = process.env.EMAIL_USER;
const UserPassword = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    service: "gmail",

    auth: {
        user: UserEmail,
        pass: UserPassword,
    },
});

async function sendOtpEmail(email, otp) {
    await transporter.sendMail({
        from: `RescueBase ${UserEmail}`,
        to: email,
        subject: "RescueBase Email Verification OTP",

        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>RescueBase Email Verification</h2>
                <p>Your verification code is:</p>
                <h1 style="letter-spacing: 4px;">${otp}</h1>
                <p>This code will expire in 10 minutes.</p>
                <p>If you did not create a RescueBase account, you can ignore this email.</p>
            </div>
        `
    })
}

async function sendPasswordResetEmail(email, otp) {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: "RescueBase Password Reset OTP",

        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>RescueBase Password Reset</h2>

                <p>
                    We received a request to reset your RescueBase password.
                </p>

                <p>Your password reset OTP is:</p>

                <h1 style="letter-spacing: 6px;">
                    ${otp}
                </h1>

                <p>
                    This code will expire in 15 minutes.
                </p>

                <p>
                    If you did not request a password reset,
                    you can safely ignore this email.
                </p>
            </div>
        `,
    });
}

async function sendApplicationUpdateEmail(email, status, applicationType = "application") {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: `RescueBase ${applicationType} Update.`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>RescueBase Application Update</h2>

                <p>
                    Your ${applicationType} application has been
                    <strong>${status}</strong>.
                </p>

                <p>
                    Please log in to RescueBase to view the latest details.
                </p>

                <p>— RescueBase</p>
            </div>
        `,
    });
}

async function sendDonationConfirmationEmail(email, donorEmail, donationType) {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: "Thank You for Your Donation to RescueBase",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Thank You for Your Donation!</h2>

                <p>
                    Dear ${donorName},
                </p>

                <p>
                    Thank you for supporting RescueBase.
                    We have received your ${donationType} donation submission.
                </p>

                <p>
                    Your donation is currently pending review.
                </p>

                <p>
                    Your support helps us provide care and assistance
                    to rescued animals.
                </p>

                <p>— RescueBase</p>
            </div>
        `,
    });
}

async function sendFosterUpdateEmail(email, title, message) {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: `RescueBase Foster Update: ${title}`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Foster Care Update</h2>

                <h3>${title}</h3>

                <p>${message}</p>

                <p>
                    Please log in to RescueBase to view the latest details.
                </p>

                <p>— RescueBase</p>
            </div>
        `,
    });
}

async function sendVaccinationReminderEmail(email, petName, vaccinationDate) {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: `RescueBase Vaccination Reminder - ${petName}`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Vaccination Reminder</h2>

                <p>
                    This is a reminder that
                    <strong>${petName}</strong>
                    has a vaccination scheduled.
                </p>

                <p>
                    Scheduled date:
                    <strong>${vaccinationDate}</strong>
                </p>

                <p>
                    Please log in to RescueBase for more details.
                </p>

                <p>— RescueBase</p>
            </div>
        `,
    });
}

async function sendInterviewScheduleEmail(email, date, time) {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: "RescueBase Interview Schedule",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>Interview Schedule</h2>

                <p>
                    Your RescueBase interview has been scheduled.
                </p>

                <p>
                    Date:
                    <strong>${date}</strong>
                </p>

                <p>
                    Time:
                    <strong>${time}</strong>
                </p>

                <p>
                    Please make sure to attend your scheduled interview.
                </p>

                <p>— RescueBase</p>
            </div>
        `,
    });
}

async function sendPetAvailableEmail(email, petName, petType) {
    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: `RescueBase: ${petName} is Available`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>New Pet Available</h2>

                <p>
                    A new ${petType || "pet"} is now available
                    through RescueBase.
                </p>

                <h3>${petName}</h3>

                <p>
                    Log in to RescueBase to view the animal's
                    profile and learn more.
                </p>

                <p>— RescueBase</p>
            </div>
        `,
    });
}

module.exports = {
    sendOtpEmail,
    sendPasswordResetEmail,
    sendApplicationUpdateEmail,
    sendDonationConfirmationEmail,
    sendFosterUpdateEmail,
    sendVaccinationReminderEmail,
    sendInterviewScheduleEmail,
    sendPetAvailableEmail,
};