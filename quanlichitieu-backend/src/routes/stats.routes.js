const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.use(verifyToken);

router.get('/summary', statsController.getSummary);
router.get('/monthly', statsController.getMonthlyTrend);
router.get('/categories', statsController.getCategoryBreakdown);
router.get('/trend', statsController.getDailyTrend);

module.exports = router;
