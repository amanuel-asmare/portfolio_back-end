// // config/db.js
// const mongoose = require("mongoose");

// const connectDB = async() => {
//     try {
//         await mongoose.connect(process.env.MONGO_URL, {
//             useNewUrlParser: true,
//             useUnifiedTopology: true,
//         });
//         console.log(`MongoDB connected: ${mongoose.connection.host}`);
//     } catch (error) {
//         console.error(`MongoDB connection error: ${error.message}`);
//         process.exit(1); // Exit process with failure
//     }
// };

// module.exports = connectDB;