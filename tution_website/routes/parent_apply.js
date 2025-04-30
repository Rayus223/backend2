const express = require('express');
const router = express.Router();
const Parent = require('../models/Parent_apply');
const { 
    submitApplication, 
    getAllApplications,
    deleteApplication    // Add this
} = require('../controllers/parent_applyController');

// Submit parent application
router.post('/submit', submitApplication);

// Get all parent applications
router.get('/all', getAllApplications);

// Delete parent application
router.delete('/delete/:id', deleteApplication);  // Add this route


router.put('/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        const parent = await Parent.findByIdAndUpdate(
            id,
            { status },
            { new: true }
        );

        if (!parent) {
            return res.status(404).json({
                success: false,
                message: 'Parent application not found'
            });
        }

        res.json({
            success: true,
            data: parent
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});


// Update rejection count
router.put('/:id/reject', async (req, res) => {
    try {
        const parent = await Parent.findById(req.params.id);
        
        if (!parent) {
            return res.status(404).json({
                success: false,
                message: 'Parent application not found'
            });
        }

        parent.vacancyDetails.rejectedCount += 1;
        
        // If 5 rejections, update status to not_done
        if (parent.vacancyDetails.rejectedCount >= 5) {
            parent.status = 'not_done';
        }

        await parent.save();

        res.json({
            success: true,
            data: parent
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Link vacancy to parent application
router.put('/:id/link-vacancy', async (req, res) => {
    try {
        const { id } = req.params;
        const { vacancyId, status } = req.body;
        
        console.log(`Linking vacancy ${vacancyId} to parent ${id}`);
        
        const parent = await Parent.findByIdAndUpdate(
            id,
            { 
                status,
                'vacancyDetails.vacancyId': vacancyId,
                'vacancyDetails.createdAt': new Date()
            },
            { new: true }
        );

        if (!parent) {
            return res.status(404).json({
                success: false,
                message: 'Parent application not found'
            });
        }

        console.log(`Parent updated with vacancy: ${JSON.stringify(parent.vacancyDetails)}`);
        
        res.json({
            success: true,
            data: parent
        });
    } catch (error) {
        console.error('Error linking vacancy to parent:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;