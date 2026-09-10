const express = require("express");

const router = express.Router();

const {
    submitMatchmakingQuiz,
    getMatchmakingResults,
} = require("../controllers/matchmakingController");

router.post(
    "/quiz",
    submitMatchmakingQuiz
);

router.get(
    "/results/:quizResponseId",
    getMatchmakingResults
);

module.exports = router;