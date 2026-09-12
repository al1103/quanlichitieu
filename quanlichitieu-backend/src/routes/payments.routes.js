/**
 * Route công khai cho webhook của cổng thanh toán (MoMo IPN).
 * PUBLIC: MoMo server gọi trực tiếp nên KHÔNG yêu cầu JWT của ta —
 * tính xác thực được đảm bảo bằng chữ ký HMAC SHA256 trong payload.
 */
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');

router.post('/momo/ipn', paymentController.momoIpn);

module.exports = router;
