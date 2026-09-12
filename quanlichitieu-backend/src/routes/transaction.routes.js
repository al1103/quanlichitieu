const express = require('express');
const router = express.Router();
const txController = require('../controllers/transaction.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Các đường dẫn này bắt buộc phải đi qua "cửa ải" verifyToken
router.get('/', verifyToken, txController.getTransactions);
router.post('/', verifyToken, txController.createTransaction);
router.get('/:id', verifyToken, txController.getTransactionById);
router.put('/:id', verifyToken, txController.updateTransaction);
router.delete('/:id', verifyToken, txController.deleteTransaction);

module.exports = router;
