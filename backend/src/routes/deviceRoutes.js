const express = require("express");

const {
  registerDevice,
  getDevice,
  getAllDevices,
  getNearbyDevices
} = require("../controllers/deviceController");

const router = express.Router();

router.post("/register", registerDevice);

router.get("/nearby", getNearbyDevices);

router.get("/", getAllDevices);

router.get("/:deviceId", getDevice);

module.exports = router;