const QuizResponse = require("../models/QuizResponse");
const Animal = require("../models/Animal");
const AdoptionApplication = require("../models/AdoptionApplication");
const { generateMatches } = require("../services/matchmakingService");

exports.submitMatchmakingQuiz = async (req, res) => {
    try {
        const quizData = req.body;

        if (!quizData) {
            return res.status(400).json({
                success: false,
                message: "Matchmakig quiz data is required."
            });
        }

        if (
            !quizData.preferredPetType ||
            !quizData.preferredSize
        ) {
            return res.status(400).json({
                success: false,
                message: "Required matchmaking preferences are missing."
            });
        }

        const quizResponse = await QuizResponse.create({
            adopterUserId: quizData.adopterUserId || null,
            adopterName: quizData.adopterName || "Adopter",
            adopterEmail: String(quizData.adopterEmail || "").trim().toLowerCase(),
            preferredPetType: quizData.preferredPetType,
            preferredSize: quizData.preferredSize,
            homeType: quizData.homeType,
            homeOwnership: quizData.homeOwnership,
            hasChildren: quizData.hasChildren,
            hasOtherPets: quizData.hasOtherPets,
            petExperience: quizData.petExperience,
            dailyAvailableHours: quizData.dailyAvailableHours,
            exerciseFrequency: quizData.exerciseFrequency,
            willingToTrain: quizData.willingToTrain,
            energyPreference: quizData.energyPreference,
            friendlinessPreference: quizData.friendlinessPreference,
            humanSociabilityPreference: quizData.humanSociabilityPreference,
            animalSociabilityPreference: quizData.animalSociabilityPreference,
            trainabilityPreference: quizData.trainabilityPreference,
            anxietyTolerance: quizData.anxietyTolerance,
            aggressionTolerance: quizData.aggressionTolerance,
            activityPreference: quizData.activityPreference,
            completedAt: quizData.completedAt || new Date(),
        });

        const animals = await Animal.find({
            availabilityStatus: "available",
            adoptionStatus: "available",
        }).lean();

        const matches = await generateMatches(animals, quizResponse)

        return res.status(201).json({
            success: true,
            message: "Matchmaking quiz completed successfully.",
            quizResponseId: quizResponse._id,
            totalAnimalsEvaluated: animals.length,
            totalMatches: matches.length,
            matches,
        });
    } catch (error) {
        console.error(
            "Submit matchmaking quiz error:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to process matchmaking quiz.",
            error:
                process.env.NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined,
        });
    }
};

exports.getMatchmakingResults = async (req, res) => {
    try {
        const { quizResponseId } = req.params;

        if (!quizResponseId) {
            return res.status(400).json({
                success: false,
                message: "Quiz response ID is required."
            });
        }

        const quizResponse = await QuizResponse.findById(
            quizResponseId
        ).lean();

        if (!quizResponse) {
            return res.status(404).json({
                success: false,
                message: "Matchmaking quiz response not found."
            });
        }

        const animals = await Animal.find({
            availabilityStatus: "available",
            adoptionStatus: "available",
        }).lean();

        // shortcut: one AI call per adopter × animal on every load; save scores on QuizResponse if this gets slow
        const withMatches = await Promise.all(
            latest.map(async (response) => ({
                ...response,
                latestApplication: latestApplication[response.adopterEmail] || null,
                aiMatches: (await generateMatches(animals, response)).map(
                    ({ animalId, score }) => ({ animalId, score })
                ),
            }))
        );

        return res.status(200).json({
            success: true,
            responses: withMatches,
        });
    } catch (error) {
        console.error("Get matchmaking error:", error);

        return res.status(500).json({
            success: false,
            message:
                "Failed to retrieve matchmaking results.",
            error:
                process.env.NODE_ENV ===
                    "development"
                    ? error.message
                    : undefined,
        });
    }
};


// Admin/staff: latest quiz per adopter + their latest adoption application
exports.getAllQuizResponses = async (req, res) => {
    try {
        const responses = await QuizResponse.find()
            .sort({ createdAt: -1 })
            .lean();

        // Keep only each adopter's most recent quiz
        const seen = new Set();
        const latest = [];

        for (const response of responses) {
            const key =
                response.adopterEmail ||
                String(response.adopterUserId || response._id);

            if (seen.has(key)) continue;
            seen.add(key);
            latest.push(response);
        }

        const emails = latest
            .map((response) => response.adopterEmail)
            .filter(Boolean);

        const applications = await AdoptionApplication.find({
            email: { $in: emails },
        })
            .sort({ createdAt: -1 })
            .select("email status petName petImage createdAt")
            .lean();

        const latestApplication = {};

        for (const application of applications) {
            if (!latestApplication[application.email]) {
                latestApplication[application.email] = application;
            }
        }

        return res.status(200).json({
            success: true,
            responses: latest.map((response) => ({
                ...response,
                latestApplication: latestApplication[response.adopterEmail] || null,
            })),
        });
    } catch (error) {
        console.error("Get quiz responses error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load quiz responses.",
        });
    }
};