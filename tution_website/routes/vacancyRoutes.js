const express = require('express');
const router = express.Router();
const Vacancy = require('../models/Vacancy');
const Parent = require('../models/Parent_apply');
const adminAuth = require('../middleware/adminAuth');
const mongoose = require('mongoose');

// GET featured vacancies - MOVED TO TOP
router.get('/featured', async (req, res) => {
  try {
    console.log('Fetching featured vacancies...');
    const vacancies = await Vacancy.find({ 
      status: 'open',  // Changed from 'active' to match your schema
      featured: true 
    })
    .select('title subject description requirements salary _id featured status')
    .lean();
   
    console.log('Found featured vacancies:', vacancies.length);

    res.json({
      success: true,
      data: vacancies
    });
  } catch (error) {
    console.error('Error fetching featured vacancies:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching featured vacancies'
    });
  }
});

// Get all vacancies
router.get('/', async (req, res) => {
    try {
        console.log('Fetching all vacancies...');
        const vacancies = await Vacancy.find()
            // Explicitly select fields needed for the applicants modal
            .populate({ 
                path: 'applications.teacher', 
                select: '_id fullName email phone address subjects cv' 
            })
            .sort({ createdAt: -1 });
        
        // Ensure all applications have an explicit status (default to pending)
        const processedVacancies = vacancies.map(vacancy => {
            const vacancyObj = vacancy.toObject();
            if (vacancyObj.applications) {
                vacancyObj.applications = vacancyObj.applications.map(app => ({
                    ...app,
                    status: app.status || 'pending' // Explicitly set default status
                }));
            }
            return vacancyObj;
        });
        
        console.log(`Found ${vacancies.length} vacancies`);
        res.json({
            success: true,
            data: processedVacancies
        });
    } catch (error) {
        console.error('Error fetching vacancies:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Error fetching vacancies'
        });
    }
});

// Create new vacancy
router.post('/', adminAuth, async (req, res) => {
    try {
        const vacancy = new Vacancy({
            title: req.body.title,
            subject: req.body.subject,
            class: req.body.class,
            time: req.body.time,
            location: req.body.location,
            gender: req.body.gender || 'any',
            description: req.body.description,
            salary: req.body.salary,
            status: 'open',
            featured: req.body.featured || false,
            createdBy: req.admin.id,
            parentId: req.body.parentId || null
        });
        
        console.log('Creating vacancy with data:', vacancy); // Debug log
        
        const newVacancy = await vacancy.save();
        res.status(201).json({
            success: true,
            data: newVacancy
        });
    } catch (error) {
        console.error('Error creating vacancy:', error);
        res.status(400).json({ 
            success: false,
            message: error.message 
        });
    }
});

// Update vacancy
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        // If only featured status is being updated, preserve all other fields
        if (Object.keys(updates).length === 1 && 'featured' in updates) {
            const vacancy = await Vacancy.findByIdAndUpdate(
                id,
                { $set: { featured: updates.featured } },
                { new: true, runValidators: true }
            );

            if (!vacancy) {
                return res.status(404).json({
                    success: false,
                    message: 'Vacancy not found'
                });
            }

            return res.json({
                success: true,
                vacancy
            });
        }
        
        // Otherwise do a full update
        const vacancy = await Vacancy.findByIdAndUpdate(
            id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!vacancy) {
            return res.status(404).json({
                success: false,
                message: 'Vacancy not found'
            });
        }

        res.json({
            success: true,
            vacancy
        });
    } catch (error) {
        console.error('Error updating vacancy:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating vacancy'
        });
    }
});

