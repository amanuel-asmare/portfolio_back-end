const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const { ObjectId } = require('mongodb');
const SignUser = require('../models/signin');
const File = require('../models/file');

const router = express.Router();

// Configure CORS
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173', 'https://portfolio-ypox.onrender.com'];
router.use(cors({
    origin: (origin, callback) => {
        console.log(`Route Request Origin: ${origin}`);
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

// Configure Multer for memory storage (temporary, before GridFS upload)
const storage = multer.memoryStorage();
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
router.post('/signin', async(req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).send({ message: 'Name, email, and password are required' });
        }
        const existingUser = await SignUser.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ message: 'Email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new SignUser({ name, email, password: hashedPassword });
        await user.save();
        res.status(201).send({ message: 'User created successfully', user: { name, email } });
    } catch (error) {
        console.error('Sign-in error:', error.stack);
        res.status(500).send({ message: `Failed to create user: ${error.message}` });
    }
});

// Login route
router.post('/login', async(req, res) => {
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
        res.status(500).send({ message: `Server error: ${error.message}` });
    }
});

// File upload route
router.post('/upload', (req, res, next) => {
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
        console.log('File received:', {
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
        });

        const gridfsBucket = req.app.locals.gridfsBucket;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = `${uniqueSuffix}${path.extname(req.file.originalname)}`;

        // Upload to GridFS
        const uploadStream = gridfsBucket.openUploadStream(filename, {
            metadata: {
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
            },
        });
        uploadStream.write(req.file.buffer);
        uploadStream.end();

        uploadStream.on('finish', async() => {
            const file = new File({
                filename,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                path: `gridfs:${filename}`,
                size: req.file.size,
            });
            await file.save();
            console.log('File saved to MongoDB:', file);
            res.status(201).send({ message: 'File uploaded successfully', file });
        });

        uploadStream.on('error', (error) => {
            console.error('GridFS upload error:', error.stack);
            res.status(500).send({ message: `Failed to upload file: ${error.message}` });
        });
    } catch (error) {
        console.error('Upload error:', error.stack);
        res.status(500).send({ message: `Failed to upload file: ${error.message}` });
    }
});

// Get all files route
router.get('/files', async(req, res) => {
    try {
        const files = await File.find().sort({ uploadDate: -1 });
        res.status(200).send(files);
    } catch (error) {
        console.error('Fetch files error:', error.stack);
        res.status(500).send({ message: `Failed to fetch files: ${error.message}` });
    }
});

// Serve uploaded files with proper headers
router.get('/uploads/:filename', async(req, res) => {
    try {
        const filename = req.params.filename;
        if (!filename) {
            return res.status(400).send({ message: 'Filename is required' });
        }
        const file = await File.findOne({ filename });
        if (!file) {
            return res.status(404).send({ message: 'File not found in database' });
        }

        const gridfsBucket = req.app.locals.gridfsBucket;
        const downloadStream = gridfsBucket.openDownloadStreamByName(filename);

        downloadStream.on('error', (error) => {
            console.error('GridFS stream error:', error.stack);
            res.status(404).send({ message: 'File not found in GridFS' });
        });

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.originalName)}"`);
        downloadStream.pipe(res);
    } catch (error) {
        console.error('Serve file error:', error.stack);
        res.status(500).send({ message: `Failed to serve file: ${error.message}` });
    }
});

// Download file with proper headers
router.get('/download/:filename', async(req, res) => {
    try {
        const filename = req.params.filename;
        if (!filename) {
            return res.status(400).send({ message: 'Filename is required' });
        }
        const file = await File.findOne({ filename });
        if (!file) {
            return res.status(404).send({ message: 'File not found in database' });
        }

        const gridfsBucket = req.app.locals.gridfsBucket;
        const downloadStream = gridfsBucket.openDownloadStreamByName(filename);

        downloadStream.on('error', (error) => {
            console.error('GridFS stream error:', error.stack);
            res.status(404).send({ message: 'File not found in GridFS' });
        });

        res.setHeader('Content-Type', file.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
        downloadStream.pipe(res);
    } catch (error) {
        console.error('Download file error:', error.stack);
        res.status(500).send({ message: `Failed to download file: ${error.message}` });
    }
});

// Delete file
router.delete('/files/:id', async(req, res) => {
    try {
        const id = req.params.id;
        if (!id) {
            return res.status(400).send({ message: 'File ID is required' });
        }
        const file = await File.findById(id);
        if (!file) {
            return res.status(404).send({ message: 'File not found' });
        }

        const gridfsBucket = req.app.locals.gridfsBucket;
        const gridFile = await gridfsBucket.find({ filename: file.filename }).toArray();
        if (gridFile.length > 0) {
            await gridfsBucket.delete(new ObjectId(gridFile[0]._id));
        } else {
            console.warn(`File not found in GridFS: ${file.filename}`);
        }

        await File.findByIdAndDelete(id);
        res.status(200).send({ message: 'File deleted successfully' });
    } catch (error) {
        console.error('Delete error:', error.stack);
        res.status(500).send({ message: `Failed to delete file: ${error.message}` });
    }
});

module.exports = router;