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