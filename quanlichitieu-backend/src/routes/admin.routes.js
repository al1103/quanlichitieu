const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, requireAdmin } = require('../middleware/auth.middleware');

// Mọi API admin đều cần: đăng nhập + quyền ADMIN
router.use(verifyToken, requireAdmin);

router.get('/users', adminController.getUsers);
router.put('/users/:id/status', adminController.setUserStatus);
router.put('/users/:id/plan', adminController.setUserPlan);

router.get('/stats', adminController.getStats);

router.get('/categories', adminController.getCategories);
router.post('/categories', adminController.createCategory);
router.put('/categories/:id', adminController.updateCategory);
router.delete('/categories/:id', adminController.deleteCategory);

router.get('/ai-settings', adminController.getAiSettings);
router.put('/ai-settings', adminController.updateAiSettings);

module.exports = router;
