const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const SignUser = require('../models/signin');
const File = require('../models/file');

const router = express.Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../Uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173', 'https://portfolio-ypox.onrender.com'];
router.use(cors({
    origin: (origin, callback) => {
        console.log(`Route Request Origin: ${origin}`); // Log origin for debugging
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

// Configure Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif',
        'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain',
        'video/mp4', 'video/quicktime', 'video/avi',
        'audio/mpeg', 'audio/wav', 'audio/ogg',
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
}).single('file');

// Multer error handling middleware
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).send({ message: `Multer error: ${err.message}` });
    }
    if (err) {
        return res.status(400).send({ message: err.message });
    }
    next();
};

// Sign-in route
router.post('/api/signin', async(req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new SignUser({ name, email, password: hashedPassword });
        await user.save();
        res.status(201).send({ message: 'User created successfully', user: { name, email } });
    } catch (error) {
        console.error('Sign-in error:', error.stack);
        res.status(400).send({ message: error.message });
    }
});

// Login route
router.post('/api/login', async(req, res) => {
    try {
        const { name, password } = req.body;
        if (!name || !password) {
            return res.status(400).send({ message: 'Name and password are required' });
        }
        const user = await SignUser.findOne({ name });
        if (!user) {
            return res.status(400).send({ message: 'User not found' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).send({ message: 'Invalid password' });
        }
        res.status(200).send({ message: 'Login successful', user: { name: user.name, email: user.email } });
    } catch (error) {
        console.error('Login error:', error.stack);
        res.status(500).send({ message: 'Server error', error: error.message });
    }
});

// File upload route
router.post('/api/upload', (req, res, next) => {
    upload(req, res, (err) => {
        if (err) {
            return next(err);
        }
        next();
    });
}, handleMulterError, async(req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send({ message: 'No file uploaded' });
        }
        console.log('File received:', req.file);
        const file = new File({
            filename: req.file.filename,
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            path: req.file.filename,
            size: req.file.size,
        });
        await file.save();
        console.log('File saved to MongoDB:', file);
        res.status(201).send({ message: 'File uploaded successfully', file });
    } catch (error) {
        console.error('Upload error:', error.stack);
        res.status(500).send({ message: `Failed to save file: ${error.message}` });
    }
});

// Get all files route
router.get('/api/files', async(req, res) => {
    try {
        const files = await File.find().sort({ uploadDate: -1 });
        res.status(200).send(files);
    } catch (error) {
        console.error('Fetch files error:', error.stack);
        res.status(500).send({ message: `Failed to fetch files: ${error.message}` });
    }
});

// Serve uploaded files with proper headers
router.get('/api/uploads/:filename', async(req, res) => {
    try {
        const filename = req.params.filename;
        const file = await File.findOne({ filename });
        if (!file) {
            return res.status(404).send({ message: 'File not found in database' });
        }

        const filePath = path.join(uploadDir, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send({ message: 'File not found on server' });
        }

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Serve file error:', error.stack);
        res.status(500).send({ message: error.message });
    }
});

// Download file with proper headers
router.get('/api/download/:filename', async(req, res) => {
    try {
        const filename = req.params.filename;
        const file = await File.findOne({ filename });
        if (!file) {
            return res.status(404).send({ message: 'File not found in database' });
        }

        const filePath = path.join(uploadDir, filename);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send({ message: 'File not found on server' });
        }

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        console.error('Download file error:', error.stack);
        res.status(500).send({ message: error.message });
    }
});

// Delete file
router.delete('/api/files/:id', async(req, res) => {
    try {
        const file = await File.findById(req.params.id);
        if (!file) {
            return res.status(404).send({ message: 'File not found.' });
        }
        const filePath = path.join(uploadDir, file.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        } else {
            console.warn(`File not found on disk: ${filePath}`);
        }
        await File.findByIdAndDelete(req.params.id);
        res.status(200).send({ message: 'File deleted successfully.' });
    } catch (error) {
        console.error('Delete error:', error.stack);
        res.status(500).send({ message: error.message || 'Failed to delete file.' });
    }
});

module.exports = router;