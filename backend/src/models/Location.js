const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      index: true
    },

    location: {
      type: {
        type: String,
        enum: ["Point"],
        required: true
      },

      coordinates: {
        type: [Number],
        required: true
      }
    },

    accuracy: {
      type: Number,
      default: null
    },

    speed: {
      type: Number,
      default: null
    },

    heading: {
      type: Number,
      default: null
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  }
);

locationSchema.index({
  location: "2dsphere"
});

locationSchema.index({
  deviceId: 1,
  timestamp: -1
});

module.exports = mongoose.model("Location", locationSchema);