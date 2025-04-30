const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
    teacherId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Teacher',
        required: true
    },
    teacherName: {
        type: String,
        required: true
    },
    vacancyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vacancy',
        required: true
    },
    vacancyTitle: {
        type: String,
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    amountLeft: {
        type: Number,
        default: 0
    },
    dueDate: {
        type: Date
    },
    date: {
        type: Date,
        default: Date.now
    },
    status: {
        type: String,
        enum: ['paid', 'partial', 'refunded'],
        default: 'paid'
    },
    type: {
        type: String,
        enum: ['payment', 'refund'],
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Budget', budgetSchema); 