const { describe, test, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const GlobalSettings = require("../models/GlobalSettings");
const {
    isStrongPassword,
    validatePassword,
} = require("../utils/passwordPolicy");

// validatePassword reads the setting from the database.
// Replace that one call so the test needs no database.
function stubRequireStrongPasswords(requireStrongPasswords) {
    mock.method(GlobalSettings, "findOneAndUpdate", () => ({
        lean: async () => ({ security: { requireStrongPasswords } }),
    }));
}

afterEach(() => {
    mock.restoreAll();
});

describe("passwordPolicy", () => {
    test("U-19 | Description: Strong-password check on a strong and two weak passwords. | Expected: Strong is accepted; weak are rejected.", () => {
        assert.equal(isStrongPassword("Abcdef1!"), true);
        assert.equal(isStrongPassword("abcdefg1"), false);
        assert.equal(isStrongPassword("Short1!"), false);
    });

    test("U-20 | Description: Strong passwords is off; password has 5 then 6 characters. | Expected: 5 is rejected; 6 is accepted.", async () => {
        stubRequireStrongPasswords(false);

        await assert.rejects(validatePassword("abcde"), (error) => {
            assert.equal(error.statusCode, 400);
            return true;
        });

        await assert.doesNotReject(validatePassword("abcdef"));
    });
});
