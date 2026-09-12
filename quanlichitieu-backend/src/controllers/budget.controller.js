/**
 * Ngân sách theo danh mục/tháng:
 * - GET    /api/budgets?month=YYYY-MM : danh sách kèm % đã tiêu + cảnh báo >= 80%
 * - POST   /api/budgets               : tạo hạn mức mới
 * - PUT    /api/budgets/:id           : sửa hạn mức
 * - DELETE /api/budgets/:id           : xoá
 *
 * "spent" được tính trực tiếp từ các giao dịch CHI cùng danh mục trong tháng.
 */
const prisma = require('../config/db');
const { asyncHandler, assert, requireFields, toNumber, monthRange, currentMonth, isValidObjectId } = require('../utils/helpers');

// GET /api/budgets
exports.getBudgets = asyncHandler(async (req, res) => {
  const month = req.query.month || currentMonth();
  const { start, end } = monthRange(month);

  const budgets = await prisma.budget.findMany({
    where: { userId: req.userId, month },
    orderBy: { category: 'asc' },
  });

  if (budgets.length === 0) return res.json([]);

  // Tổng chi thực tế theo từng danh mục trong tháng
  const spentRows = await prisma.transaction.groupBy({
    by: ['category'],
    where: {
      userId: req.userId,
      type: 'CHI',
      category: { in: budgets.map((b) => b.category) },
      date: { gte: start, lt: end },
    },
    _sum: { amount: true },
  });
  const spentMap = Object.fromEntries(spentRows.map((r) => [r.category, r._sum.amount || 0]));

  const result = budgets.map((b) => {
    const spent = spentMap[b.category] || 0;
    const percentUsed = b.limitAmount > 0 ? Math.round((spent / b.limitAmount) * 100) : 100;
    return {
      id: b.id,
      category: b.category,
      month: b.month,
      limitAmount: b.limitAmount,
      spent,
      remaining: Math.max(b.limitAmount - spent, 0),
      exceeded: spent > b.limitAmount,
      percentUsed,
      warning: percentUsed >= 80, // FE hiển thị nhãn "Cảnh báo" từ 80%
      createdAt: b.createdAt,
    };
  });

  res.json(result);
});

// POST /api/budgets
exports.createBudget = asyncHandler(async (req, res) => {
  requireFields(req.body, ['category', 'limitAmount']);
  const category = String(req.body.category).trim();
  const limitAmount = toNumber(req.body.limitAmount);
  assert(Number.isFinite(limitAmount) && limitAmount > 0, 400, 'Hạn mức phải là số lớn hơn 0.');

  const month = req.body.month || currentMonth();
  monthRange(month); // kiểm tra định dạng tháng

  try {
    const budget = await prisma.budget.create({
      data: { userId: req.userId, category, limitAmount, month },
    });
    res.status(201).json(budget);
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('Ngân sách cho danh mục này trong tháng đã tồn tại.'), { status: 409 });
    }
    throw err;
  }
});

// PUT /api/budgets/:id
exports.updateBudget = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const existing = isValidObjectId(id)
    ? await prisma.budget.findFirst({ where: { id, userId: req.userId } })
    : null;
  assert(existing, 404, 'Không tìm thấy ngân sách.');

  const data = {};
  if (req.body.category !== undefined) data.category = String(req.body.category).trim();
  if (req.body.limitAmount !== undefined) {
    const limitAmount = toNumber(req.body.limitAmount);
    assert(Number.isFinite(limitAmount) && limitAmount > 0, 400, 'Hạn mức phải là số lớn hơn 0.');
    data.limitAmount = limitAmount;
  }
  if (req.body.month !== undefined) {
    monthRange(req.body.month);
    data.month = req.body.month;
  }
  assert(Object.keys(data).length > 0, 400, 'Không có dữ liệu nào để cập nhật.');

  try {
    const updated = await prisma.budget.update({ where: { id: existing.id }, data });
    res.json(updated);
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('Ngân sách cho danh mục này trong tháng đã tồn tại.'), { status: 409 });
    }
    throw err;
  }
});

// DELETE /api/budgets/:id
exports.deleteBudget = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const deleted = isValidObjectId(id)
    ? await prisma.budget.deleteMany({ where: { id, userId: req.userId } })
    : { count: 0 };
  assert(deleted.count > 0, 404, 'Không tìm thấy ngân sách.');

  res.json({ message: 'Đã xóa ngân sách.' });
});
