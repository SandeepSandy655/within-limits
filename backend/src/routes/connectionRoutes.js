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

router.post(
  "/request",
  sendConnectionRequest
);

router.post(
  "/request-by-code",
  sendConnectionRequestByCode
);

router.post(
  "/accept",
  acceptConnection
);

router.post(
  "/reject",
  rejectConnection
);

router.post("/disconnect", disconnectDevice);
router.post("/ring", ringDevice);

router.get(
  "/device/:deviceId",
  getDeviceConnections
);

router.get(
  "/pending/:deviceId",
  getPendingRequests
);

module.exports = router;
