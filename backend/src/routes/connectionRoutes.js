const express = require("express");

const {
  sendConnectionRequest,
  sendConnectionRequestByCode,
  acceptConnection,
  rejectConnection,
  getDeviceConnections,
  getPendingRequests
} = require("../controllers/connectionController");

const router = express.Router();

// Send connection request
router.post("/request", sendConnectionRequest);

router.post(
  "/request-by-code",
  sendConnectionRequestByCode
);


// Accept connection request
router.post("/accept", acceptConnection);

// Reject connection request
router.post("/reject", rejectConnection);

// Get all connections for a device
router.get("/device/:deviceId", getDeviceConnections);

// Get pending requests received by a device
router.get("/pending/:deviceId", getPendingRequests);


module.exports = router;