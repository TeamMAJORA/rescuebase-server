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

module.exports = { sendOtpEmail, sendPasswordResetEmail }