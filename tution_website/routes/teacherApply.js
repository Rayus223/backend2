const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { 
    signup, 
    login, 
    checkRegistration, 
    resetPasswordRequest, 
    getProfile,
    acceptTeacherApplication,    
    rejectTeacherApplication,   
    updateVacancyStatus         
} = require('../controllers/teacherApplyController');
const authMiddleware = require('../middleware/auth');
const mongoose = require('mongoose');

const Vacancy = require('../models/Vacancy');
const Teacher = require('../models/TeacherApply');
const { broadcastUpdate } = require('../server');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');  // Regular fs for sync operations
const fsp = require('fs').promises;  // Promise-based fs for async operations

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Define allowed file types
const ALLOWED_TYPES = {
    'cv': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/jpg', 'image/png'],
    'certificates': ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png']
};

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Ensure uploads directory exists
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

// File filter function
const fileFilter = (req, file, cb) => {
    if (!ALLOWED_TYPES[file.fieldname]) {
        cb(new Error(`Unexpected field: ${file.fieldname}`), false);
        return;
    }

    if (!ALLOWED_TYPES[file.fieldname].includes(file.mimetype)) {
        cb(new Error(`Invalid file type for ${file.fieldname}. Allowed types: ${ALLOWED_TYPES[file.fieldname].join(', ')}`), false);
        return;
    }

    cb(null, true);
};

// Configure multer upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        switch (err.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({
                    success: false,
                    message: 'File size exceeds 2MB limit',
                    error: err.code
                });
            case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                    success: false,
                    message: 'Too many files uploaded',
                    error: err.code
                });
            default:
                return res.status(400).json({
                    success: false,
                    message: `Upload error: ${err.message}`,
                    error: err.code
                });
        }
    }
    
    if (err) {
        return res.status(400).json({
            success: false,
            message: err.message
        });
    }
    
    next();
};

// Routes
router.post('/signup', 
  upload.fields([
    { name: 'cv', maxCount: 1 },
    { name: 'certificates', maxCount: 5 }
  ]),
  async (req, res) => {
    try {
      console.log('Signup request body:', req.body);
      console.log('Signup files:', req.files);

      // Ensure uploads directory exists
      const uploadDir = path.join(__dirname, '..', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // Check for CV
      if (!req.files?.cv?.[0]) {
        return res.status(400).json({
          success: false,
          message: 'CV file is required'
        });
      }

      try {
        // Upload CV to Cloudinary
        const cvFile = req.files.cv[0];
        const isImageCV = ['image/jpeg', 'image/jpg', 'image/png'].includes(cvFile.mimetype);
        
        const cvResult = await cloudinary.uploader.upload(cvFile.path, {
          resource_type: isImageCV ? 'image' : 'raw',
          folder: 'teacher_cvs',
          timeout: 120000 // Increased timeout to 120 seconds
        });

        // Upload certificates if any
        const certificateUrls = [];
        if (req.files.certificates) {
          for (const cert of req.files.certificates) {
            const isImageCert = ['image/jpeg', 'image/jpg', 'image/png'].includes(cert.mimetype);
            
            const certResult = await cloudinary.uploader.upload(cert.path, {
              resource_type: isImageCert ? 'image' : 'raw',
              folder: 'teacher_certificates',
              timeout: 120000 // Increased timeout here too
            });
            certificateUrls.push(certResult.secure_url);
          }
        }

        // Add URLs to request body
        req.body.cvUrl = cvResult.secure_url;
        req.body.certificateUrls = certificateUrls;

        // Call signup controller
        await signup(req, res);

      } catch (uploadError) {
        console.error('File upload error:', uploadError);
        throw new Error('Error uploading files to Cloudinary');
      } finally {
        // Clean up local files
        for (const fileType in req.files) {
          for (const file of req.files[fileType]) {
            try {
              await fs.promises.unlink(file.path);
            } catch (err) {
              console.warn('Failed to delete local file:', err);
            }
          }
        }
      }

    } catch (error) {
      console.error('Route Error:', error);
      res.status(500).json({
        success: false,
        message: 'Error processing signup',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
      });
    }
  }
);

router.post('/login', login);
router.get('/check-registration', checkRegistration);
router.post('/reset-password', resetPasswordRequest);

// Token refresh endpoint
router.post('/refresh-token', async (req, res) => {
  try {
    // Get the old token from the authorization header
    const authHeader = req.header('Authorization');
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization header found'
      });
    }

    const oldToken = authHeader.replace('Bearer ', '');
    if (!oldToken) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Try to decode the expired token to get the user ID
    let decoded;
    try {
      // Verify without checking expiration
      const jwt = require('jsonwebtoken');
      decoded = jwt.verify(oldToken, process.env.JWT_SECRET, { ignoreExpiration: true });
      
      if (!decoded.id) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token format'
        });
      }
    } catch (error) {
      console.error('Token verification failed:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    // Find the teacher by ID
    const teacher = await Teacher.findById(decoded.id);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    // Create a new token
    const jwt = require('jsonwebtoken');
    const newToken = jwt.sign(
      { 
        id: teacher._id, 
        email: teacher.email,
        role: 'teacher'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // 24-hour expiration
    );

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing token'
    });
  }
});

