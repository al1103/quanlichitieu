/**
 * Xác thực & hồ sơ cá nhân & Ví tiền - Gói tài khoản:
 * - register / login : trả về { token, user } để Frontend lưu vào localStorage
 * - me               : thông tin user đang đăng nhập
 * - updateProfile    : cập nhật tên / email / tiểu sử / ảnh đại diện
 * - changePassword   : đổi mật khẩu (cần mật khẩu cũ)
 *
 * LUỒNG NẠP TIỀN -> TỰ ĐỘNG NÂNG CẤP GÓI PREMIUM (AI chỉ dành cho Premium):
 * - GET  /wallet         : số dư ví + giá gói Premium + lịch sử biến động
 * - POST /wallet/deposit : nạp tiền vào ví (cổng thanh toán mô phỏng)
 * - POST /upgrade        : TRỪ TIỀN TRONG VÍ -> tự động bật gói PREMIUM
 * - POST /downgrade      : hạ về gói Free (không hoàn tiền)
 */
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { ApiError, asyncHandler, assert, requireFields, sanitizeUser, toNumber, EMAIL_RE } = require('../utils/helpers');
const { PREMIUM_PRICE } = require('../config/premium');

const signToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });

// Định dạng tiền Việt cho thông báo lỗi thân thiện: 99000 -> "99.000"
const fmtVnd = (n) => new Intl.NumberFormat('vi-VN').format(n);

// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = req.body.password;
  const name = String(req.body.name || '').trim() || null;

  requireFields({ email, password }, ['email', 'password']);
  assert(EMAIL_RE.test(email), 400, 'Email không hợp lệ.');
  assert(typeof password === 'string' && password.length >= 6, 400, 'Mật khẩu phải có ít nhất 6 ký tự.');

  // 1. Kiểm tra email đã tồn tại chưa
  const existingUser = await prisma.user.findUnique({ where: { email } });
  assert(!existingUser, 400, 'Email đã được sử dụng.');

  // 2. Mã hóa mật khẩu (Không bao giờ lưu mật khẩu gốc)
  const hashedPassword = await bcrypt.hash(password, 10);

  // 3. Tạo user mới (gói mặc định FREE, ví rỗng) và cấp token luôn
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name },
  });
  const token = signToken(user.id);

  res.status(201).json({
    message: 'Đăng ký thành công!',
    token,
    user: sanitizeUser(user),
  });
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  requireFields({ email, password }, ['email', 'password']);

  // 1. Tìm user theo email
  const user = await prisma.user.findUnique({ where: { email } });
  assert(user, 404, 'Không tìm thấy tài khoản.');

  // 2. Tài khoản bị admin khóa thì chặn đăng nhập
  assert(user.status !== 'BLOCKED', 403, 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.');

  // 3. Kiểm tra mật khẩu
  const isMatch = await bcrypt.compare(password, user.password);
  assert(isMatch, 401, 'Sai mật khẩu.');

  // 4. Cấp token (Giấy thông hành)
  const token = signToken(user.id);

  res.json({
    message: 'Đăng nhập thành công',
    token,
    user: sanitizeUser(user),
  });
});

exports.logout = asyncHandler(async (req, res) => {
  res.json({ message: 'Đăng xuất thành công' });
});

// GET /api/auth/me
exports.me = asyncHandler(async (req, res) => {
  res.json(sanitizeUser(req.user));
});

// PUT /api/auth/profile
exports.updateProfile = asyncHandler(async (req, res) => {
  const data = {};

  if (req.body.name !== undefined) {
    data.name = String(req.body.name).trim() || null;
  }
  if (req.body.bio !== undefined) {
    data.bio = String(req.body.bio).trim() || null;
  }
  if (req.body.avatar !== undefined) {
    data.avatar = String(req.body.avatar).trim() || null;
  }
  if (req.body.email !== undefined && req.body.email !== '') {
    const email = String(req.body.email).trim().toLowerCase();
    assert(EMAIL_RE.test(email), 400, 'Email không hợp lệ.');
    if (email !== req.user.email) {
      const existingUser = await prisma.user.findUnique({ where: { email } });
      assert(!existingUser, 400, 'Email đã được sử dụng bởi tài khoản khác.');
      data.email = email;
    }
  }

  assert(Object.keys(data).length > 0, 400, 'Không có dữ liệu nào để cập nhật.');

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data,
  });

  res.json({ message: 'Cập nhật hồ sơ thành công.', user: sanitizeUser(updated) });
});

