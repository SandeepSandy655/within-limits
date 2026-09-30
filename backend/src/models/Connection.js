const mongoose = require("mongoose");

const connectionSchema =
  new mongoose.Schema(
    {
      requesterId: {
        type: String,
        required: true,
      },

      receiverId: {
        type: String,
        required: true,
      },

      status: {
        type: String,
        enum: [
          "pending",
          "accepted",
          "rejected",
          "blocked",
        ],
        default: "pending",
      },

      createdAt: {
        type: Date,
        default: Date.now,
      },

      acceptedAt: {
        type: Date,
        default: null,
      },
    }
  );

connectionSchema.index({ requesterId: 1, status: 1, createdAt: -1 });
connectionSchema.index({ receiverId: 1, status: 1, createdAt: -1 });

const Connection =
  mongoose.model(
    "Connection",
    connectionSchema
  );

module.exports = Connection;
