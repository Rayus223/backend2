const ScheduledCall = require('../models/ScheduledCall');

// @desc    Get all scheduled calls (optionally filter by completed status)
// @route   GET /api/scheduled-calls
// @access  Private (Admin)
exports.getScheduledCalls = async (req, res) => {
  try {
    // Default to fetching non-completed calls
    const query = { isCompleted: req.query.completed === 'true' ? true : false };
    // Add filter by adminId if implemented: query.adminId = req.admin.id;
    
    const calls = await ScheduledCall.find(query).sort({ callDateTime: 1 }); // Sort by upcoming date
    res.status(200).json({ success: true, count: calls.length, data: calls });
  } catch (error) {
    console.error('Error fetching scheduled calls:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Create a scheduled call
// @route   POST /api/scheduled-calls
// @access  Private (Admin)
exports.createScheduledCall = async (req, res) => {
  console.log('--- Entering createScheduledCall ---');
  console.log('Request Body:', req.body);
  try {
    const { contactName, phoneNumber, callDateTime, notes } = req.body;

    if (!contactName || !callDateTime) {
      return res.status(400).json({ success: false, message: 'Contact name and call date/time are required' });
    }

    // Add adminId if implemented: req.body.adminId = req.admin.id;
    const newCall = await ScheduledCall.create(req.body);
    res.status(201).json({ success: true, data: newCall });
  } catch (error) {
    console.error('Error creating scheduled call:', error);
     if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(val => val.message);
            return res.status(400).json({ success: false, message: messages.join(', ') });
        }
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Update a scheduled call (e.g., mark as complete)
// @route   PUT /api/scheduled-calls/:id
// @access  Private (Admin)
exports.updateScheduledCall = async (req, res) => {
  try {
    const { id } = req.params;
    const { isCompleted } = req.body; // Expecting isCompleted status

    // Add filter by adminId if calls are user-specific
    let call = await ScheduledCall.findById(id);

    if (!call) {
      return res.status(404).json({ success: false, message: 'Scheduled call not found' });
    }

    // Add authorization check if calls are user-specific
    // if (call.adminId.toString() !== req.admin.id) {
    //   return res.status(401).json({ success: false, message: 'Not authorized to update this call' });
    // }

    call.isCompleted = isCompleted;
    await call.save();

    res.status(200).json({ success: true, data: call });
  } catch (error) {
    console.error('Error updating scheduled call:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// @desc    Delete a scheduled call
// @route   DELETE /api/scheduled-calls/:id
// @access  Private (Admin)
exports.deleteScheduledCall = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Add filter by adminId if calls are user-specific
    const call = await ScheduledCall.findById(id);

    if (!call) {
      return res.status(404).json({ success: false, message: 'Scheduled call not found' });
    }

    // Add authorization check if calls are user-specific
    // if (call.adminId.toString() !== req.admin.id) {
    //   return res.status(401).json({ success: false, message: 'Not authorized to delete this call' });
    // }

    await call.deleteOne(); // Use deleteOne() on the document

    res.status(200).json({ success: true, data: {} }); // Return empty object on successful delete
  } catch (error) {
    console.error('Error deleting scheduled call:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
}; 