// Delete vacancy
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const vacancy = await Vacancy.findByIdAndDelete(req.params.id);
        if (!vacancy) {
            return res.status(404).json({ message: 'Vacancy not found' });
        }
        res.json({ message: 'Vacancy deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get vacancy by ID
router.get('/:id', async (req, res) => {
    try {
        const vacancy = await Vacancy.findById(req.params.id)
            .populate('applications.teacher');
        if (!vacancy) {
            return res.status(404).json({ message: 'Vacancy not found' });
        }
        res.json(vacancy);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update vacancy status
router.patch('/:id/status', adminAuth, async (req, res) => {
    try {
        const { status } = req.body;
        console.log('Updating vacancy status:', { id: req.params.id, status }); // Add debug log
        
        if (!['open', 'closed'].includes(status.toLowerCase())) {
            return res.status(400).json({ 
                success: false,
                message: 'Invalid status. Must be either "open" or "closed"' 
            });
        }

        const vacancy = await Vacancy.findByIdAndUpdate(
            req.params.id,
            { status: status.toLowerCase() },
            { new: true }
        );
        
        if (!vacancy) {
            return res.status(404).json({ 
                success: false,
                message: 'Vacancy not found' 
            });
        }
        
        res.json({
            success: true,
            data: vacancy
        });
    } catch (error) {
        console.error('Error updating vacancy status:', error);
        res.status(500).json({ 
            success: false,
            message: error.message 
        });
    }
});

router.get('/:id/applicants', adminAuth, async (req, res) => {
    try {
        const vacancyId = req.params.id;
        console.log('Fetching applicants for vacancy:', vacancyId);
        
        const vacancy = await Vacancy.findById(vacancyId)
            .populate({
                path: 'applications.teacher',
                select: 'fullName email phone status cv fees subjects'
            });

        console.log('Found vacancy:', vacancy);
        console.log('Raw applications:', vacancy.applications);

        if (!vacancy) {
            console.log('No vacancy found with ID:', vacancyId);
            return res.json([]);
        }

        const applicants = vacancy.applications
            .filter(app => app && app.teacher)
            .map(app => ({
                _id: app.teacher._id,
                fullName: app.teacher.fullName,
                email: app.teacher.email,
                phone: app.teacher.phone,
                status: app.status,
                cv: app.teacher.cv,
                fees: app.teacher.fees,
                subjects: app.teacher.subjects,
                appliedAt: app.appliedAt
            }));

        console.log('Processed applicants:', applicants);
        res.json(applicants);
    } catch (error) {
        console.error('Error fetching applicants:', error);
        res.status(500).json({ message: error.message });
    }
});

// Update application status route
router.put('/:vacancyId/applications/:applicationId/status', adminAuth, async (req, res) => {
    try {
        const { vacancyId, applicationId } = req.params;
        const { status } = req.body;

        console.log('Updating application status:', { vacancyId, applicationId, status });

        // Find the vacancy first
        const vacancy = await Vacancy.findById(vacancyId).populate('applications.teacher');
        if (!vacancy) {
            return res.status(404).json({
                success: false,
                message: 'Vacancy not found'
            });
        }

        // Find the application
        const application = vacancy.applications.find(app => app._id.toString() === applicationId);
        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // If accepting an application
        if (status === 'accepted') {
            // Check if the vacancy already has an accepted application
            const hasAcceptedApplication = vacancy.applications.some(app => 
                app.status === 'accepted' && app._id.toString() !== applicationId
            );

            if (hasAcceptedApplication) {
                return res.status(400).json({
                    success: false,
                    message: 'This vacancy already has an accepted application'
                });
            }

            // Check if vacancy is already closed
            if (vacancy.status === 'closed') {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot accept application for a closed vacancy'
                });
            }

            // First update this application to accepted and close the vacancy
            await Vacancy.findOneAndUpdate(
                { _id: vacancyId, 'applications._id': applicationId },
                { 
                    $set: {
                        'applications.$.status': 'accepted',
                        status: 'closed' // Close the vacancy
                    }
                }
            );

            // Then reject all other pending applications for this vacancy
            await Vacancy.findOneAndUpdate(
                { _id: vacancyId },
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

            // Update the parent status to 'done' if this vacancy was created from a parent application
            if (vacancy.parentId) {
                console.log(`Updating parent ${vacancy.parentId} status to 'done'`);
                const updatedParent = await Parent.findByIdAndUpdate(
                    vacancy.parentId,
                    { status: 'done' },
                    { new: true }
                );
                
                // Broadcast WebSocket notification for parent status change
                try {
                    const { broadcastUpdate } = require('../server');
                    broadcastUpdate('PARENT_STATUS_UPDATED', {
                        parentId: vacancy.parentId,
                        newStatus: 'done',
                        vacancyId: vacancyId
                    });
                    console.log('WebSocket notification sent for parent status update');
                } catch (wsError) {
                    console.error('Failed to broadcast WebSocket notification:', wsError);
                }
            }

            // Get the updated vacancy with all applications
            const updatedVacancy = await Vacancy.findById(vacancyId)
                .populate('applications.teacher');

            return res.json({
                success: true,
                message: 'Application accepted and others rejected',
                data: updatedVacancy
            });
        } else {
            // For rejection or other status updates
            const updatedVacancy = await Vacancy.findOneAndUpdate(
                { _id: vacancyId, 'applications._id': applicationId },
                { 
                    $set: {
                        'applications.$.status': status
                    }
                },
                { new: true }
            ).populate('applications.teacher');

            return res.json({
                success: true,
                message: `Application ${status} successfully`,
                data: updatedVacancy
            });
        }
    } catch (error) {
        console.error('Error updating application status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating application status',
            error: error.message
        });
    }
});

// Add this new route for available vacancies
router.get('/available-vacancies', async (req, res) => {
    try {
        const vacancies = await Vacancy.find({ 
            status: 'open',
            // Only get vacancies with less than 5 applications
            $expr: { 
                $lt: [{ $size: "$applications" }, 5]
            }
        })
        .select('title subject description requirements salary applications status')
        .lean();

        res.json({
            success: true,
            data: vacancies
        });
    } catch (error) {
        console.error('Error fetching available vacancies:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching available vacancies'
        });
    }
});

// Add this route for applying to a vacancy
router.post('/apply-vacancy/:id', async (req, res) => {
    try {
        const vacancyId = req.params.id;
        const teacherId = req.teacher.id; // From auth middleware

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
            app => app.teacher.toString() === teacherId
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

        // Add application
        vacancy.applications.push({
            teacher: teacherId,
            status: 'pending'
        });

        await vacancy.save();

        res.json({
            success: true,
            message: 'Application submitted successfully'
        });

    } catch (error) {
        console.error('Error applying to vacancy:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting application'
        });
    }
});

// GET - Get a specific vacancy by ID
router.get('/vacancy/:id', async (req, res) => {
  try {
    console.log(`Fetching vacancy with ID: ${req.params.id}`);
    
    // Check if the ID is valid
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      console.log(`Invalid vacancy ID format: ${req.params.id}`);
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid vacancy ID format' 
      });
    }
    
    const vacancy = await Vacancy.findById(req.params.id);
    
    if (!vacancy) {
      console.log(`Vacancy not found with ID: ${req.params.id}`);
      return res.status(404).json({ 
        success: false, 
        message: 'Vacancy not found' 
      });
    }
    
    console.log(`Successfully fetched vacancy: ${vacancy.name}`);
    return res.status(200).json({ 
      success: true, 
      data: vacancy 
    });
  } catch (error) {
    console.error('Error fetching vacancy by ID:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Error fetching vacancy',
      error: error.message 
    });
  }
});

