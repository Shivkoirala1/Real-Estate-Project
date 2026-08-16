const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Fail loudly and stop the server rather than silently falling back to a
    // different (likely empty) local database - a fallback here previously
    // masked real connection problems and made data appear to "disappear".
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.error('Check that MONGO_URI in your .env file is correct and reachable.');
    process.exit(1);
  }
};

module.exports = connectDB;
