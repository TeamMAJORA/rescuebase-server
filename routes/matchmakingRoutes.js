const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

const {
    submitMatchmakingQuiz,
    getMyLatestQuizResponse,
    getAllQuizResponses,
} = require("../controllers/matchmakingController");

// Admin/staff: list of adopters who took the quiz
router.get(
    "/responses",
    verifyToken,
    authoriseRoles("admin", "staff"),
    getAllQuizResponses
);

router.post(
    "/quiz",
    verifyToken,
    authoriseRoles("adopter", "foster", "volunteer"),
    submitMatchmakingQuiz
);

// The logged-in user's latest quiz answers and current matches
router.get(
    "/quiz/me",
    verifyToken,
    authoriseRoles("adopter", "foster", "volunteer"),
    getMyLatestQuizResponse
);

module.exports = router;