// Add this route in routes/vacancyRoutes.js
router.patch('/:vacancyId/applications/mark-viewed', adminAuth, async (req, res) => {
    try {
        const { vacancyId } = req.params;

        // Validate if vacancyId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(vacancyId)) {
            return res.status(400).json({ success: false, message: 'Invalid Vacancy ID format' });
        }

        console.log(`Updating last viewed timestamp for vacancy: ${vacancyId}`);

        // Change: Update the timestamp on the Vacancy document directly
        const updatedVacancy = await Vacancy.findByIdAndUpdate(
            vacancyId,
            { $set: { adminLastViewedApplicantsAt: new Date() } }, // Set the timestamp
            { new: true } // Return the updated document
        );

        // Remove the old Vacancy.updateOne logic
        /*
        const updateResult = await Vacancy.updateOne(
            { _id: vacancyId, 'applications.isAdminViewed': false }, // Only update if there are unviewed ones
            { $set: { 'applications.$[].isAdminViewed': true } }
        );
        console.log('Update Result:', updateResult);
        */
       
        // Check if the update was successful
        if (!updatedVacancy) {
             // This case should be less likely now unless the ID was valid format but didn't exist
             console.log(`Vacancy not found during timestamp update: ${vacancyId}`);
            return res.status(404).json({ success: false, message: 'Vacancy not found' });
        } 

        console.log(`Successfully updated last viewed timestamp for vacancy ${vacancyId}`);
        // Return the new timestamp in the response data
        res.json({ 
            success: true, 
            message: 'Last viewed timestamp updated successfully',
            data: { adminLastViewedApplicantsAt: updatedVacancy.adminLastViewedApplicantsAt } 
        });

    } catch (error) {
        console.error('Error updating last viewed timestamp:', error);
        res.status(500).json({ success: false, message: 'Failed to update last viewed timestamp' });
    }
});

module.exports = router;