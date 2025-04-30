const mongoose = require('mongoose');

const vacancySchema = new mongoose.Schema({
    title: { type: String, required: true },
    subject: { type: String, required: true },
    class: { type: String, default: 'Not specified' },
    time: { type: String, default: 'Not specified' },
    location: { type: String, default: 'Not specified' },
    gender: { 
        type: String, 
        enum: ['male', 'female', 'any'],
        default: 'any'
    },
    description: { type: String, required: true },
    salary: { type: String, required: true },
    status: {
        type: String,
        enum: ['open', 'closed', 'pending'],
        default: 'open'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Parent',
        default: null
    },
    applications: [{
        teacher: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Teacher',
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected'],
            default: 'pending'
        },
        appliedAt: {
            type: Date,
            default: Date.now
        }
    }],
    featured: {
        type: Boolean,
        default: false
    },
    adminLastViewedApplicantsAt: {
        type: Date,
        default: null
    }
}, { timestamps: true });

vacancySchema.index({ featured: 1, status: 1 });

module.exports = mongoose.model('Vacancy', vacancySchema);