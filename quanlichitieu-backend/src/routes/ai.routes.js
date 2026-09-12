const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Giữ nguyên đường dẫn phẳng mà Frontend đang gọi: /api/ai-insights và /api/ai-chat
router.post('/ai-insights', verifyToken, aiController.getInsights);
router.post('/ai-chat', verifyToken, aiController.chat);

module.exports = router;
