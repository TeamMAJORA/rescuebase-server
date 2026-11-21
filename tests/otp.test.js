const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const generateOtp = require("../utils/generateOtp");

describe("generateOtp", () => {
    test("U-21 | Description: An OTP is generated. | Expected: It is a 6-digit number.", () => {
        for (let attempt = 0; attempt < 100; attempt++) {
            const otp = generateOtp();

            assert.equal(typeof otp, "string");
            assert.match(otp, /^\d{6}$/);
            assert.ok(Number(otp) >= 100000 && Number(otp) <= 999999);
        }
    });
});
