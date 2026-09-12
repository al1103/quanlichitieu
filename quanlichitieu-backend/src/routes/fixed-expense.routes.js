const express = require('express');
const router = express.Router();
const fixedExpenseController = require('../controllers/fixed-expense.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.route('/')
  .get(fixedExpenseController.getFixedExpenses)
  .post(fixedExpenseController.createFixedExpense);

router.route('/:id')
  .put(fixedExpenseController.updateFixedExpense)
  .delete(fixedExpenseController.deleteFixedExpense);

module.exports = router;
