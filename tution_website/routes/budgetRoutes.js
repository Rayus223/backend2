const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const auth = require('../middleware/auth');

// All routes require authentication
router.use(auth);

// Get all budget transactions
router.get('/transactions', budgetController.getBudgetTransactions);

// Save a new budget transaction
router.post('/transactions', budgetController.saveBudgetTransaction);

// Update transaction status (e.g., mark partial as paid)
router.put('/transactions/:id/status', budgetController.updateBudgetTransactionStatus);

// Get budget statistics
router.get('/stats', budgetController.getBudgetStats);

module.exports = router; 