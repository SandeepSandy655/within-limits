const express = require("express");

const {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices,
  getConnectedDevices,
} = require("../controllers/deviceController");

const router = express.Router();

router.post("/register", registerDevice);

router.get("/nearby", getNearbyDevices);
router.get("/connected/:deviceId", getConnectedDevices);

router.get("/", getAllDevices);

router.get("/:deviceId", getDevice);

module.exports = router;
