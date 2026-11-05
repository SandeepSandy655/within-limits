const express = require("express");
const { requireMobileUser, requireOwnDevice } = require("../middleware/mobileAuth");
const { getNotifications, markNotificationsRead } = require("../services/notificationService");
const router = express.Router();
router.use(requireMobileUser);
router.get("/device/:deviceId", requireOwnDevice("params"), async (req, res, next) => {
  try { res.json({ success: true, ...await getNotifications(req.params.deviceId) }); }
  catch (error) { next(error); }
});
router.post("/read", requireOwnDevice(), async (req, res, next) => {
  try { await markNotificationsRead(req.body.deviceId, req.body.ids); res.json({ success: true }); }
  catch (error) { error.status = 400; next(error); }
});
module.exports = router;
