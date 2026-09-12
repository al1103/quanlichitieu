/**
 * Script tạo dữ liệu mẫu (seed):
 * - 6 danh mục mặc định khớp với Frontend
 * - Cấu hình mặc định cho AI
 * - Tài khoản ADMIN:  admin@chilotus.com  / admin123
 * - Tài khoản DEMO:   intern@chilotus.com / 123456  (chính là tài khoản
 *   đang được điền sẵn trong trang login.html của FE, kèm ~5 tháng giao dịch,
 *   ngân sách và mục tiêu tiết kiệm mẫu)
 *
 * Chạy: npm run db:seed   (chạy được nhiều lần, không bị trùng dữ liệu)
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const CATEGORIES = [
  { name: 'Ăn uống', icon: 'utensils', color: '#f97316', type: 'CHI' },
  { name: 'Mua sắm', icon: 'shopping-bag', color: '#3b82f6', type: 'CHI' },
  { name: 'Di chuyển', icon: 'car', color: '#eab308', type: 'CHI' },
  { name: 'Giải trí', icon: 'film', color: '#a855f7', type: 'CHI' },
  { name: 'Lương', icon: 'banknote', color: '#10b981', type: 'THU' },
  { name: 'Khác', icon: 'more-horizontal', color: '#64748b', type: 'BOTH' },
];

const pad2 = (n) => String(n).padStart(2, '0');

// Tạo ngày UTC từ (số tháng lùi lại, ngày trong tháng)
function dateMonthsAgo(monthsBack, day) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, day, 12, 0, 0));
}

// Khuôn mẫu chi tiêu 1 tháng: [ngày, danh mục, mô tả, số tiền]
const MONTHLY_EXPENSE_TEMPLATE = [
  [2, 'Ăn uống', 'Ăn trưa Burger King', 85000],
  [4, 'Di chuyển', 'Xăng xe', 120000],
  [6, 'Mua sắm', 'Mua áo mới', 350000],
  [8, 'Giải trí', 'Xem phim CGV', 180000],
  [10, 'Ăn uống', 'Đi ăn lẩu với nhóm bạn', 420000],
  [12, 'Di chuyển', 'Grab đi làm', 96000],
  [14, 'Mua sắm', 'Sữa tắm, dầu gội', 210000],
  [16, 'Ăn uống', 'Cà phê cuối tuần', 145000],
  [18, 'Giải trí', 'Đăng ký gym', 500000],
  [20, 'Ăn uống', 'Đi siêu thị mua đồ ăn', 680000],
  [23, 'Di chuyển', 'Rửa xe + bảo dưỡng', 150000],
  [26, 'Khác', 'Quà tặng sinh nhật bạn', 250000],
  [28, 'Mua sắm', 'Mua sách', 175000],
];

async function seedCategories() {
  for (const c of CATEGORIES) {
    await prisma.category.upsert({ where: { name: c.name }, update: {}, create: c });
  }
}

async function seedSettings() {
  await prisma.appSetting.upsert({
    where: { key: 'ai_daily_quota' },
    update: {},
    create: { key: 'ai_daily_quota', value: '50' },
  });
}

async function upsertUser(email, password, name, role) {
  const hashed = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: {}, // Không đè dữ liệu cũ khi chạy lại
    create: { email, password: hashed, name, role, plan: 'PREMIUM' }, // Tài khoản mẫu dùng thử AI luôn
  });
}

async function seedDemoData(user) {
  const txCount = await prisma.transaction.count({ where: { userId: user.id } });
  if (txCount > 0) return; // Đã có dữ liệu mẫu thì bỏ qua

  // ~5 tháng gần nhất: lương ngày 1 + chi tiêu theo khuôn mẫu
  const txData = [];
  for (let monthsBack = 4; monthsBack >= 0; monthsBack--) {
    txData.push({
      userId: user.id,
      type: 'THU',
      category: 'Lương',
      description: `Lương tháng ${pad2(((new Date().getUTCMonth() - monthsBack + 12) % 12) + 1)}`,
      amount: 15000000,
      date: dateMonthsAgo(monthsBack, 1),
    });
    for (const [day, category, description, amount] of MONTHLY_EXPENSE_TEMPLATE) {
      txData.push({
        userId: user.id,
        type: 'CHI',
        category,
        description,
        amount,
        date: dateMonthsAgo(monthsBack, day),
      });
    }
  }
  await prisma.transaction.createMany({ data: txData });

  // Ngân sách cho tháng hiện tại (kèm 1 mục đang vượt mức để thấy cảnh báo)
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`;
  await prisma.budget.createMany({
    data: [
      { userId: user.id, category: 'Ăn uống', limitAmount: 2000000, month },
      { userId: user.id, category: 'Mua sắm', limitAmount: 800000, month },
      { userId: user.id, category: 'Giải trí', limitAmount: 900000, month },
      { userId: user.id, category: 'Di chuyển', limitAmount: 500000, month },
    ],
  });

  // Mục tiêu tiết kiệm giống trang savings.html của FE
  await prisma.savingsGoal.createMany({
    data: [
      {
        userId: user.id,
        name: 'Mua Laptop mới',
        targetAmount: 20000000,
        currentAmount: 12000000,
        monthlyContribution: 2000000,
        deadline: new Date(Date.UTC(now.getUTCFullYear(), 11, 31)),
      },
      {
        userId: user.id,
        name: 'Quỹ khẩn cấp',
        targetAmount: 15000000,
        currentAmount: 5000000,
        monthlyContribution: 1500000,
      },
      {
        userId: user.id,
        name: 'Du lịch cuối năm',
        targetAmount: 10000000,
        currentAmount: 3500000,
        monthlyContribution: 1000000,
        deadline: new Date(Date.UTC(now.getUTCFullYear(), 11, 15)),
      },
    ],
  });
}

async function main() {
  console.log('🌱 Bắt đầu seed dữ liệu...');

  await seedCategories();
  console.log('✅ Danh mục mặc định: OK');

  await seedSettings();
  console.log('✅ Cấu hình AI mặc định: OK');

  const admin = await upsertUser('admin@chilotus.com', 'admin123', 'Quản trị viên', 'ADMIN');
  console.log(`✅ Tài khoản ADMIN: ${admin.email} / admin123`);

  const intern = await upsertUser('intern@chilotus.com', '123456', 'Nguyễn Văn An', 'USER');
  console.log(`✅ Tài khoản DEMO:  ${intern.email} / 123456`);

  await seedDemoData(intern);
  console.log('✅ Dữ liệu mẫu (giao dịch, ngân sách, tiết kiệm): OK');

  console.log('🎉 Seed hoàn tất!');
}

main()
  .catch((err) => {
    console.error('❌ Seed thất bại:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
