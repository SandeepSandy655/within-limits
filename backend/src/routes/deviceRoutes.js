const express = require("express");

const {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices,
  getConnectedDevices,
} = require("../controllers/deviceController");

const router = express.Router();
const { requireMobileUser, requireOwnDevice } = require("../middleware/mobileAuth");
const service = require("../services/deviceService");
const { getConnectedDeviceIds } = require("../services/connectionService");
const { emitToDevice } = require("../sockets/connectedDevices");
router.use(requireMobileUser);

router.post("/register", registerDevice);

router.post("/sharing", requireOwnDevice(), async (req, res, next) => {
  try {
    await service.setLocationSharing(req.body.deviceId, req.body.sharingEnabled);
    const peers = await getConnectedDeviceIds(req.body.deviceId);
    for (const peerId of peers) emitToDevice(peerId, "sharing-changed", { deviceId: req.body.deviceId, sharingEnabled: req.body.sharingEnabled });
    res.json({ success: true });
  } catch (error) { error.status = 400; next(error); }
});
router.get("/nearby", requireOwnDevice("query"), getNearbyDevices);
router.get("/connected/:deviceId", requireOwnDevice("params"), getConnectedDevices);


router.get("/:deviceId", requireOwnDevice("params"), getDevice);

module.exports = router;
