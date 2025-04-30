const express = require('express');
const router = express.Router();
const {
  getScheduledCalls,
  createScheduledCall,
  updateScheduledCall,
  deleteScheduledCall
} = require('../controllers/scheduledCallController');
const adminAuth = require('../middleware/adminAuth'); // Assuming you have admin auth middleware

// Apply adminAuth middleware to all routes in this file
router.use(adminAuth);

router.route('/')
  .get(getScheduledCalls)
  .post(createScheduledCall);

router.route('/:id')
  .put(updateScheduledCall) // Use PUT for updating completion status
  .delete(deleteScheduledCall);

module.exports = router; 