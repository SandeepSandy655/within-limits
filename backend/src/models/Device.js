const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // User-facing 8-digit code used to pair devices
    connectionCode: {
      type: String
    },

    ownerId: {
      type: String,
      default: null,
      index: true
    },

    deviceName: {
      type: String,
      default: "Unknown Device"
    },

    deviceType: {
      type: String,
      default: "mobile"
    },

    platform: {
      type: String,
      default: "unknown"
    },

    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
      index: true
    },

    location: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    },

    lastSeen: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

deviceSchema.index(
  { connectionCode: 1 },
  { unique: true, sparse: true }
);

deviceSchema.index(
  { location: "2dsphere" },
  { sparse: true }
);

const Device = mongoose.model("Device", deviceSchema);

module.exports = Device;