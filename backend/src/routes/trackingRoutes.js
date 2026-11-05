const express = require("express");
const { receiveReport } = require("../services/trackingService");
const router = express.Router();
router.post("/reports", async (req, res, next) => {
  try {
    const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")?.[1];
    const result = await receiveReport(token, req.body);
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});
module.exports = router;
