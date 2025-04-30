const mongoose = require('mongoose');

const scheduledCallSchema = new mongoose.Schema({
  contactName: {
    type: String,
    required: [true, 'Contact name is required'],
    trim: true
  },
  phoneNumber: {
    type: String,
    trim: true
  },
  callDateTime: {
    type: Date,
    required: [true, 'Call date and time are required']
  },
  notes: {
    type: String,
    trim: true
  },
  isCompleted: {
    type: Boolean,
    default: false
  },
  // Add admin ID if calls should be associated with the user who scheduled them
  // adminId: {
  //   type: mongoose.Schema.Types.ObjectId,
  //   ref: 'Admin', // Assuming your admin model is named 'Admin'
  //   required: true
  // }
}, { timestamps: true });

// Index for faster querying
scheduledCallSchema.index({ callDateTime: 1 });
scheduledCallSchema.index({ isCompleted: 1, callDateTime: 1 });

module.exports = mongoose.model('ScheduledCall', scheduledCallSchema); 