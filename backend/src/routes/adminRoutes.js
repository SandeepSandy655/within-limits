const express = require("express");
const requireAdmin = require("../middleware/adminAuth");
const { getOverview, createRoute, updateRoute, createGroup } = require("../controllers/trackingAdminController");
const { ringGroupDevice } = require("../controllers/adminController");
const { assignProximity } = require("../services/proximityService");
const { registrationSummary, clearRegistrations } = require("../services/registrationReset");
const { getGroupHistory, getGroupHistoryDetails } = require("../services/groupHistory");
const { renameCardHolder } = require("../services/cardAssignments");

const router = express.Router();

router.get("/overview", requireAdmin, getOverview);
router.get("/history", requireAdmin, async (req, res, next) => {
  try { res.set("Cache-Control", "no-store"); res.json(await getGroupHistory(req.adminUser, req.query)); } catch (error) { next(error); }
});
router.get("/history/:groupId", requireAdmin, async (req, res, next) => {
  try { res.set("Cache-Control", "no-store"); res.json(await getGroupHistoryDetails(req.params.groupId, req.adminUser)); } catch (error) { next(error); }
});
router.post("/routes", requireAdmin, createRoute);
router.put("/routes/:routeId", requireAdmin, updateRoute);
router.get("/routes/:routeId/registrations", requireAdmin, async (req, res, next) => {
  try { res.set("Cache-Control", "no-store"); res.json(await registrationSummary(req.params.routeId, req.adminUser)); }
  catch (error) { next(error); }
});
router.delete("/routes/:routeId/registrations", requireAdmin, async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.confirmRouteName !== "string") {
      return res.status(400).json({ success: false, message: "Confirm the route name to clear registered data." });
    }
    res.json(await clearRegistrations(req.params.routeId, req.adminUser, req.body.confirmRouteName));
  } catch (error) { next(error); }
});
router.post("/groups", requireAdmin, createGroup);
router.patch('/members/:memberId', requireAdmin, async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).length !== 1 || !('name' in req.body)) return res.status(400).json({ success: false, message: 'Send the card holder name.' });
    res.json(await renameCardHolder(req.params.memberId, req.body.name, req.adminUser));
  } catch (error) { next(error); }
});
router.post("/groups/:hostId/ring", requireAdmin, ringGroupDevice);
router.put("/proximity/:monitorId/assignment", requireAdmin, async (req, res, next) => {
  try {
    if (!req.body || Object.keys(req.body).length !== 1 || !("memberId" in req.body)) return res.status(400).json({ success: false, message: "Send memberId, or null to unlink." });
    res.json(await assignProximity(req.params.monitorId, req.body.memberId, req.adminUser));
  } catch (error) { next(error); }
});

module.exports = router;
