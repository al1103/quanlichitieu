const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// Các đường dẫn công khai
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', verifyToken, authController.logout);

// Đường dẫn cần đăng nhập
router.get('/me', verifyToken, authController.me);
router.put('/profile', verifyToken, authController.updateProfile);
router.put('/password', verifyToken, authController.changePassword);

// Ví tiền & nâng cấp gói Premium
// Nạp tiền phải qua CỔNG THANH TOÁN có quy trình:
//   tạo đơn -> chuyển khoản/thẻ+OTP/ví -> xác nhận -> tiền mới về ví
router.get('/wallet', verifyToken, authController.getWallet);
const paymentController = require('../controllers/payment.controller');
router.post('/wallet/checkout', verifyToken, paymentController.createCheckout);
router.post('/wallet/checkout/:orderCode/confirm', verifyToken, paymentController.confirmCheckout);
router.post('/wallet/checkout/:orderCode/cancel', verifyToken, paymentController.cancelCheckout);
router.get('/wallet/orders', verifyToken, paymentController.listOrders);

router.post('/upgrade', verifyToken, authController.upgradePlan);
router.post('/downgrade', verifyToken, authController.downgradePlan);

module.exports = router;
