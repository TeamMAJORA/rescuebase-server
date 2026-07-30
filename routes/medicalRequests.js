const express = require("express");
const router = express.Router();

const MedicalRequest = require("../models/MedicalRequest");

router.post("/", async (req, res) => {
    try {
        const request = await MedicalRequest.create({
            assignmentId: req.body.assignmentId,
            petId: req.body.petId,
            petName: req.body.petName,
            fosterEmail: String(
                req.body.fosterEmail || ""
            ).trim().toLowerCase(),
            issueType: req.body.issueType,
            priority: req.body.priority,
            description: req.body.description,
            photoUrl: req.body.photoUrl || "",
        });

        res.json({
            success: true,
            request,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Unable to submit medical request.",
        });
    }
});

router.get("/", async (req, res) => {
    try {
        const requests = await MedicalRequest.find()
            .sort({
                createdAt: -1,
            });

        res.json({
            success: true,
            requests,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success : false,
        });
    }
});

router.get("/foster/:email", async (req, res) => {
    try {
        const requests = await MedicalRequest.find({
            fosterEmail: String(req.params.email)
                .trim()
                .toLowerCase(),
        }).sort({
            createdAt: -1,
        });

        res.json({
            success: true,
            requests,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
        });
    }
});

router.patch("/:id/resolve", async (req, res) => {
    try {
        const request = await MedicalRequest.findByIdAndUpdate(req.params.id, {
            status : "Resolved",
            adminResponse:
                req.body.adminResponse || "",
            resolvedAt: new Date(),
        },{
            new: true,
        });

        res.json({
            success: true,
            request,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
        });
    }
});

module.exports = router;