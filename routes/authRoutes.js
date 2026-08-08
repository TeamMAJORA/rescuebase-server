const express = require("express");
const router = express.Router();
const asyncHandler = require("../middleware/asyncHandler");
const authController = require("../controllers/authController");
const validateRequest = require("../middleware/validateRequest");
const verifyFirebaseToken = require("../middleware/verifyFirebaseToken")

router.post("/email/signup",
    validateRequest(["username", "email", "password", "confirmPassword"]),
    asyncHandler(authController.emailSignup)
);

router.post("/email/verify-otp",
    validateRequest(["email", "otp"]),
    asyncHandler(authController.verifyOtp)
);

router.post("/email/resend-otp", 
    validateRequest(["email"]),
    asyncHandler(authController.resendOtp)
);

router.post("/email/login",
    validateRequest(["email", "password"]),
    asyncHandler(authController.emailLogin)
);

router.post("/google/signup", verifyFirebaseToken, asyncHandler(authController.googleSignup));

router.post("/google/login", verifyFirebaseToken, asyncHandler(authController.googleLogin));

module.exports = router;