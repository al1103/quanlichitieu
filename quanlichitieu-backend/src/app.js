const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const authRoutes = require('./routes/auth.routes');
const transactionRoutes = require('./routes/transaction.routes');
const budgetRoutes = require('./routes/budget.routes');
const savingRoutes = require('./routes/saving.routes');
const categoryRoutes = require('./routes/category.routes');
const statsRoutes = require('./routes/stats.routes');
const aiRoutes = require('./routes/ai.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentsRoutes = require('./routes/payments.routes'); // Webhook cổng thanh toán (công khai)
const fixedExpenseRoutes = require('./routes/fixed-expense.routes');
const notificationRoutes = require('./routes/notification.routes');
const { notFoundHandler, errorHandler } = require('./middleware/error.middleware');

const app = express();

// ============================================================
// Phục vụ luôn Frontend tĩnh (tuỳ chọn):
// Nếu thư mục frontend tồn tại thì mở http://localhost:<PORT>
// là chạy được cả giao diện + API trên cùng một server,
// nhờ vậy FE gọi fetch() tương đối (/api/...) không cần lo CORS.
// Cấu hình qua biến FRONTEND_PATH trong .env nếu muốn đổi.
// ============================================================
const frontendPath =
  process.env.FRONTEND_PATH && process.env.FRONTEND_PATH.trim() !== ''
    ? path.resolve(process.env.FRONTEND_PATH)
    : path.join(__dirname, '..', '..', 'quanlichitieu');
const hasFrontend = fs.existsSync(path.join(frontendPath, 'index.html'));

// Middleware
app.use(cors()); // Cho phép Frontend gọi API (dev: mọi origin)
app.use(express.json({ limit: '1mb' })); // Đọc data JSON từ Frontend gửi lên

// Route gốc: có frontend -> trả trang chủ app; không thì trả lời chào API
app.get('/', (req, res) => {
  if (hasFrontend) {
    return res.sendFile(path.join(frontendPath, 'index.html'));
  }
  res.json({
    message: 'Welcome to ChiLotus API!',
    docs: 'Xem README.md để biết danh sách API đầy đủ.',
  });
});

// Đăng ký toàn bộ nhóm API
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/savings', savingRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/fixed-expenses', fixedExpenseRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payments', paymentsRoutes); // IPN MoMo: public, xác thực bằng chữ ký HMAC
app.use('/api', aiRoutes); // /api/ai-insights + /api/ai-chat (giữ nguyên như FE đang gọi)

// 404 cho các đường dẫn /api/* không tồn tại
app.use('/api', notFoundHandler);

if (hasFrontend) {
  app.use(express.static(frontendPath));
  // Các đường dẫn không phải /api và không trùng file tĩnh -> trả trang chủ
  app.get(/^\/(?!api(\/|$)).*/, (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Xử lý lỗi tập trung - luôn đặt CUỐI CÙNG
app.use(errorHandler);

module.exports = app;
