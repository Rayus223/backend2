const BudgetTransaction = require('../models/BudgetTransaction');
const mongoose = require('mongoose');
const Teacher = require('../models/TeacherApply'); // Corrected path back to TeacherApply

// Get all budget transactions
exports.getBudgetTransactions = async (req, res) => {
    try {
        const transactions = await BudgetTransaction.find()
            .populate({ path: 'teacherId', select: 'phone fullName' })
            .sort({ date: -1 });

        const formattedTransactions = transactions.map(t => {
            const transactionObject = t.toObject();
            return {
                ...transactionObject,
                teacherName: transactionObject.teacherId?.fullName || transactionObject.teacherName || 'Unknown Teacher',
                teacherPhone: transactionObject.teacherId?.phone || null
            };
        });

        res.status(200).json({
            success: true,
            data: formattedTransactions
        });
    } catch (error) {
        console.error('Error fetching budget transactions:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to fetch budget transactions' 
        });
    }
};

// Save a new budget transaction
exports.saveBudgetTransaction = async (req, res) => {
    try {
        const {
            teacherId,
            teacherName,
            vacancyId,
            vacancyTitle,
            applicationId,
            amount,
            type,
            status,
            remainingAmount,
            dueDate,
            reason,
            originalPaymentId,
            isAdminOverride
        } = req.body;

        // Validate required fields
        if (!teacherId || !teacherName || !vacancyId || !vacancyTitle || !amount || !type) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Additional validation for partial payments
        if (status === 'partial') {
            if (remainingAmount === undefined || remainingAmount <= 0 || !dueDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Partial payments require remainingAmount and dueDate'
                });
            }
        }

        // Additional validation for refunds
        if (type === 'refund') {
            if (!reason) {
                return res.status(400).json({
                    success: false,
                    message: 'Refunds require a reason'
                });
            }

            // Skip original payment validation for admin overrides
            if (!isAdminOverride) {
                // Require originalPaymentId for non-admin-override refunds
                if (!originalPaymentId) {
                    return res.status(400).json({
                        success: false,
                        message: 'Refunds require original payment ID'
                    });
                }

                // Check if original payment exists
                const originalPayment = await BudgetTransaction.findById(originalPaymentId);
                if (!originalPayment || originalPayment.type !== 'payment') {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid original payment'
                    });
                }

                // Check if refund already exists
                const existingRefund = await BudgetTransaction.findOne({
                    type: 'refund',
                    originalPaymentId: mongoose.Types.ObjectId(originalPaymentId)
                });

                if (existingRefund) {
                    return res.status(400).json({
                        success: false,
                        message: 'A refund has already been processed for this payment'
                    });
                }

                // Validate refund amount
                if (amount > originalPayment.amount) {
                    return res.status(400).json({
                        success: false,
                        message: 'Refund amount cannot exceed original payment amount'
                    });
                }
            } else {
                console.log('Processing admin override refund, skipping payment validation');
            }
        }

        // Create and save the transaction
        const transaction = new BudgetTransaction({
            teacherId,
            teacherName,
            vacancyId,
            vacancyTitle,
            applicationId: applicationId || undefined,
            amount,
            type,
            status: status || (type === 'payment' ? 'paid' : 'refunded'),
            remainingAmount: status === 'partial' ? remainingAmount : 0,
            dueDate: status === 'partial' ? new Date(dueDate) : undefined,
            reason,
            originalPaymentId: type === 'refund' && !isAdminOverride ? originalPaymentId : undefined,
            isAdminOverride: isAdminOverride || false,
            date: req.body.date ? new Date(req.body.date) : new Date()
        });

        await transaction.save();

        res.status(201).json({
            success: true,
            message: type === 'refund' 
                ? 'Refund recorded successfully' 
                : (status === 'partial' ? 'Partial payment recorded successfully' : 'Payment recorded successfully'),
            data: transaction
        });

    } catch (error) {
        console.error('Error saving budget transaction:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save budget transaction'
        });
    }
};

// Get transaction statistics
exports.getBudgetStats = async (req, res) => {
    try {
        const [payments, refunds] = await Promise.all([
            BudgetTransaction.aggregate([
                { $match: { type: 'payment' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            BudgetTransaction.aggregate([
                { $match: { type: 'refund' } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        const totalPayments = payments[0]?.total || 0;
        const totalRefunds = refunds[0]?.total || 0;
        const netAmount = totalPayments - totalRefunds;

        res.status(200).json({
            success: true,
            data: {
                totalPayments,
                totalRefunds,
                netAmount
            }
        });
    } catch (error) {
        console.error('Error fetching budget statistics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch budget statistics'
        });
    }
};

// Update budget transaction status
exports.updateBudgetTransactionStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status || status !== 'paid') { // Only allow updating to 'paid' for now
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status provided. Only "paid" is allowed.' 
            });
        }

        const transaction = await BudgetTransaction.findById(id);

        if (!transaction) {
            return res.status(404).json({ 
                success: false, 
                message: 'Budget transaction not found' 
            });
        }

        // Only update if current status is partial
        if (transaction.status !== 'partial') {
             return res.status(400).json({ 
                success: false, 
                message: 'Transaction status is not partial, cannot mark as paid.'
            });
        }

        // Update status and remaining amount
        transaction.status = 'paid';
        transaction.remainingAmount = 0;
        transaction.dueDate = undefined; // Clear due date when paid

        await transaction.save();

        res.status(200).json({
            success: true,
            message: 'Transaction status updated to paid',
            data: transaction
        });

    } catch (error) {
        console.error('Error updating budget transaction status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update budget transaction status'
        });
    }
}; 
