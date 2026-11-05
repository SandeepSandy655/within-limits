const express = require("express");
const { requireMobileUser, requireOwnDevice } = require("../middleware/mobileAuth");
const chat = require("../services/chatService");
const router = express.Router();
router.use(requireMobileUser);
router.get("/device/:deviceId/summary", requireOwnDevice("params"), async (req, res, next) => {
  try { res.json({ success: true, ...await chat.getChatSummary(req.params.deviceId) }); }
  catch (error) { next(error); }
});
router.get("/device/:deviceId", requireOwnDevice("params"), async (req, res, next) => {
  try { res.json({ success: true, ...await chat.getMessages(req.params.deviceId, req.query) }); }
  catch (error) { next(error); }
});
router.post("/messages", requireOwnDevice(), async (req, res, next) => {
  try {
    const result = await chat.sendMessage(req.body.deviceId, req.body);
    res.status(result.created ? 201 : 200).json({ success: true, ...result });
  } catch (error) {
    if (error.status === 429) res.set("Retry-After", "60");
    next(error);
  }
});
router.post("/read", requireOwnDevice(), async (req, res, next) => {
  try {
    await chat.markChatRead(req.body.deviceId, req.body.messageId, req.body.membershipKey);
    res.json({ success: true });
  } catch (error) { next(error); }
});
module.exports = router;
