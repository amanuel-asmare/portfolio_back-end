require('dotenv').config(); // Load environment variables
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const signinRoute = require('./routes/signinroute');



const app = express();
const PORT = process.env.PORT || 5000;
console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'Set' : 'Undefined');
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('MongoDB connection error:', err));

app.use(express.json());

app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));


// Serve uploaded files statically (optional, for backward compatibility)
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));


app.use('/api', signinRoute); // Mount routes under /api

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));