// GET available vacancies
router.get('/available-vacancies', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching available vacancies...');
    const currentTeacherId = req.user.id;

    const vacancies = await Vacancy.find({ 
      status: 'open',
      // Only get vacancies with less than 5 applications
      $expr: { 
        $lt: [{ $size: '$applications' }, 5]
      },
      // Exclude vacancies where the current teacher has already applied
      'applications': {
        $not: {
          $elemMatch: {
            'teacher': new mongoose.Types.ObjectId(currentTeacherId)
          }
        }
      }
    })
    .select('title subject description requirements salary applications status')
    .lean();
    
    console.log('Found available vacancies:', vacancies.length);
    
    const formattedVacancies = vacancies.map(vacancy => ({
      ...vacancy,
      applicantCount: vacancy.applications?.length || 0
    }));

    res.json({
      success: true,
      data: formattedVacancies
    });

  } catch (error) {
    console.error('Error fetching available vacancies:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available vacancies',
      error: error.message
    });
  }
});

// Protected routes (auth required)
router.get('/profile', authMiddleware, getProfile);
router.put('/accept/:teacherId/:vacancyId', authMiddleware, acceptTeacherApplication);
router.put('/reject/:teacherId/:vacancyId', authMiddleware, rejectTeacherApplication);
router.put('/vacancy-status/:parentId', authMiddleware, updateVacancyStatus);

// APPLY TO VACANCY ROUTE
router.post('/apply-vacancy/:id', authMiddleware, async (req, res) => {
    // Log when the route is hit
    console.log(`[${Date.now()}] === POST /apply-vacancy/${req.params.id} route hit ===`); 
    try {
        const vacancyId = req.params.id;
        const currentTeacherId = req.user.id; // From auth middleware

        console.log('Teacher applying to vacancy:', { teacherId: currentTeacherId, vacancyId });

        // Check if vacancy exists and is open
        const vacancy = await Vacancy.findOne({ 
            _id: vacancyId,
            status: 'open'
        });

        if (!vacancy) {
            return res.status(404).json({
                success: false,
                message: 'Vacancy not found or not open'
            });
        }

        // Check if already applied
        const alreadyApplied = vacancy.applications.some(
            app => app.teacher.toString() === currentTeacherId
        );

        if (alreadyApplied) {
            return res.status(400).json({
                success: false,
                message: 'You have already applied for this vacancy'
            });
        }

        // Check if vacancy has less than 5 applications
        if (vacancy.applications.length >= 5) {
            return res.status(400).json({
                success: false,
                message: 'This vacancy has reached maximum applications'
            });
        }

        // Add application with explicit pending status
        vacancy.applications.push({
            teacher: currentTeacherId,
            status: 'pending', // Explicitly set status to pending
            appliedAt: new Date()
        });

        await vacancy.save();

        // ---> ADD WebSocket Broadcast HERE <---
        try {
            // Ensure teacher data is populated or fetched if needed for name
            const teacherData = await Teacher.findById(req.user.id).select('fullName').lean(); 
            const teacherName = teacherData ? teacherData.fullName : 'Unknown Teacher';
            
            // Add timestamp to log for debugging duplicates
            const logTimestamp = Date.now(); 
            console.log(`[${logTimestamp}] Broadcasting NEW_APPLICATION: Teacher: ${teacherName}, Vacancy: ${vacancy.title}`);
            
            broadcastUpdate('NEW_APPLICATION', {
                teacherName: teacherName,
                vacancyTitle: vacancy.title,
                // Include any other relevant details for the frontend if needed
                vacancyId: vacancy._id,
                applicationId: vacancy.applications[vacancy.applications.length - 1]._id, // Get ID of the newly added application
                teacher: { _id: req.user.id, fullName: teacherName } // Basic teacher info for context
            });
        } catch (broadcastError) {
            // Log error but don't fail the main request
            console.error('WebSocket broadcast failed:', broadcastError);
        }
        // ---> END WebSocket Broadcast <--- 

        res.status(201).json({
            success: true,
            message: 'Applied successfully',
            data: vacancy
        });
    } catch (error) {
        console.error('Error applying to vacancy:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting application'
        });
    }
});

