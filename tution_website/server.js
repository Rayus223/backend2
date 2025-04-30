const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// Load env vars
dotenv.config();

// Initialize express
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Connect to database
connectDB();

// Fix database indexes after connection
const fixDatabaseIndexes = require('./config/fix-db-indexes');
setTimeout(() => {
  fixDatabaseIndexes()
    .then(result => {
      if (result.success) {
        console.log('Database indexes checked and fixed if needed');
      } else {
        console.error('Failed to fix database indexes');
      }
    })
    .catch(err => console.error('Error running database fix script:', err));
}, 3000); // Give the database 3 seconds to connect fully

// Store all connected clients
const clients = new Set();

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Cloudinary connection
cloudinary.api.ping()
  .then(() => console.log('Cloudinary connection successful'))
  .catch(error => console.error('Cloudinary connection failed:', error));

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');
    clients.add(ws);
    
    ws.on('close', () => {
        console.log('Client disconnected');
        clients.delete(ws);
    });
});

// Function to broadcast updates to all connected clients
const broadcastUpdate = (type, data) => {
    const message = JSON.stringify({ type, data });
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
};
// Export broadcastUpdate for use in other files
module.exports.broadcastUpdate = broadcastUpdate;

// Update CORS configuration - replace the existing cors middleware
app.use(cors({
    origin: [
        'http://localhost:3000',     // React admin panel
        'http://localhost:5000',     // Backend
        'http://localhost:5500',     // Live Server for frontend
        'http://127.0.0.1:3000',    // Alternative localhost for React
        'http://127.0.0.1:5000',    // Alternative localhost for backend
        'http://127.0.0.1:5500',    // Alternative localhost for frontend
        'https://dearsirhometuition.com',    // Production frontend
        'https://www.dearsirhometuition.com', // Production frontend with www
        'https://api.dearsirhometuition.com', // Production API
        'https://dshtadmin.dearsirhometuition.com' // Production admin panel
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true
}));

// Add preflight handler
app.options('*', cors());

// Increase payload limit for file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Add error handling for file uploads
app.use((err, req, res, next) => {
  console.error('Detailed Error:', {
    message: err.message,
    stack: err.stack,
    details: err
  });

  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
      code: err.code
    });
  }

  // Handle Cloudinary errors
  if (err.http_code) {
    return res.status(err.http_code).json({
      success: false,
      message: err.message,
      code: err.code
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? {
      stack: err.stack,
      details: err
    } : {},
    timestamp: new Date()
  });
});

// Add request logger before routes
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    console.log('Origin:', req.headers.origin);
    console.log('Headers:', req.headers);
    next();
});

// Import routes
const authRoutes = require('./routes/auth');
const teacherApplyRoutes = require('./routes/teacherApply');
const studentRoutes = require('./routes/students');
const parentRoutes = require('./routes/parent_apply');
const studentApplyRoutes = require('./routes/studentApply');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/adminRoutes');
const vacancyRoutes = require('./routes/vacancyRoutes');
const budgetRoutes = require('./routes/budgetRoutes');
const scheduledCallRoutes = require('./routes/scheduledCallRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/teacher-apply', teacherApplyRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/parents', parentRoutes);
app.use('/api/student-apply', studentApplyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/vacancies', vacancyRoutes);
app.use('/api/budget', budgetRoutes);
app.use('/api/scheduled-calls', scheduledCallRoutes);

// Test route
app.get('/api/test', (req, res) => {
    res.json({ 
        message: "Backend is working!",
        timestamp: new Date(),
        status: "online"
    });
});

// Add this near your other routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    uploads: fs.existsSync(uploadsDir)
  });
});

// Add this route for debugging
app.post('/api/debug-upload', (req, res) => {
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Files:', req.files);
  res.json({
    success: true,
    message: 'Debug information logged'
  });
});

// Add request body logging for the signup route
app.use('/api/teacher-apply/signup', (req, res, next) => {
  console.log('Signup Request:', {
    body: req.body,
    files: req.files,
    headers: req.headers
  });
  next();
});

// Add this test route
app.get('/api/test-cloudinary', async (req, res) => {
  try {
    const testResult = await cloudinary.uploader.upload(
      path.join(__dirname, 'uploads/test.txt'),
      { resource_type: 'raw' }
    );
    res.json({
      success: true,
      message: 'Cloudinary test successful',
      result: testResult
    });
  } catch (error) {
    console.error('Cloudinary test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Cloudinary test failed',
      error: process.env.NODE_ENV === 'development' ? error : {}
    });
  }
});

// Add this test route for Cloudinary upload
app.get('/api/test-cloudinary-upload', async (req, res) => {
    const testFilePath = path.join(__dirname, 'uploads', 'test.txt');
    console.log(`Attempting to upload test file: ${testFilePath}`);

    if (!fs.existsSync(testFilePath)) {
        console.error('Test file not found!', testFilePath);
        return res.status(400).json({ success: false, message: 'test.txt not found in uploads directory.' });
    }

    try {
        const startTime = Date.now();
        const result = await cloudinary.uploader.upload(testFilePath, {
            resource_type: 'raw',
            folder: 'cloudinary_test',
            timeout: 120000 // Keep the increased timeout for the test
        });
        const duration = Date.now() - startTime;
        console.log('Cloudinary test upload successful:', result);
        res.json({ 
            success: true, 
            message: 'Cloudinary test upload successful', 
            duration_ms: duration,
            result 
        });
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error('Cloudinary test upload FAILED:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Cloudinary test upload failed', 
            duration_ms: duration,
            error: {
                message: error.message,
                name: error.name,
                http_code: error.http_code
            }
        });
    }
});

// 404 handler
app.use((req, res, next) => {
    res.status(404).json({
        message: 'Route not found',
        requestedUrl: req.originalUrl
    });
});

// Add this after your routes
app.use((err, req, res, next) => {
    console.error('Server Error:', {
        message: err.message,
        stack: err.stack,
        details: err
    });

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.stack : 'Server error'
    });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('=================================');
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
  console.log(`MongoDB URI: ${process.env.MONGODB_URI.split('@').pop()}`); // Hide credentials
  console.log('Cloudinary:', {
    configured: !!process.env.CLOUDINARY_CLOUD_NAME,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME
  });
  console.log('=================================');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    // Don't exit the process in development
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});



