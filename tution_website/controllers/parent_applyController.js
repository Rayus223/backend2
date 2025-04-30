const Parent = require('../models/Parent_apply');

// Submit parent application
const submitApplication = async (req, res) => {
    try {
        // Find the last parent to get the latest application number
        const lastParent = await Parent.findOne().sort({ applicationNumber: -1 });
        const newApplicationNumber = lastParent?.applicationNumber 
            ? lastParent.applicationNumber + 1 
            : 1;

        const parent = new Parent({
            applicationNumber: newApplicationNumber,
            parentName: req.body.parentName,
            phone: req.body.phone,
            address: req.body.address,
            salary: req.body.salary,
            preferredTeacher: req.body.preferredTeacher,
            grade: req.body.grade,
            subjects: req.body.subjects || [],
            preferredTime: req.body.preferredTime
        });

        // Log before saving for debugging
        console.log('Attempting to save parent with data:', JSON.stringify(parent, null, 2));

        await parent.save();
        console.log('Saved parent with application number:', parent.applicationNumber);

        res.status(201).json({
            success: true,
            message: 'Parent application submitted successfully',
            data: parent
        });
    } catch (error) {
        console.error('Parent application error:', error);
        
        // More detailed error logging
        if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            if (error.code === 11000) {
                console.error('Duplicate key error details:', error.keyValue);
            }
        }
        
        res.status(400).json({
            success: false,
            message: error.message,
            errorType: error.name,
            errorCode: error.code
        });
    }
};

// Helper function to migrate existing data
const migrateExistingData = async () => {
    try {
        // First find the highest application number
        const highestRecord = await Parent.findOne().sort({ applicationNumber: -1 });
        let startingNumber = highestRecord?.applicationNumber ? highestRecord.applicationNumber + 1 : 1;
        
        const parents = await Parent.find({ applicationNumber: { $exists: false } });
        console.log(`Found ${parents.length} parents without application numbers, starting from ${startingNumber}`);
        
        for (let i = 0; i < parents.length; i++) {
            const parent = parents[i];
            parent.applicationNumber = startingNumber + i;
            await parent.save();
        }
        console.log('Migration completed');
    } catch (error) {
        console.error('Migration error:', error);
    }
};

// Get all parent applications
const getAllApplications = async (req, res) => {
    try {
        await migrateExistingData();

        const parents = await Parent.find()
            .sort({ submissionDate: -1 })  // Changed to -1 for descending order
            .lean();

        // Ensure subjects is always an array but keep original application numbers
        const updatedParents = parents.map(parent => ({
            ...parent,
            subjects: parent.subjects || []
        }));

        res.status(200).json({
            success: true,
            data: updatedParents
        });
    } catch (error) {
        console.error('Error in getAllApplications:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// Delete parent application
const deleteApplication = async (req, res) => {
    try {
        const parent = await Parent.findById(req.params.id);
        if (!parent) {
            return res.status(404).json({
                success: false,
                message: 'Parent application not found'
            });
        }

        await parent.deleteOne();
        res.status(200).json({
            success: true,
            message: 'Parent application deleted successfully'
        });
    } catch (error) {
        console.error('Error in deleteApplication:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    submitApplication,
    getAllApplications,
    deleteApplication
};