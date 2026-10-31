const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

const {
    submitMatchmakingQuiz,
    getMatchmakingResults,
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
    authoriseRoles("adopter", "foster"),
    submitMatchmakingQuiz
);

router.get(
    "/results/:quizResponseId",
    verifyToken,
    authoriseRoles("adopter", "foster", "admin", "staff"),
    getMatchmakingResults
);

module.exports = router;