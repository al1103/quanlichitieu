/**
 * CỔNG THANH TOÁN NẠP TIỀN (mô phỏng gateway thật - có quy trình đầy đủ):
 *
 * 1. POST /api/auth/wallet/checkout                    : tạo đơn hàng PENDING (hạn 15 phút)
 *    body: { amount, method: 'BANK'|'CARD'|'MOMO' }
 *    -> trả mã đơn + hướng dẫn thanh toán theo phương thức
 *
 * 2. POST /api/auth/wallet/checkout/:orderCode/confirm : xác nhận đã thanh toán
 *    - BANK : { confirmed: true }                       (khách bấm "Tôi đã chuyển khoản")
 *    - MOMO : { confirmed: true }                       (khách xác nhận trên app ví)
 *    - CARD : { cardNumber, cardName, expiry, otp }     (thông tin thẻ + mã OTP)
 *    -> đơn chuyển PAID, tiền được cộng vào ví + ghi lịch sử (1 transaction)
 *
 * 3. POST /api/auth/wallet/checkout/:orderCode/cancel  : huỷ đơn đang chờ
 * 4. GET  /api/auth/wallet/orders                      : lịch sử các đơn nạp tiền
 *
 * Đơn không thanh toán trước hạn sẽ tự coi là EXPIRED khi có tương tác.
 */
const prisma = require('../config/db');
const { ApiError, asyncHandler, assert, requireFields, toNumber } = require('../utils/helpers');
const { SUPPORTED_METHODS, PAYMENT_INFO, ORDER_TTL_MINUTES, generateOrderCode } = require('../config/payments');

const fmtVnd = (n) => new Intl.NumberFormat('vi-VN').format(n);

// Tìm đơn thuộc về chính người dùng này (bảo mật sở hữu)
async function findOwnOrder(orderCode, userId) {
  const order = await prisma.paymentOrder.findUnique({ where: { orderCode } });
  if (!order || order.userId !== userId) return null;
  return order;
}

// IPN từ MoMo KHÔNG mang JWT của ta — tính xác thực được chứng minh bằng chữ ký
// HMAC nên tìm đơn theo mã mà không cần lọc theo user
async function findOrderByCodeAnyUser(orderCode) {
  return prisma.paymentOrder.findUnique({ where: { orderCode } });
}

// Đơn quá hạn mà vẫn PENDING -> cập nhật EXPIRED (lazy expiry)
async function expireIfNeeded(order) {
  if (order.status === 'PENDING' && order.expiresAt < new Date()) {
    await prisma.paymentOrder.update({
      where: { id: order.id },
      data: { status: 'EXPIRED' },
    });
    return { ...order, status: 'EXPIRED' };
  }
  return order;
}

// POST /api/auth/wallet/checkout
exports.createCheckout = asyncHandler(async (req, res) => {
  requireFields(req.body, ['amount', 'method']);
  const amount = toNumber(req.body.amount);
  const method = String(req.body.method).toUpperCase();

  assert(Number.isFinite(amount) && amount > 0, 400, 'Số tiền nạp phải là số lớn hơn 0.');
  assert(amount <= 100_000_000, 400, 'Mỗi lần chỉ nạp tối đa 100.000.000₫.');
  assert(SUPPORTED_METHODS.includes(method), 400, `Phương thức thanh toán phải là một trong: ${SUPPORTED_METHODS.join(', ')}.`);

  const expiresAt = new Date(Date.now() + ORDER_TTL_MINUTES * 60 * 1000);
  const order = await prisma.paymentOrder.create({
    data: {
      userId: req.userId,
      orderCode: generateOrderCode(),
      amount,
      method,
      expiresAt,
    },
  });

  // Hướng dẫn thanh toán theo phương thức để FE hiển thị bước tiếp theo
  let instructions;
  if (method === 'BANK') {
    const info = PAYMENT_INFO.BANK;
    instructions = {
      ...info,
      amount,
      content: `NAP ${order.orderCode}`,
      note: `Chuyển khoản đúng số tiền và NỘI DUNG bên trên để hệ thống đối soát.`,
    };
  } else if (method === 'MOMO') {
    instructions = { ...PAYMENT_INFO.MOMO, amount, content: order.orderCode };
  } else {
    instructions = { ...PAYMENT_INFO.CARD, amount };
  }

  res.status(201).json({
    message: 'Đã tạo đơn thanh toán. Vui lòng hoàn tất trong thời hạn của đơn.',
    order: {
      orderCode: order.orderCode,
      amount: order.amount,
      method: order.method,
      status: order.status,
      expiresAt: order.expiresAt,
    },
    instructions,
  });
});

