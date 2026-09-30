const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to backend/.env.");
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10_000,
      maxPoolSize: 10,
    });
    console.log("[database] MongoDB connected");
  } catch (error) {
    console.error(`[database] MongoDB connection failed: ${error.message}`);
    throw error;
  }
}

module.exports = connectDatabase;