// PUT /api/auth/password
exports.changePassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  requireFields({ oldPassword, newPassword }, ['oldPassword', 'newPassword']);
  assert(typeof newPassword === 'string' && newPassword.length >= 6, 400, 'Mật khẩu mới phải có ít nhất 6 ký tự.');

  const isMatch = await bcrypt.compare(oldPassword, req.user.password);
  assert(isMatch, 401, 'Mật khẩu cũ không đúng.');

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: req.userId },
    data: { password: hashedPassword },
  });

  res.json({ message: 'Đổi mật khẩu thành công.' });
});

// ============================================================
// VÍ TIỀN & NÂNG CẤP GÓI PREMIUM (tự động sau khi trừ tiền)
// ============================================================

// GET /api/auth/wallet  — số dư + giá gói + lịch sử biến động + đơn nạp tiền gần nhất
exports.getWallet = asyncHandler(async (req, res) => {
  const [logs, orders] = await Promise.all([
    prisma.walletLog.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.paymentOrder.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  res.json({
    balance: req.user.walletBalance || 0,
    plan: req.user.plan,
    premiumPrice: PREMIUM_PRICE,
    logs,
    orders, // Các đơn thanh toán nạp tiền (PENDING/PAID/CANCELLED/EXPIRED)
  });
});

// POST /api/auth/upgrade
// NÂNG CẤP TỰ ĐỘNG: nếu ví đủ tiền -> trừ tiền gói Premium và bật gói ngay.
exports.upgradePlan = asyncHandler(async (req, res) => {
  assert(req.user.plan !== 'PREMIUM', 400, 'Bạn đã đang dùng gói Premium.');
  if (req.user.walletBalance < PREMIUM_PRICE) {
    // FE dựa vào code này để hiện hộp "Nạp thêm tiền"
    const err = new ApiError(
      400,
      `Số dư ví không đủ. Gói Premium giá ${fmtVnd(PREMIUM_PRICE)}₫, ví của bạn còn ${fmtVnd(req.user.walletBalance)}₫. Vui lòng nạp thêm ${fmtVnd(PREMIUM_PRICE - req.user.walletBalance)}₫.`
    );
    err.code = 'INSUFFICIENT_BALANCE';
    throw err;
  }

  // Trừ tiền + bật gói + ghi lịch sử trong 1 transaction (hoặc tất cả, hoặc không gì cả)
  const result = await prisma.$transaction(async (db) => {
    const updated = await db.user.update({
      where: { id: req.userId },
      data: {
        plan: 'PREMIUM',
        walletBalance: { decrement: PREMIUM_PRICE },
      },
    });
    await db.walletLog.create({
      data: {
        userId: req.userId,
        type: 'PAY_PREMIUM',
        amount: PREMIUM_PRICE,
        balanceAfter: updated.walletBalance,
        note: 'Thanh toán gói Premium (tự động nâng cấp)',
      },
    });
    return updated;
  });

  res.json({
    message: `Thanh toán thành công ${fmtVnd(PREMIUM_PRICE)}₫. Chúc mừng bạn đã nâng cấp gói Premium - trợ lý AI đã được mở khoá!`,
    plan: result.plan,
    balance: result.walletBalance,
    user: sanitizeUser(result),
  });
});

// POST /api/auth/downgrade  — hạ về Free (không hoàn tiền đã thanh toán)
exports.downgradePlan = asyncHandler(async (req, res) => {
  assert(req.user.plan !== 'FREE', 400, 'Bạn đang dùng gói Free.');

  const updated = await prisma.user.update({
    where: { id: req.userId },
    data: { plan: 'FREE' },
  });

  res.json({
    message: 'Đã chuyển về gói Free. Số dư ví được giữ nguyên.',
    plan: updated.plan,
    balance: updated.walletBalance,
    user: sanitizeUser(updated),
  });
});
