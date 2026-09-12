/**
 * Chức năng quản trị viên (Admin) - mục 3.11 trong Đề cương chức năng:
 * - GET  /api/admin/users               : danh sách người dùng (+ số lượng dữ liệu)
 * - PUT  /api/admin/users/:id/status    : khoá / mở khoá tài khoản
 * - GET  /api/admin/stats               : thống kê tổng quan + usage AI
 * - CRUD /api/admin/categories          : quản lý danh mục mặc định toàn hệ thống
 * - GET/PUT /api/admin/ai-settings      : chọn model AI + hạn mức câu hỏi/ngày
 */
const prisma = require('../config/db');
const { asyncHandler, assert, requireFields, sanitizeUser, toNumber, startOfToday, isValidObjectId } = require('../utils/helpers');
const { getSetting, setSetting } = require('../utils/settings');
const { resolveModel } = require('../config/ollama');

// ---------- QUẢN LÝ NGƯỜI DÙNG ----------

// GET /api/admin/users?q=
exports.getUsers = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.q) {
    const q = String(req.query.q).trim();
    where.OR = [
      { email: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      _count: { select: { transactions: true, budgets: true, savingsGoals: true } },
    },
  });

  res.json(
    users.map((u) => ({
      ...sanitizeUser(u),
      counts: {
        transactions: u._count.transactions,
        budgets: u._count.budgets,
        savingsGoals: u._count.savingsGoals,
      },
    }))
  );
});

// PUT /api/admin/users/:id/status  body: { status: 'ACTIVE' | 'BLOCKED' }
exports.setUserStatus = asyncHandler(async (req, res) => {
  requireFields(req.body, ['status']);
  assert(['ACTIVE', 'BLOCKED'].includes(req.body.status), 400, "Trạng thái chỉ nhận 'ACTIVE' hoặc 'BLOCKED'.");

  const userId = req.params.id;
  assert(isValidObjectId(userId), 400, 'ID người dùng không hợp lệ.');
  assert(userId !== req.userId, 400, 'Bạn không thể tự khóa chính mình.');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  assert(user, 404, 'Không tìm thấy người dùng.');

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { status: req.body.status },
  });

  res.json({ message: `Đã ${req.body.status === 'BLOCKED' ? 'khóa' : 'mở khóa'} tài khoản ${updated.email}.` });
});

// ---------- THỐNG KÊ TỔNG QUAN ----------

// GET /api/admin/stats
exports.getStats = asyncHandler(async (req, res) => {
  const startOfDay = startOfToday();

  const [totalUsers, activeUsers, blockedUsers, totalTransactions, aiAgg, aiTodayAgg] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { status: 'BLOCKED' } }),
      prisma.transaction.count(),
      prisma.aiLog.aggregate({ _count: true, _sum: { tokens: true, costEstimate: true } }),
      prisma.aiLog.aggregate({
        _count: true,
        _sum: { tokens: true, costEstimate: true },
        where: { createdAt: { gte: startOfDay } },
      }),
    ]);

  // Top 5 người dùng dùng AI nhiều nhất
  const topRows = await prisma.aiLog.groupBy({
    by: ['userId'],
    _count: true,
    where: { userId: { not: null } },
    orderBy: { _count: { userId: 'desc' } },
    take: 5,
  });
  const topUsers = await Promise.all(
    topRows.map(async (row) => {
      const user = row.userId
        ? await prisma.user.findUnique({ where: { id: row.userId }, select: { id: true, name: true, email: true } })
        : null;
      return { user, requests: row._count };
    })
  );

  // 10 lần gọi AI gần nhất
  const recentLogs = await prisma.aiLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  res.json({
    users: { total: totalUsers, active: activeUsers, blocked: blockedUsers },
    transactions: { total: totalTransactions },
    ai: {
      totalRequests: aiAgg._count,
      todayRequests: aiTodayAgg._count,
      totalTokens: aiAgg._sum.tokens || 0,
      estimatedCostTotal: aiAgg._sum.costEstimate || 0,
      estimatedCostToday: aiTodayAgg._sum.costEstimate || 0,
      topUsers,
      recentLogs,
    },
  });
});

