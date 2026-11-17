const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const generateToken = require("../utils/generateToken");

const TEST_SECRET = "unit-test-secret-not-for-production";

describe("Table 35 - generateToken", () => {
    let originalSecret;

    beforeEach(() => {
        originalSecret = process.env.JWT_SECRET;
        process.env.JWT_SECRET = TEST_SECRET;
    });

    afterEach(() => {
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
    });

    test("U-24 token carries id, email, role, issuer and audience", () => {
        const user = {
            _id: "64b7f0c2a1b2c3d4e5f60718",
            email: "staff.test@example.com",
            role: "staff",
        };

        const token = generateToken(user);

        const decoded = jwt.verify(token, TEST_SECRET, {
            issuer: "RescueBase",
            audience: "rescuebase-client",
        });

        assert.equal(decoded.id, user._id);
        assert.equal(decoded.email, user.email);
        assert.equal(decoded.role, user.role);
    });
});
