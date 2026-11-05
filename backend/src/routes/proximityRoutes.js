const router = require("express").Router();
const { receiveProximity } = require("../services/proximityService");
router.post("/reports", async (req, res, next) => {
  try {
    const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") || "")?.[1];
    const result = await receiveProximity(token, req.body);
    res.status(result.duplicate ? 200 : 201).json(result);
  } catch (error) { next(error); }
});
module.exports = router;
