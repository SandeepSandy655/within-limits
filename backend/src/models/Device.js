const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
    },

    // User-facing code used to connect devices
    connectionCode: {
      type: String,
    },

    ownerId: {
      type: String,
      default: null,
      index: true,
    },

    deviceName: {
      type: String,
      default: "Unknown Device",
    },

    deviceType: {
      type: String,
      default: "mobile",
    },

    platform: {
      type: String,
      default: "unknown",
    },

    status: {
      type: String,
      enum: ["online", "offline"],
      default: "offline",
      index: true,
    },

    // Optional GPS information
    location: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },

    lastSeen: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Unique only when a code exists.
// This keeps old devices without a code from breaking.
deviceSchema.index(
  { connectionCode: 1 },
  {
    unique: true,
    sparse: true,
  }
);

// GPS index
deviceSchema.index(
  { location: "2dsphere" },
  { sparse: true }
);

const Device = mongoose.model("Device", deviceSchema);

module.exports = Device;