// POST /api/auth/wallet/checkout/:orderCode/confirm
exports.confirmCheckout = asyncHandler(async (req, res) => {
  const order = await findOwnOrder(req.params.orderCode, req.userId);
  assert(order, 404, 'Không tìm thấy đơn thanh toán.');

  // Đơn hết hạn -> đánh dấu EXPIRED rồi từ chối
  const fresh = await expireIfNeeded(order);
  assert(fresh.status !== 'EXPIRED', 400, 'Đơn thanh toán đã hết hạn. Vui lòng tạo đơn mới.');

  // Chỉ đơn PENDING mới được xử lý
  assert(fresh.status === 'PENDING', 400, `Đơn này đã được xử lý (trạng thái: ${fresh.status}).`);

  // ---- Kiểm tra thông tin thanh toán theo từng phương thức ----
  const method = fresh.method;
  if (method === 'BANK' || method === 'MOMO') {
    assert(req.body.confirmed === true, 400,
      method === 'BANK'
        ? 'Vui lòng chuyển khoản xong rồi bấm "Tôi đã chuyển khoản".'
        : 'Vui lòng xác nhận thanh toán trên ứng dụng ví điện tử.');
  } else if (method === 'CARD') {
    const cardNumber = String(req.body.cardNumber || '').replace(/\s/g, '');
    const cardName = String(req.body.cardName || '').trim();
    const expiry = String(req.body.expiry || '').trim();
    const otp = String(req.body.otp || '').trim();

    assert(/^\d{16}$/.test(cardNumber), 400, 'Số thẻ phải gồm 16 chữ số.');
    assert(cardName.length >= 3, 400, 'Vui lòng nhập tên chủ thẻ in trên thẻ.');
    assert(/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry), 400, 'Hạn thẻ phải theo định dạng MM/YY.');
    assert(/^\d{6}$/.test(otp), 400, 'Mã OTP phải gồm 6 chữ số.');
  }

  // ---- Gateway "xác nhận thành công": cộng tiền + ghi sổ trong 1 transaction ----
  const result = await prisma.$transaction(async (db) => {
    // updateMany kèm điều kiện status=PENDING để chống double-confirm song song
    const marked = await db.paymentOrder.updateMany({
      where: { id: fresh.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });

    const updatedUser = await db.user.update({
      where: { id: req.userId },
      data: { walletBalance: { increment: fresh.amount } },
    });

    await db.walletLog.create({
      data: {
        userId: req.userId,
        type: 'DEPOSIT',
        amount: fresh.amount,
        balanceAfter: updatedUser.walletBalance,
        note: `Nạp tiền qua ${PAYMENT_INFO[method]?.label || method} - đơn ${fresh.orderCode}`,
      },
    });

    return updatedUser;
  });

  res.json({
    message: `Thanh toán thành công! Đã nạp ${fmtVnd(fresh.amount)}₫ vào ví.`,
    orderCode: fresh.orderCode,
    balance: result.walletBalance,
  });
});

// POST /api/auth/wallet/checkout/:orderCode/cancel
exports.cancelCheckout = asyncHandler(async (req, res) => {
  const order = await findOwnOrder(req.params.orderCode, req.userId);
  assert(order, 404, 'Không tìm thấy đơn thanh toán.');

  assert(order.status === 'PENDING', 400, 'Chỉ có thể huỷ đơn đang chờ thanh toán.');

  await prisma.paymentOrder.update({
    where: { id: order.id },
    data: { status: 'CANCELLED' },
  });

  res.json({ message: `Đã huỷ đơn ${order.orderCode}.` });
});

// GET /api/auth/wallet/orders — lịch sử đơn nạp tiền gần nhất
exports.listOrders = asyncHandler(async (req, res) => {
  const orders = await prisma.paymentOrder.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  res.json(orders);
});

