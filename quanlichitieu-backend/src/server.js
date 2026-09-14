require('dotenv').config();
const app = require('./app');
const fs = require('fs');
const path = require('path');
const scheduleFixedExpenses = require('./cron/fixed-expense.cron');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📚 API docs: xem README.md | Ví dụ: http://localhost:${PORT}/api/auth/login`);

  // Bắt đầu cron job
  scheduleFixedExpenses();

  const frontendPath =
    process.env.FRONTEND_PATH && process.env.FRONTEND_PATH.trim() !== ''
      ? path.resolve(process.env.FRONTEND_PATH)
      : path.join(__dirname, '..', '..', 'quanlichitieu');
  if (fs.existsSync(path.join(frontendPath, 'index.html'))) {
    console.log(`🖥️  Frontend được phục vụ tại: http://localhost:${PORT} (thư mục: ${frontendPath})`);
  }
});
