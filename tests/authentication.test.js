// Authentication & Account Module (CASE-001 to CASE-034)
// Controllers and routes run for real; the database, email and Firebase are replaced.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");

const { mock, query, fakeDocument, callRoute, callHandler, stubSettings, sentEmails, newId } = require("./helpers/http");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const authRoutes = require("../routes/authRoutes");
const userRoutes = require("../routes/userRoutes");
const generateToken = require("../utils/generateToken");
const jwt = require("jsonwebtoken");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

const STRONG_PASSWORD = "Abcdef1!";

function signupBody(overrides = {}) {
    return {
        username: "newuser",
        email: "newuser@test.rescuebase",
        password: STRONG_PASSWORD,
        confirmPassword: STRONG_PASSWORD,
        ...overrides,
    };
}

async function verifiedUser(overrides = {}) {
    return fakeDocument({
        email: "adopter@test.rescuebase",
        role: "adopter",
        status: "active",
        provider: "local",
        verified: true,
        password: await bcrypt.hash(STRONG_PASSWORD, 4),
        passwordLoginAttempts: 0,
        ...overrides,
    });
}

describe("Authentication & Account: Register, Log In & Reset Password", () => {
    test("CASE-001 | Description: User enters invalid email format. | Expected: Registration fails with error message.", async () => {
        stubSettings();
        mock.method(User, "findOne", () => query(null));
        const created = mock.method(User, "create", async (data) => fakeDocument(data));

        const result = await callRoute(authRoutes, "POST", "/email/signup", {
            body: signupBody({ email: "not-an-email" }),
        });

       
        assert.equal(result.status >= 400 && result.status < 500, true, "the server should refuse a badly formed email");
        assert.equal(created.mock.callCount(), 0, "no account should be created");
    });

    test("CASE-002 | Description: User registers with an email that already has an account. | Expected: Registration fails with duplicate account message.", async () => {
        stubSettings();
        mock.method(User, "findOne", () => query(fakeDocument({ verified: true, provider: "local" })));
        const created = mock.method(User, "create", async (data) => fakeDocument(data));

        const result = await callRoute(authRoutes, "POST", "/email/signup", { body: signupBody() });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /already registered/i);
        assert.equal(created.mock.callCount(), 0);
    });

    test("CASE-003 | Description: User enters a password that breaks the password rules. | Expected: Registration fails with password error message.", async () => {
        stubSettings();
        mock.method(User, "findOne", () => query(null));

        const result = await callRoute(authRoutes, "POST", "/email/signup", {
            body: signupBody({ password: "abcdefg1", confirmPassword: "abcdefg1" }),
        });

        assert.equal(result.status, 400);
        assert.equal(result.body.success, false);
    });

    test("CASE-004 | Description: User registers with valid details and the correct emailed OTP. | Expected: Account is created and verified.", async () => {
        stubSettings();
        mock.method(User, "findOne", () => query(null));
        let savedData;
        mock.method(User, "create", async (data) => { savedData = data; return fakeDocument(data); });

        const signup = await callRoute(authRoutes, "POST", "/email/signup", { body: signupBody() });

        assert.equal(signup.status, 201);
        assert.equal(savedData.role, "adopter");
        assert.equal(savedData.verified, false);
        assert.match(savedData.emailOtp, /^\d{6}$/);
        assert.equal(sentEmails.some((mail) => mail.name === "sendOtpEmail"), true);
        assert.equal(signup.body.user.password, undefined, "the password hash must not be returned");

        const pending = fakeDocument({
            ...savedData,
            emailOtpExpires: new Date(Date.now() + 60000),
            emailOtpAttempts: 0,
            role: "adopter",
        });
        mock.method(User, "findOne", () => query(pending));

        const verify = await callRoute(authRoutes, "POST", "/email/verify-otp", {
            body: { email: savedData.email, otp: savedData.emailOtp },
        });

        assert.equal(verify.status, 200);
        assert.equal(pending.verified, true);
        assert.ok(verify.body.token, "a session token is issued so the app can open the dashboard");
    });

    test("CASE-005 | Description: User enters a wrong or expired registration OTP. | Expected: Verification fails with error message.", async () => {
        stubSettings();
        const wrong = fakeDocument({ verified: false, emailOtp: "123456", emailOtpExpires: new Date(Date.now() + 60000), emailOtpAttempts: 0 });
        mock.method(User, "findOne", () => query(wrong));
        const wrongResult = await callRoute(authRoutes, "POST", "/email/verify-otp", { body: { email: "a@test.rescuebase", otp: "000000" } });
        assert.equal(wrongResult.status, 400);
        assert.match(wrongResult.body.message, /invalid otp/i);
        assert.equal(wrong.emailOtpAttempts, 1);

        mock.restoreAll();
        stubSettings();
        const expired = fakeDocument({ verified: false, emailOtp: "123456", emailOtpExpires: new Date(Date.now() - 1000), emailOtpAttempts: 0 });
        mock.method(User, "findOne", () => query(expired));
        const expiredResult = await callRoute(authRoutes, "POST", "/email/verify-otp", { body: { email: "a@test.rescuebase", otp: "123456" } });
        assert.equal(expiredResult.status, 400);
        assert.match(expiredResult.body.message, /expired/i);
        assert.match(expiredResult.body.message, /request a new code/i, "the user is told to request a new OTP");
    });

    test("CASE-005 (new code) | Description: User requests a new registration OTP. | Expected: A new OTP is sent by email.", async () => {
        const pending = fakeDocument({ verified: false, emailOtp: "111111", emailOtpAttempts: 3 });
        mock.method(User, "findOne", () => query(pending));

        const result = await callRoute(authRoutes, "POST", "/email/resend-otp", { body: { email: "a@test.rescuebase" } });

        assert.equal(result.status, 200);
        assert.match(pending.emailOtp, /^\d{6}$/);
        assert.equal(pending.emailOtpAttempts, 0);
        assert.equal(sentEmails.length, 1);
    });

    test("CASE-006 | Description: User signs in with Google. | Expected: Login OTP step starts.", async () => {
        const existing = fakeDocument({ email: "google@test.rescuebase", role: "adopter", status: "active", provider: "google" });
        mock.method(User, "findOne", () => query(existing));
        const controller = require("../controllers/authController");

        // The Firebase token check (verifyFirebaseToken) talks to Google, so the controller runs with the decoded user.
        const result = await callHandler(controller.googleLogin, {
            body: {},
            firebaseUser: { uid: "firebase-uid-1", email: "google@test.rescuebase" },
        });

        assert.equal(result.status, 200);
        assert.equal(result.body.requiresOtp, true);
        assert.match(existing.loginOtp, /^\d{6}$/);
        assert.equal(sentEmails.some((mail) => mail.name === "sendOtpEmail"), true);

        // and the OTP then returns a token for the user's role
        const verified = await callRoute(authRoutes, "POST", "/email/verify-login-otp", { body: { email: existing.email, otp: existing.loginOtp } });
        assert.equal(verified.status, 200);
        assert.ok(verified.body.token);
    });

    test("CASE-007 | Description: User leaves the email or password empty on login. | Expected: Login fails with required field message.", async () => {
        const noPassword = await callRoute(authRoutes, "POST", "/email/login", { body: { email: "a@test.rescuebase", password: "" } });
        assert.equal(noPassword.status, 400);
        assert.deepEqual(noPassword.body.missingFields, ["password"]);

        const noEmail = await callRoute(authRoutes, "POST", "/email/login", { body: { email: "", password: "x" } });
        assert.equal(noEmail.status, 400);
        assert.deepEqual(noEmail.body.missingFields, ["email"]);
    });

    test("CASE-008 | Description: User enters a correct email and a wrong password. | Expected: Login fails with invalid credentials message.", async () => {
        const user = await verifiedUser();
        mock.method(User, "findOne", () => query(user));

        const result = await callRoute(authRoutes, "POST", "/email/login", { body: { email: user.email, password: "Wrong#Pass1" } });

        assert.equal(result.status, 401);
        assert.match(result.body.message, /invalid email or password/i);
        assert.equal(user.passwordLoginAttempts, 1);
    });

    test("CASE-009 | Description: User enters valid credentials and the correct login OTP. | Expected: Login succeeds and a token for the user's role is given.", async () => {
        const user = await verifiedUser({ role: "staff" });
        mock.method(User, "findOne", () => query(user));

        const first = await callRoute(authRoutes, "POST", "/email/login", { body: { email: user.email, password: STRONG_PASSWORD } });
        assert.equal(first.status, 200);
        assert.equal(first.body.requiresOtp, true);
        assert.equal(first.body.token, undefined, "no token before the OTP is entered");
        assert.match(user.loginOtp, /^\d{6}$/);

        const second = await callRoute(authRoutes, "POST", "/email/verify-login-otp", { body: { email: user.email, otp: user.loginOtp } });
        assert.equal(second.status, 200);
        const decoded = jwt.verify(second.body.token, process.env.JWT_SECRET, { issuer: "RescueBase", audience: "rescuebase-client" });
        assert.equal(decoded.role, "staff");
    });

    test("CASE-010 | Description: User enters wrong login OTPs until the limit. | Expected: Login is locked.", async () => {
        const user = await verifiedUser({
            loginOtp: "123456",
            loginOtpExpires: new Date(Date.now() + 60000),
            loginOtpAttempts: 0,
        });
        mock.method(User, "findOne", () => query(user));

        let last;
        for (let attempt = 1; attempt <= 5; attempt++) {
            last = await callRoute(authRoutes, "POST", "/email/verify-login-otp", { body: { email: user.email, otp: "000000" } });
        }

        assert.equal(last.status, 429);
        assert.ok(user.loginOtpLockedUntil > new Date(), "the account is locked for a while");

        const locked = await callRoute(authRoutes, "POST", "/email/verify-login-otp", { body: { email: user.email, otp: "123456" } });
        assert.equal(locked.status, 429, "even the right OTP is refused while locked");
    });

    test("CASE-010 (log in again) | Description: Locked user logs in again with the right password. | Expected: No new code is sent; still locked.", async () => {
        stubSettings();
        const user = await verifiedUser({ loginOtpLockedUntil: new Date(Date.now() + 10 * 60000) });
        mock.method(User, "findOne", () => query(user));

        const result = await callRoute(authRoutes, "POST", "/email/login", { body: { email: user.email, password: STRONG_PASSWORD } });

        assert.equal(result.status, 429);
        assert.match(result.body.message, /try again in \d+ minute/i);
        assert.equal(sentEmails.length, 0, "no fresh code is emailed while locked");
        assert.ok(user.loginOtpLockedUntil > new Date(), "the lock is not cleared");
    });

    test("CASE-005 (lock) | Description: User enters wrong registration OTPs until the limit, then asks for a new code. | Expected: Locked; no new code.", async () => {
        stubSettings();
        const pending = fakeDocument({ verified: false, emailOtp: "123456", emailOtpExpires: new Date(Date.now() + 60000), emailOtpAttempts: 0 });
        mock.method(User, "findOne", () => query(pending));

        let last;
        for (let attempt = 1; attempt <= 5; attempt++) {
            last = await callRoute(authRoutes, "POST", "/email/verify-otp", { body: { email: "a@test.rescuebase", otp: "000000" } });
        }
        assert.equal(last.status, 429);
        assert.ok(pending.emailOtpLockedUntil > new Date(), "the sign-up is locked for a while");

        const resend = await callRoute(authRoutes, "POST", "/email/resend-otp", { body: { email: "a@test.rescuebase" } });
        assert.equal(resend.status, 429, "Resend can't skip the lock");
        assert.equal(sentEmails.length, 0);
    });

    test("CASE-013 (lock) | Description: User enters wrong reset OTPs until the limit. | Expected: Reset is locked; password unchanged.", async () => {
        stubSettings();
        const user = await verifiedUser({ passwordResetToken: "654321", passwordResetExpires: new Date(Date.now() + 60000), passwordResetAttempts: 0 });
        mock.method(User, "findOne", () => query(user));
        const oldHash = user.password;

        let last;
        for (let attempt = 1; attempt <= 5; attempt++) {
            last = await callRoute(authRoutes, "POST", "/reset-password", {
                body: { email: user.email, otp: "000000", password: "Newpass1!", confirmPassword: "Newpass1!" },
            });
        }
        assert.equal(last.status, 429);

        const rightCode = await callRoute(authRoutes, "POST", "/reset-password", {
            body: { email: user.email, otp: "654321", password: "Newpass1!", confirmPassword: "Newpass1!" },
        });
        assert.equal(rightCode.status, 429, "even the old right code is refused while locked");
        assert.equal(user.password, oldHash);
    });

    test("CASE-011 | Description: Deactivated user tries to log in. | Expected: Login fails with account deactivated message.", async () => {
        const user = await verifiedUser({ status: "disabled" });
        mock.method(User, "findOne", () => query(user));

        const result = await callRoute(authRoutes, "POST", "/email/login", { body: { email: user.email, password: STRONG_PASSWORD } });

        assert.equal(result.status, 403);
        assert.match(result.body.message, /deactivated/i);
    });

    test("CASE-012 | Description: User enters the correct reset OTP and a new valid password. | Expected: Password is updated.", async () => {
        const user = await verifiedUser({ passwordResetToken: "654321", passwordResetExpires: new Date(Date.now() + 60000) });
        mock.method(User, "findOne", () => query(user));
        const oldHash = user.password;

        const result = await callRoute(authRoutes, "POST", "/reset-password", {
            body: { email: user.email, otp: "654321", password: "Newpass1!", confirmPassword: "Newpass1!" },
        });

        assert.equal(result.status, 200);
        assert.match(result.body.message, /password reset successfully/i);
        assert.notEqual(user.password, oldHash);
        assert.equal(await bcrypt.compare("Newpass1!", user.password), true);
        assert.equal(user.passwordResetToken, "");
    });

    test("CASE-013 | Description: User enters an invalid or expired reset OTP. | Expected: Password is not changed; error message shows.", async () => {
        mock.method(User, "findOne", () => query(null));

        const result = await callRoute(authRoutes, "POST", "/reset-password", {
            body: { email: "a@test.rescuebase", otp: "000000", password: "Newpass1!", confirmPassword: "Newpass1!" },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /invalid or expired/i);
    });
});

