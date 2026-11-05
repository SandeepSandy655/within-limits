const express = require("express");

const {
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  disconnectDevice,
  ringDevice,
  getDeviceConnections,
  getPendingRequests,
} = require("../controllers/connectionController");

const router = express.Router();
const { requireMobileUser, requireOwnDevice, limitPairing } = require("../middleware/mobileAuth");
const service = require("../services/connectionService");
const { notifyConnectionRejected } = require("../sockets/connectedDevices");
router.use(requireMobileUser);
router.get("/preview", requireOwnDevice("query"), limitPairing, async (req, res) => {
  try { res.json({ success: true, host: await service.previewHost(req.query.code, req.query.deviceId) }); }
  catch (error) { res.status(400).json({ success: false, message: error.message }); }
});
router.post("/cancel", requireOwnDevice(), async (req, res) => {
  try {
    const connection = await service.cancelConnection(req.body.connectionId, req.body.deviceId);
    notifyConnectionRejected(connection);
    res.json({ success: true, connection });
  } catch (error) { res.status(400).json({ success: false, message: error.message }); }
});

router.post(
  "/request",
  requireOwnDevice("body", "requesterId"), limitPairing,
  sendConnectionRequest
);

router.post(
  "/request-by-code",
  requireOwnDevice("body", "requesterId"), limitPairing,
  sendConnectionRequestByCode
);

router.post(
  "/accept",
  requireOwnDevice(),
  acceptConnection
);

router.post(
  "/reject",
  requireOwnDevice(),
  rejectConnection
);

router.post("/disconnect", requireOwnDevice(), disconnectDevice);
router.post("/ring", requireOwnDevice(), limitPairing, ringDevice);

router.get(
  "/device/:deviceId",
  requireOwnDevice("params"),
  getDeviceConnections
);

router.get(
  "/pending/:deviceId",
  requireOwnDevice("params"),
  getPendingRequests
);

module.exports = router;