// Get all teachers (both direct signups and vacancy applications)
router.get('/all', async (req, res) => {
    try {
      const teachers = await Teacher.find()
        .select('-password')
        .sort({ createdAt: -1 });
      
      res.json({
        success: true,
        data: teachers
      });
    } catch (error) {
      console.error('Error fetching teachers:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error fetching teachers',
        error: error.message 
      });
    }
  });
  
  // GET teachers by status (e.g., /status/approved?latitude=28.61&longitude=77.20&radiusKm=5)
  router.get('/status/:status', async (req, res) => {
    try {
        const { status } = req.params;
        const { latitude, longitude, radiusKm } = req.query;

        let teachers; // Declare teachers variable

        if (latitude && longitude && radiusKm) {
            // --- Use Aggregation with $geoNear --- 
            const lat = parseFloat(latitude);
            const lon = parseFloat(longitude);
            const radiusMeters = parseFloat(radiusKm) * 1000; // Convert km to meters

            if (isNaN(lat) || isNaN(lon) || isNaN(radiusMeters)) {
                return res.status(400).json({ success: false, message: 'Invalid location parameters' });
            }

            console.log(`Applying geospatial filter using $geoNear: radius ${radiusKm}km around [${lon}, ${lat}]`);

            teachers = await Teacher.aggregate([ // Use Teacher model (assuming 'Teacher' is the correct model name)
                {
                    $geoNear: {
                        near: { type: "Point", coordinates: [lon, lat] }, // Longitude first!
                        distanceField: "dist.calculated", // Output distance in meters here
                        maxDistance: radiusMeters,
                        query: { status: status }, // Filter by status *within* the geoNear stage
                        spherical: true, // Specify spherical calculation
                        distanceMultiplier: 0.001 // Convert meters to kilometers in output
                    }
                },
                // Optional: Add a $match stage if you need other filters not supported by geoNear's query
                // { $match: { otherField: someValue } },
                 // Project to reshape the output and explicitly include necessary fields
                {
                     $project: {
                        _id: 1, 
                        fullName: 1,
                        email: 1,
                        phone: 1,
                        address: 1, // Include address if needed
                        location: 1, // Include original location data
                        grade: 1, // Include grade
                        subjects: 1, // Include subjects
                        status: 1, // Include status
                        cv: 1, // Include CV URL
                        certificates: 1, // Include certificates
                        createdAt: 1, // Include timestamps if needed
                        updatedAt: 1,
                        distance: "$dist.calculated" // Rename and include distance (now in km)
                    }
                }
            ]);
            
            // No need for the extra map step as $project handles the distance field placement
            // teachers = teachers.map(t => ({ ...t, distance: t.dist?.calculated }));


        } else {
            // --- Fetch all teachers with the given status (no location filter) ---
            console.log(`Fetching all teachers with status: ${status} (no location filter)`);
            teachers = await Teacher.find({ status: status }); // Use Teacher model
        }

        console.log(`Found ${teachers.length} teachers matching criteria.`);
        res.json({
            success: true,
            data: teachers
        });

    } catch (error) {
        console.error(`Error fetching teachers by status (${req.params.status}):`, error);
        res.status(500).json({ success: false, message: 'Error fetching teachers', error: error.message });
    }
  });
  
  // Add this route to update teacher status
  router.put('/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, isActive } = req.body;

      console.log('Updating teacher status:', { id, status, isActive });

      // Get current teacher first
      const currentTeacher = await Teacher.findById(id);
      if (!currentTeacher) {
        console.log('Teacher not found:', id);
        return res.status(404).json({
          success: false,
          message: 'Teacher not found'
        });
      }

      // Update teacher with new values
      const updates = {};

      // Only update status if provided
      if (status) {
        updates.status = status;
      }

      // Only update isActive if it's a boolean
      if (typeof isActive === 'boolean') {
        updates.isActive = isActive;
      }

      // Add lastUpdated timestamp
      updates.lastUpdated = new Date();

      console.log('Applying updates:', updates);

      const updatedTeacher = await Teacher.findByIdAndUpdate(
        id,
        updates,
        { new: true }
      );

      // Simply return success, no need to update vacancies here
      // The frontend will handle UI updates
      
      res.json({
        success: true,
        message: `Teacher status updated successfully`,
        data: updatedTeacher
      });

    } catch (error) {
      console.error('Error updating teacher status:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating teacher status',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

// Add this route before module.exports
router.get('/my-applications', authMiddleware, async (req, res) => {
  try {
    console.log('Fetching applications for teacher:', req.user._id);
    
    // Find all vacancies where this teacher has applied
    const vacancies = await Vacancy.find({
      'applications.teacher': req.user._id
    })
    .select('title subject description requirements salary status applications')
    .lean();

    console.log('Found vacancies:', vacancies.length);

    // Format the applications data
    const applications = vacancies.map(vacancy => {
      const application = vacancy.applications.find(
        app => app.teacher.toString() === req.user._id.toString()
      );

      return {
        id: application._id,
        vacancy: {
          id: vacancy._id,
          title: vacancy.title,
          subject: vacancy.subject,
          description: vacancy.description,
          requirements: vacancy.requirements,
          salary: vacancy.salary,
          status: vacancy.status
        },
        status: application.status,
        appliedAt: application.appliedAt
      };
    });

    console.log('Formatted applications:', applications.length);

    res.json({
      success: true,
      applications: applications
    });

  } catch (error) {
    console.error('Error fetching applications:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching applications',
      error: error.message
    });
  }
});

// Add this route before module.exports
router.put('/update-profile', authMiddleware, upload.single('cv'), async (req, res) => {
  try {
    const { fullName, email, phone, subjects, fees } = req.body;
    const updates = {
      fullName,
      email,
      phone,
      subjects: subjects.split(',').map(s => s.trim()),
      fees
    };

    // If a new CV was uploaded
    if (req.file) {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        resource_type: 'raw',
        folder: 'teacher_cvs',
      });
      
      // Add CV URL to updates
      updates.cv = result.secure_url;

      // Delete local file
      await fsp.unlink(req.file.path);
    }

    const teacher = await Teacher.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true }
    ).select('-password');

    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      teacher
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
});