// ---------- QUẢN LÝ DANH MỤC TOÀN HỆ THỐNG ----------

// GET /api/admin/categories
exports.getCategories = asyncHandler(async (req, res) => {
  res.json(await prisma.category.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] }));
});

function parseCategoryBody(body, { partial = false } = {}) {
  const data = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || '').trim();
    assert(name !== '', 400, 'Tên danh mục không được để trống.');
    data.name = name;
  }
  if (!partial || body.type !== undefined) {
    assert(['CHI', 'THU', 'BOTH'].includes(body.type), 400, "Kiểu danh mục chỉ nhận 'CHI', 'THU' hoặc 'BOTH'.");
    data.type = body.type;
  }
  if (body.icon !== undefined) data.icon = String(body.icon).trim() || 'more-horizontal';
  if (body.color !== undefined) data.color = String(body.color).trim() || '#64748b';
  return data;
}

// POST /api/admin/categories
exports.createCategory = asyncHandler(async (req, res) => {
  const data = parseCategoryBody(req.body);

  try {
    res.status(201).json(await prisma.category.create({ data }));
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('Danh mục với tên này đã tồn tại.'), { status: 409 });
    }
    throw err;
  }
});

// PUT /api/admin/categories/:id
exports.updateCategory = asyncHandler(async (req, res) => {
  const catId = req.params.id;
  const existing = isValidObjectId(catId)
    ? await prisma.category.findUnique({ where: { id: catId } })
    : null;
  assert(existing, 404, 'Không tìm thấy danh mục.');

  const data = parseCategoryBody(req.body, { partial: true });
  assert(Object.keys(data).length > 0, 400, 'Không có dữ liệu nào để cập nhật.');

  try {
    res.json(await prisma.category.update({ where: { id: existing.id }, data }));
  } catch (err) {
    if (err.code === 'P2002') {
      throw Object.assign(new Error('Danh mục với tên này đã tồn tại.'), { status: 409 });
    }
    throw err;
  }
});

// DELETE /api/admin/categories/:id
exports.deleteCategory = asyncHandler(async (req, res) => {
  const catId = req.params.id;
  const deleted = isValidObjectId(catId)
    ? await prisma.category.deleteMany({ where: { id: catId } })
    : { count: 0 };
  assert(deleted.count > 0, 404, 'Không tìm thấy danh mục.');
  res.json({ message: 'Đã xóa danh mục.' });
});

// ---------- CẤU HÌNH AI ----------

// GET /api/admin/ai-settings
exports.getAiSettings = asyncHandler(async (req, res) => {
  const quota = parseInt((await getSetting('ai_daily_quota')) || '50', 10);
  res.json({
    model: await resolveModel(),
    dailyQuota: Number.isFinite(quota) ? quota : 50,
  });
});

// PUT /api/admin/ai-settings  body: { model?, dailyQuota? }
exports.updateAiSettings = asyncHandler(async (req, res) => {
  let changed = false;

  if (req.body.model !== undefined) {
    const model = String(req.body.model).trim();
    assert(model !== '', 400, 'Tên model không được để trống.');
    await setSetting('ollama_model', model);
    changed = true;
  }
  if (req.body.dailyQuota !== undefined) {
    const quota = parseInt(toNumber(req.body.dailyQuota), 10);
    assert(Number.isFinite(quota) && quota >= 1 && quota <= 10000, 400, "Hạn mức 'dailyQuota' phải là số từ 1 đến 10000.");
    await setSetting('ai_daily_quota', String(quota));
    changed = true;
  }

  assert(changed, 400, 'Không có dữ liệu nào để cập nhật.');
  await exports.getAiSettings(req, res); // Trả lại cấu hình sau khi cập nhật
});
