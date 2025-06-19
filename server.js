require('dotenv').config(); // Load environment variables
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const signinRoute = require('./routes/signinroute');

const app = express();
const PORT = process.env.PORT || 5000;

// Log MONGODB_URI to verify it's set
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Undefined');

// Check if MONGODB_URI is defined before connecting
if (!process.env.MONGODB_URI) {
    console.error('Error: MONGODB_URI is not defined in environment variables.');
    process.exit(1); // Exit the process if MONGODB_URI is missing
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1); // Exit if connection fails
    });

app.use(express.json());

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Mount routes
app.use('/api', signinRoute);

// Start server only after MongoDB connection is established
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));