// Create uploads directory at startup
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
console.log('Uploads directory verified:', uploadDir);

// Add this route to check featured vacancies
router.get('/check-featured', async (req, res) => {
  try {
    const count = await Vacancy.countDocuments({
      featured: true,
      status: 'active'
    });

    console.log('Featured vacancies count:', count);

    res.json({
      success: true,
      count: count
    });
  } catch (error) {
    console.error('Error checking featured vacancies:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking featured vacancies'
    });
  }
});

// Update the route to get vacancy applicants
router.get('/vacancy-applicants/:id', authMiddleware, async (req, res) => {
    try {
        const vacancy = await Vacancy.findById(req.params.id)
            .populate({
                path: 'applications.teacher',
                select: 'fullName email phone subjects cv status'
            });

        if (!vacancy) {
            return res.status(404).json({
                success: false,
                message: 'Vacancy not found'
            });
        }

        // Ensure all applications have an explicit status (default to pending)
        const applications = vacancy.applications.map(app => {
            const appObj = app.toObject ? app.toObject() : app;
            return {
                ...appObj,
                status: appObj.status || 'pending' // Explicitly set default status
            };
        });

        res.json({
            success: true,
            data: applications
        });

    } catch (error) {
        console.error('Error fetching vacancy applicants:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching applicants',
            error: error.message
        });
    }
});

// Update the application status route
router.put('/application-status/:applicationId', authMiddleware, async (req, res) => {
    try {
        const { applicationId } = req.params;
        const { status } = req.body;

        // Find and update the vacancy with the application
        const vacancy = await Vacancy.findOneAndUpdate(
            { 'applications._id': applicationId },
            { 
                $set: { 
                    'applications.$.status': status,
                    // If status is 'accepted', close the vacancy
                    ...(status === 'accepted' ? { status: 'closed' } : {})
                } 
            },
            { new: true }
        ).populate({
            path: 'applications.teacher',
            select: 'fullName email phone subjects cv status'
        });

        if (!vacancy) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // If application was accepted, reject all other pending applications
        if (status === 'accepted') {
            await Vacancy.updateOne(
                { _id: vacancy._id },
                {
                    $set: {
                        'applications.$[elem].status': 'rejected'
                    }
                },
                {
                    arrayFilters: [
                        { 
                            'elem._id': { $ne: applicationId },
                            'elem.status': 'pending'
                        }
                    ]
                }
            );
        }

        res.json({
            success: true,
            message: `Application ${status} successfully`,
            data: vacancy.applications
        });

    } catch (error) {
        console.error('Error updating application status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating application status',
            error: error.message
        });
    }
});

module.exports = router;
