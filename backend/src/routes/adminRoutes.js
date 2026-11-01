const express = require("express");
const requireAdmin = require("../middleware/adminAuth");
const { getOverview, ringGroupDevice } = require("../controllers/adminController");

const router = express.Router();

router.get("/overview", requireAdmin, getOverview);
router.post("/groups/:hostId/ring", requireAdmin, ringGroupDevice);

module.exports = router;
