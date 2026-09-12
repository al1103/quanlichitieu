const express = require('express');
const router = express.Router();
const savingController = require('../controllers/saving.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/', savingController.getSavingsGoals);
router.post('/', savingController.createSavingsGoal);
router.post('/:id/deposit', savingController.depositToGoal);
router.put('/:id', savingController.updateSavingsGoal);
router.delete('/:id', savingController.deleteSavingsGoal);

module.exports = router;