// ==========================================================================
// MOMO PRODUCTION WEBHOOK (IPN - server to server)
//
// Lên production thật thì KHÔNG dùng nút "Tôi đã xác nhận" nữa. Luồng thật:
//   1. BE gọi POST /v2/gateway/api/create (kèm chữ ký HMAC SHA256 bằng secretKey)
//      -> MoMo trả về payUrl/deeplink/QR cho khách chuyển tới
//   2. Khách trả tiền BẰNG TIỀN THẬT trong app MoMo
//   3. MoMo gọi ngược ipnUrl (endpoint bên dưới) kèm kết quả + chữ ký
//   4. BE XÁC MINH CHỮ KÝ + số tiền -> mới được cộng ví (idempotent)
//
// Endpoint này PHẢI công khai (MoMo server gọi, không có JWT của ta),
// nhưng được bảo vệ bởi chữ ký HMAC SHA256 theo spec của MoMo.
// Chỉ kích hoạt khi đã cấu hình MOMO_PARTNER_CODE + MOMO_SECRET_KEY trong .env;
// chưa cấu hình thì trả 501 để rõ ràng là đang chạy chế độ demo.
// ==========================================================================
const crypto = require('crypto');

// POST /api/payments/momo/ipn
exports.momoIpn = asyncHandler(async (req, res) => {
  const partnerCode = process.env.MOMO_PARTNER_CODE;
  const secretKey = process.env.MOMO_SECRET_KEY;

  // Chưa đăng ký dịch vụ MoMo -> đang là chế độ demo
  if (!partnerCode || !secretKey) {
    return res.status(501).json({
      resultCode: 1,
      message: 'Server đang chạy chế độ DEMO. Cấu hình MOMO_PARTNER_CODE/MOMO_SECRET_KEY để nhận thanh toán MoMo thật.',
    });
  }

  const {
    partnerCode: pc, orderId, requestId, amount, transId,
    payType, orderType, orderInfo, message, responseTime,
    extraData, resultCode, signature,
  } = req.body || {};

  // 1. Xác minh chữ ký theo đúng thứ tự trường MoMo quy định (spec v2)
  const rawSignature =
    `accessKey=${process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85'}` +
    `&amount=${amount}&extraData=${extraData || ''}&message=${message || ''}` +
    `&orderId=${orderId}&orderInfo=${orderInfo || ''}&orderType=${orderType || ''}` +
    `&partnerCode=${pc}&payType=${payType || ''}&requestId=${requestId}` +
    `&responseTime=${responseTime || ''}&resultCode=${resultCode}&transId=${transId || ''}`;
  const expectedSignature = crypto
    .createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');

  assert(signature && expectedSignature === signature, 400, 'Chữ ký IPN không hợp lệ.');

  // 2. Tìm đơn theo mã ta gửi sang lúc tạo (orderId = orderCode)
  const order = await findOrderByCodeAnyUser(orderId);
  assert(order, 404, 'Không tìm thấy đơn tương ứng.');

  // 3. Idempotent: IPN có thể bị gọi lặp nhiều lần
  if (order.status === 'PAID') {
    return res.json({ resultCode: 0, message: 'Đơn đã xử lý trước đó.' });
  }
  assert(order.status === 'PENDING', 400, `Đơn ở trạng thái ${order.status}, không thể xử lý.`);

  // 4. Số tiền MoMo thu phải khớp đơn
  assert(Number(amount) === order.amount, 400, 'Số tiền thanh toán không khớp đơn hàng.');

  // 5. resultCode = 0 nghĩa là giao dịch thành công -> cộng ví
  assert(Number(resultCode) === 0, 400, `Giao dịch MoMo thất bại: ${message || resultCode}`);

  await prisma.$transaction(async (db) => {
    const marked = await db.paymentOrder.updateMany({
      where: { id: order.id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (marked.count === 0) return; // request song song đã xử lý trước đó

    const updatedUser = await db.user.update({
      where: { id: order.userId },
      data: { walletBalance: { increment: order.amount } },
    });
    await db.walletLog.create({
      data: {
        userId: order.userId,
        type: 'DEPOSIT',
        amount: order.amount,
        balanceAfter: updatedUser.walletBalance,
        note: `Nạp tiền qua MoMo (IPN) - đơn ${order.orderCode}`,
      },
    });
  });

  // Trả format MoMo mong đợi để họ ngừng retry
  res.json({ partnerCode: pc, orderId, requestId, resultCode: 0, message: 'Success' });
});
