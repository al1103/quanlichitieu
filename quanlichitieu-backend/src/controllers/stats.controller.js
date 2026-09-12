/**
 * Thống kê & báo cáo cho Dashboard + trang Reports:
 * - GET /api/stats/summary    : tổng quan (số dư, tổng thu/chi, tiết kiệm, tháng hiện tại)
 * - GET /api/stats/monthly    : thu/chi theo từng tháng (mặc định 6 tháng gần nhất)
 * - GET /api/stats/categories : tổng chi/thu theo danh mục + % đóng góp
 * - GET /api/stats/trend      : chuỗi dữ liệu theo NGÀY để vẽ biểu đồ đường
 */
const prisma = require('../config/db');
const { asyncHandler, assert, monthRange, currentMonth, monthKey, dayKeyOf } = require('../utils/helpers');

// GET /api/stats/summary
exports.getSummary = asyncHandler(async (req, res) => {
  const { start, end } = monthRange(currentMonth());

  const [incomeAgg, expenseAgg, savingsAgg, monthIncomeAgg, monthExpenseAgg, txCount] =
    await Promise.all([
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId: req.userId, type: 'THU' } }),
      prisma.transaction.aggregate({ _sum: { amount: true }, where: { userId: req.userId, type: 'CHI' } }),
      prisma.savingsGoal.aggregate({ _sum: { currentAmount: true }, where: { userId: req.userId } }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { userId: req.userId, type: 'THU', date: { gte: start, lt: end } },
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { userId: req.userId, type: 'CHI', date: { gte: start, lt: end } },
      }),
      prisma.transaction.count({ where: { userId: req.userId } }),
    ]);

  const totalIncome = incomeAgg._sum.amount || 0;
  const totalExpense = expenseAgg._sum.amount || 0;

  res.json({
    balance: totalIncome - totalExpense, // Số dư hiện tại
    totalIncome,
    totalExpense,
    totalSavings: savingsAgg._sum.currentAmount || 0,
    monthIncome: monthIncomeAgg._sum.amount || 0,
    monthExpense: monthExpenseAgg._sum.amount || 0,
    currentMonth: currentMonth(),
    transactionCount: txCount,
  });
});

// GET /api/stats/monthly?months=6
exports.getMonthlyTrend = asyncHandler(async (req, res) => {
  let months = parseInt(req.query.months, 10);
  if (!Number.isFinite(months)) months = 6;
  assert(months >= 1 && months <= 24, 400, "'months' phải nằm trong khoảng 1 đến 24.");

  // Danh sách các tháng cần thống kê (cũ -> mới)
  const buckets = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    buckets.push({ key: monthKey(d), start: d, end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) });
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      userId: req.userId,
      date: { gte: buckets[0].start, lt: buckets[buckets.length - 1].end },
    },
    select: { amount: true, type: true, date: true },
  });

  const map = Object.fromEntries(buckets.map((b) => [b.key, { month: b.key, thu: 0, chi: 0 }]));
  for (const tx of transactions) {
    const bucket = map[monthKey(tx.date)];
    if (!bucket) continue;
    if (tx.type === 'THU') bucket.thu += tx.amount;
    else bucket.chi += tx.amount;
  }

  res.json(buckets.map((b) => map[b.key]));
});

// GET /api/stats/categories?type=CHI&month=YYYY-MM|from=&to=
exports.getCategoryBreakdown = asyncHandler(async (req, res) => {
  const type = req.query.type || 'CHI';
  assert(['THU', 'CHI'].includes(type), 400, "Tham số 'type' chỉ nhận 'THU' hoặc 'CHI'.");

  const where = { userId: req.userId, type };
  if (req.query.month) {
    const { start, end } = monthRange(req.query.month);
    where.date = { gte: start, lt: end };
  } else if (req.query.from || req.query.to) {
    const { dateFilterFromQuery } = require('../utils/helpers');
    where.date = dateFilterFromQuery(req.query);
  }

  const rows = await prisma.transaction.groupBy({
    by: ['category'],
    where,
    _sum: { amount: true },
    orderBy: { _sum: { amount: 'desc' } },
  });

  const total = rows.reduce((sum, r) => sum + (r._sum.amount || 0), 0);

  res.json(
    rows.map((r) => ({
      category: r.category,
      total: r._sum.amount || 0,
      percentage: total > 0 ? Math.round(((r._sum.amount || 0) / total) * 1000) / 10 : 0,
    }))
  );
});

// GET /api/stats/trend?days=30
exports.getDailyTrend = asyncHandler(async (req, res) => {
  let days = parseInt(req.query.days, 10);
  if (!Number.isFinite(days)) days = 30;
  assert(days >= 1 && days <= 365, 400, "'days' phải nằm trong khoảng 1 đến 365.");

  // Tạo sẵn các "xô" ngày (đều 0) rồi đổ dữ liệu vào
  const buckets = [];
  const todayUtcMidnight = new Date(`${dayKeyOf(new Date())}T00:00:00.000Z`);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(todayUtcMidnight);
    d.setUTCDate(d.getUTCDate() - i);
    buckets.push({ key: dayKeyOf(d), start: d });
  }
  const end = new Date(todayUtcMidnight);
  end.setUTCDate(end.getUTCDate() + 1);

  const transactions = await prisma.transaction.findMany({
    where: { userId: req.userId, date: { gte: buckets[0].start, lt: end } },
    select: { amount: true, type: true, date: true },
  });

  const map = Object.fromEntries(buckets.map((b) => [b.key, { date: b.key, thu: 0, chi: 0 }]));
  for (const tx of transactions) {
    const bucket = map[dayKeyOf(tx.date)];
    if (!bucket) continue;
    if (tx.type === 'THU') bucket.thu += tx.amount;
    else bucket.chi += tx.amount;
  }

  res.json(buckets.map((b) => map[b.key]));
});
