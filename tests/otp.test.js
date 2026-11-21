const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const generateOtp = require("../utils/generateOtp");

describe("Table 35 - generateOtp", () => {
    test("U-21 | Description: An OTP is generated | Expected: A 6-digit string from 100000 to 999999", () => {
        for (let attempt = 0; attempt < 100; attempt++) {
            const otp = generateOtp();

            assert.equal(typeof otp, "string");
            assert.match(otp, /^\d{6}$/);
            assert.ok(Number(otp) >= 100000 && Number(otp) <= 999999);
        }
    });
});
