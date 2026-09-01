const express = require("express");

const router = express.Router();

const verifyToken =
    require("../middleware/verifyToken");

const authorizeRoles =
    require("../middleware/authoriseRoles");

const asyncHandler =
    require("../middleware/asyncHandler");

const reportsController =
    require("../controllers/reportsController");


router.post(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        reportsController.createReport
    )
);


router.get(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        reportsController.getAllReports
    )
);


router.patch(
    "/:id/finalize",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        reportsController.finalizeReport
    )
);


router.get(
    "/:id/download",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        reportsController.downloadReport
    )
);


router.delete(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        reportsController.deleteReport
    )
);


module.exports = router;