require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const signinRoute = require('./routes/signinroute');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON
app.use(express.json());

// Enhanced CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173', 'https://portfolio-ypox.onrender.com'];
app.use(cors({
    origin: (origin, callback) => {
        console.log(`Request Origin: ${origin}`);
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS policy: Origin ${origin} not allowed`));
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    preflightContinue: true,
}));

// Handle OPTIONS preflight requests explicitly
app.options('*', cors());

// Root route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to the Portfolio Backend API' });
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('MongoDB connected');
        // Initialize GridFS
        const conn = mongoose.connection;
        app.locals.gridfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
    })
    .catch((error) => {
        console.error('MongoDB connection error:', error.stack);
        process.exit(1);
    });

// Routes
app.use('/api', signinRoute);

// Catch-all route
app.use((req, res, next) => {
    console.log(`Unhandled request: ${req.originalUrl}`);
    res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    if (err.message.includes('CORS')) {
        res.status(403).json({ error: err.message });
    } else {
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// Start server
app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));