describe("Authentication & Account: Update Profile & Account Settings", () => {
    test("CASE-014 | Description: User edits the profile with valid values. | Expected: Profile is updated.", async () => {
        const me = await verifiedUser({ name: "Old Name", username: "oldname" });
        mock.method(User, "findById", () => query(me));
        mock.method(User, "exists", async () => null);

        const result = await callRoute(userRoutes, "PATCH", "/me", {
            role: "adopter",
            body: { name: "New Name", username: "new.name_1" },
        });

        assert.equal(result.status, 200);
        assert.equal(result.body.user.name, "New Name");
        assert.equal(result.body.user.username, "new.name_1");
        assert.equal(me.savedTimes, 1);
    });

    test("CASE-015 | Description: User clears the required name field and saves. | Expected: Save fails with required field message.", async () => {
        const me = await verifiedUser({ name: "Old Name" });
        mock.method(User, "findById", () => query(me));

        const result = await callRoute(userRoutes, "PATCH", "/me", { role: "adopter", body: { name: "   " } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /name can't be empty/i);
        assert.equal(me.savedTimes, 0);
    });

    test("CASE-016 | Description: User changes the password to a valid new one. | Expected: Password is updated.", async () => {
        const me = await verifiedUser();
        mock.method(User, "findById", () => query(me));

        const result = await callRoute(userRoutes, "PATCH", "/me/password", {
            role: "adopter",
            body: { currentPassword: STRONG_PASSWORD, newPassword: "Another1!" },
        });

        assert.equal(result.status, 200);
        assert.equal(await bcrypt.compare("Another1!", me.password), true);
    });

    test("CASE-017 | Description: User changes the password to one that breaks the rules. | Expected: Change fails with error message.", async () => {
        const me = await verifiedUser();
        mock.method(User, "findById", () => query(me));
        const before = me.password;

        const result = await callRoute(userRoutes, "PATCH", "/me/password", {
            role: "adopter",
            body: { currentPassword: STRONG_PASSWORD, newPassword: "weak" },
        });

        assert.equal(result.status, 400);
        assert.equal(me.password, before);
    });
});

describe("Authentication & Account: Apply for Volunteer or Foster Role", () => {
    function stubApplicant(overrides = {}) {
        const adopter = fakeDocument({ role: "adopter", name: "Applicant", roleApplication: undefined, ...overrides });
        mock.method(User, "findById", () => query(adopter));
        mock.method(User, "find", () => query([{ _id: newId() }]));
        const notified = mock.method(Notification, "insertMany", async () => []);
        return { adopter, notified };
    }

    test("CASE-018 | Description: Adopter applies for the volunteer role with a reason. | Expected: Application is saved as pending.", async () => {
        const { adopter, notified } = stubApplicant();

        const result = await callRoute(userRoutes, "POST", "/role-application", {
            role: "adopter",
            body: { targetRole: "volunteer", reason: "I can help at weekends." },
        });

        assert.equal(result.status, 201);
        assert.equal(adopter.roleApplication.status, "pending");
        assert.equal(adopter.roleApplication.targetRole, "volunteer");
        assert.equal(notified.mock.callCount(), 1);
    });

    test("CASE-019 | Description: Adopter applies for the foster role on the role form. | Expected: Application is refused; foster has its own form.", async () => {
        stubApplicant();

        const result = await callRoute(userRoutes, "POST", "/role-application", {
            role: "adopter",
            body: { targetRole: "foster", reason: "I can foster." },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /invalid application role/i);

        // The foster form itself is covered in the Foster Management tests (CASE-093 onward).
    });

    test("CASE-020 | Description: Adopter applies without a reason. | Expected: Submission fails with required field message.", async () => {
        stubApplicant();

        const result = await callRoute(userRoutes, "POST", "/role-application", {
            role: "adopter",
            body: { targetRole: "volunteer", reason: "   " },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /reason is required/i);
    });

    test("CASE-021 | Description: Adopter applies again while one is pending. | Expected: Duplicate application is refused.", async () => {
        const { adopter } = stubApplicant({ roleApplication: { status: "pending", targetRole: "volunteer" } });

        const result = await callRoute(userRoutes, "POST", "/role-application", {
            role: "adopter",
            body: { targetRole: "volunteer", reason: "Again" },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /already have a pending/i);
        assert.equal(adopter.savedTimes, 0);
    });

    test("CASE-022 | Description: Applicant logs in after approval. | Expected: New role dashboard is shown.", async () => {
        const approved = await verifiedUser({ role: "volunteer" });
        mock.method(User, "findOne", () => query(approved));
        await callRoute(authRoutes, "POST", "/email/login", { body: { email: approved.email, password: STRONG_PASSWORD } });

        const result = await callRoute(authRoutes, "POST", "/email/verify-login-otp", { body: { email: approved.email, otp: approved.loginOtp } });

        const decoded = jwt.verify(result.body.token, process.env.JWT_SECRET, { issuer: "RescueBase", audience: "rescuebase-client" });
        assert.equal(decoded.role, "volunteer");
    });
});

describe("Authentication & Account: Review Role Applications", () => {
    function pendingApplicant() {
        return fakeDocument({
            role: "adopter",
            email: "applicant@test.rescuebase",
            name: "Applicant",
            roleApplication: { status: "pending", targetRole: "volunteer", reason: "Help" },
        });
    }

    test("CASE-023 | Description: Admin opens the role application list. | Expected: Pending applications are listed.", async () => {
        const rows = [{ _id: newId(), role: "adopter", roleApplication: { status: "pending", targetRole: "volunteer" } }];
        mock.method(User, "find", () => query(rows));

        const result = await callRoute(userRoutes, "GET", "/", { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(result.body.users[0].roleApplication.status, "pending");
    });

    test("CASE-024 | Description: Staff opens the role application list. | Expected: Access is denied.", async () => {
        const find = mock.method(User, "find", () => query([]));

        const result = await callRoute(userRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(find.mock.callCount(), 0);
    });

    test("CASE-025 | Description: Admin approves a role application. | Expected: User gets the new role.", async () => {
        const applicant = pendingApplicant();
        mock.method(User, "findById", () => query(applicant));
        mock.method(Notification, "create", async () => ({}));
        const controller = require("../controllers/userController");

        const result = await callHandler(controller.reviewRoleApplication, {
            user: { id: newId(), role: "admin" },
            params: { id: applicant._id },
            body: { decision: "approved" },
        });

        assert.equal(result.status, 200);
        assert.equal(applicant.role, "volunteer");
        assert.equal(applicant.roleApplication.status, "approved");
    });

    test("CASE-026 | Description: Admin rejects a role application. | Expected: Application is rejected; role is unchanged.", async () => {
        const applicant = pendingApplicant();
        mock.method(User, "findById", () => query(applicant));
        mock.method(Notification, "create", async () => ({}));
        const controller = require("../controllers/userController");

        const noReason = await callHandler(controller.reviewRoleApplication, {
            user: { id: newId(), role: "admin" }, params: { id: applicant._id }, body: { decision: "rejected", rejectionReason: "" },
        });
        assert.equal(noReason.status, 400);
        assert.match(noReason.body.message, /rejection reason is required/i);

        const rejected = await callHandler(controller.reviewRoleApplication, {
            user: { id: newId(), role: "admin" }, params: { id: applicant._id }, body: { decision: "rejected", rejectionReason: "Not enough time" },
        });
        assert.equal(rejected.status, 200);
        assert.equal(applicant.role, "adopter");
        assert.equal(applicant.roleApplication.status, "rejected");
        assert.equal(applicant.roleApplication.rejectionReason, "Not enough time");
    });

    test("CASE-027 | Description: Admin decides on a role application. | Expected: Applicant is notified.", async () => {
        const applicant = pendingApplicant();
        mock.method(User, "findById", () => query(applicant));
        const created = mock.method(Notification, "create", async () => ({}));
        const controller = require("../controllers/userController");

        const approved = await callHandler(controller.reviewRoleApplication, {
            user: { id: newId(), role: "admin" },
            params: { id: applicant._id },
            body: { decision: "approved" },
        });

        assert.equal(approved.status, 200);
        assert.equal(applicant.role, "volunteer");
        assert.equal(applicant.roleApplication.status, "approved");
        assert.equal(created.mock.callCount(), 1);
        assert.equal(sentEmails.some((mail) => mail.name === "sendRoleApplicationEmail"), true);
    });
});

describe("Authentication & Account: Manage Users, Roles & Account Status", () => {
    test("CASE-028 | Description: Admin creates a user with valid details. | Expected: User is created.", async () => {
        mock.method(User, "findOne", () => query(null));
        mock.method(User, "create", async (data) => fakeDocument(data));

        const result = await callRoute(userRoutes, "POST", "/", {
            role: "admin",
            body: { username: "staffer", email: "staffer@test.rescuebase", password: "secret1", role: "staff" },
        });

        assert.equal(result.status, 201);
        assert.equal(result.body.user.role, "staff");
        assert.equal(result.body.user.verified, true);
        assert.equal(result.body.user.password, undefined);
    });

    test("CASE-029 | Description: Admin creates a user with an email already in use. | Expected: Creation fails with error message.", async () => {
        mock.method(User, "findOne", () => query(fakeDocument({ email: "taken@test.rescuebase" })));

        const result = await callRoute(userRoutes, "POST", "/", {
            role: "admin",
            body: { username: "dupe", email: "taken@test.rescuebase", password: "secret1", role: "staff" },
        });

        assert.equal(result.status, 409);
    });

    test("CASE-030 | Description: Admin edits a user's role and status. | Expected: Role and status are updated.", async () => {
        const targetId = newId();
        mock.method(User, "findById", () => query({ _id: targetId, role: "adopter", status: "active" }));
        const updated = mock.method(User, "findByIdAndUpdate", () => query({ _id: targetId, role: "staff", status: "active" }));
        const controller = require("../controllers/userController");

        const result = await callHandler(controller.updateUser, {
            user: { id: newId(), role: "admin" },
            params: { id: targetId },
            body: { role: "staff", status: "active" },
        });

        assert.equal(result.status, 200);
        assert.equal(result.body.user.role, "staff");
        assert.deepEqual(updated.mock.calls[0].arguments[1].$set, { role: "staff", status: "active" });
    });

    test("CASE-031 | Description: Admin deactivates a user. | Expected: User sees the deactivated message on the next request.", async () => {
        const target = fakeDocument({ status: "active" });
        mock.method(User, "findById", () => query(target));
        const controller = require("../controllers/userController");

        const result = await callHandler(controller.deactivateUser, {
            user: { id: newId(), role: "admin" },
            params: { id: target._id },
        });
        assert.equal(result.status, 200);
        assert.equal(target.status, "disabled");

        mock.restoreAll();
        stubSettings();
        mock.method(User, "findById", () => query({ _id: target._id, status: "disabled" }));
        const token = generateToken({ _id: target._id, email: "x@test.rescuebase", role: "adopter" }, 60);
        const next = await callRoute(userRoutes, "GET", "/me", { headers: { authorization: `Bearer ${token}` } });
        assert.equal(next.status, 401);
        assert.equal(next.body.accountDisabled, true);
    });

    test("CASE-032 | Description: Admin reactivates a user. | Expected: User can log in again.", async () => {
        const target = await verifiedUser({ status: "disabled" });
        mock.method(User, "findOne", () => query(target));
        const blocked = await callRoute(authRoutes, "POST", "/email/login", { body: { email: target.email, password: STRONG_PASSWORD } });
        assert.equal(blocked.status, 403);

        target.status = "active"; // what updateUser writes
        const allowed = await callRoute(authRoutes, "POST", "/email/login", { body: { email: target.email, password: STRONG_PASSWORD } });
        assert.equal(allowed.status, 200);
        assert.equal(allowed.body.requiresOtp, true);
    });

    test("CASE-033 | Description: Admin changes their own role or deactivates themselves. | Expected: Action is refused.", async () => {
        const adminId = newId();
        mock.method(User, "findById", () => query({ _id: adminId, role: "admin", status: "active" }));
        const controller = require("../controllers/userController");

        const roleChange = await callHandler(controller.updateUser, {
            user: { id: adminId, role: "admin" }, params: { id: adminId }, body: { role: "staff" },
        });
        assert.equal(roleChange.status, 400);

        const selfDisable = await callHandler(controller.updateUser, {
            user: { id: adminId, role: "admin" }, params: { id: adminId }, body: { status: "disabled" },
        });
        assert.equal(selfDisable.status, 400);

        const deactivate = await callHandler(controller.deactivateUser, {
            user: { id: adminId, role: "admin" }, params: { id: adminId },
        });
        assert.equal(deactivate.status, 400);
    });

    test("CASE-034 | Description: Staff opens Manage Users. | Expected: Access is denied.", async () => {
        const find = mock.method(User, "find", () => query([]));

        const result = await callRoute(userRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(find.mock.callCount(), 0, "the user list is never read");
    });
});
