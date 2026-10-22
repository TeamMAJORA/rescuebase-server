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
    submitMatchmakingQuiz
);

router.get(
    "/results/:quizResponseId",
    getMatchmakingResults
);

module.exports = router;