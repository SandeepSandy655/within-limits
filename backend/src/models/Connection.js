const mongoose = require("mongoose");

const connectionSchema = new mongoose.Schema(
  {
    requesterId: {
      type: String,
      required: true,
      index: true
    },

    receiverId: {
      type: String,
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "blocked"
      ],
      default: "pending",
      index: true
    },

    createdAt: {
      type: Date,
      default: Date.now
    },

    acceptedAt: {
      type: Date,
      default: null
    }
  }
);

// Prevent duplicate active connection requests
connectionSchema.index(
  {
    requesterId: 1,
    receiverId: 1,
    status: 1
  }
);

const Connection =
  mongoose.model("Connection", connectionSchema);

module.exports = Connection;