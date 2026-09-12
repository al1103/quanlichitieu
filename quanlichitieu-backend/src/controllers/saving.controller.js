/**
 * Mục tiêu tiết kiệm:
 * - GET    /api/savings              : danh sách mục tiêu kèm % hoàn thành
 * - POST   /api/savings              : tạo mục tiêu mới
 * - PUT    /api/savings/:id          : sửa thông tin mục tiêu
 * - DELETE /api/savings/:id          : xoá mục tiêu
 * - POST   /api/savings/:id/deposit  : đóng góp thêm tiền (tự hoàn tất khi đủ mục tiêu)
 */
const prisma = require('../config/db');
const { asyncHandler, assert, requireFields, toNumber, isValidObjectId } = require('../utils/helpers');

function withPercent(goal) {
  const percentComplete =
    goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
  return { ...goal, percentComplete };
}

// GET /api/savings
exports.getSavingsGoals = asyncHandler(async (req, res) => {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId: req.userId },
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], // Đang làm trước, mới nhất trước
  });
  res.json(goals.map(withPercent));
});

// POST /api/savings
exports.createSavingsGoal = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'targetAmount']);
  const name = String(req.body.name).trim();
  const targetAmount = toNumber(req.body.targetAmount);
  assert(name !== '', 400, 'Vui lòng nhập tên mục tiêu.');
  assert(Number.isFinite(targetAmount) && targetAmount > 0, 400, 'Số tiền mục tiêu phải là số lớn hơn 0.');

  let deadline = null;
  if (req.body.deadline) {
    deadline = new Date(req.body.deadline);
    assert(!isNaN(deadline.getTime()), 400, 'Hạn chót không hợp lệ.');
  }

  const monthlyContribution = toNumber(req.body.monthlyContribution);

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: req.userId,
      name,
      targetAmount,
      monthlyContribution: Number.isFinite(monthlyContribution) ? monthlyContribution : null,
      deadline,
      currentAmount: toNumber(req.body.currentAmount) || 0,
    },
  });

  res.status(201).json(withPercent(goal));
});

// PUT /api/savings/:id
exports.updateSavingsGoal = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const existing = isValidObjectId(id)
    ? await prisma.savingsGoal.findFirst({ where: { id, userId: req.userId } })
    : null;
  assert(existing, 404, 'Không tìm thấy mục tiêu tiết kiệm.');

  const data = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    assert(name !== '', 400, 'Tên mục tiêu không được để trống.');
    data.name = name;
  }
  if (req.body.targetAmount !== undefined) {
    const targetAmount = toNumber(req.body.targetAmount);
    assert(Number.isFinite(targetAmount) && targetAmount > 0, 400, 'Số tiền mục tiêu phải là số lớn hơn 0.');
    data.targetAmount = targetAmount;
  }
  if (req.body.monthlyContribution !== undefined) {
    const mc = toNumber(req.body.monthlyContribution);
    data.monthlyContribution = Number.isFinite(mc) ? mc : null;
  }
  if (req.body.deadline !== undefined) {
    if (req.body.deadline === null || req.body.deadline === '') {
      data.deadline = null;
    } else {
      const deadline = new Date(req.body.deadline);
      assert(!isNaN(deadline.getTime()), 400, 'Hạn chót không hợp lệ.');
      data.deadline = deadline;
    }
  }
  if (req.body.status !== undefined) {
    assert(['IN_PROGRESS', 'COMPLETED'].includes(req.body.status), 400, "Trạng thái chỉ nhận 'IN_PROGRESS' hoặc 'COMPLETED'.");
    data.status = req.body.status;
  }
  assert(Object.keys(data).length > 0, 400, 'Không có dữ liệu nào để cập nhật.');

  let updated = await prisma.savingsGoal.update({ where: { id: existing.id }, data });

  // Tự đánh dấu hoàn thành nếu đã đạt mục tiêu
  if (updated.status !== 'COMPLETED' && updated.currentAmount >= updated.targetAmount) {
    updated = await prisma.savingsGoal.update({
      where: { id: updated.id },
      data: { status: 'COMPLETED' },
    });
  }

  res.json(withPercent(updated));
});

// POST /api/savings/:id/deposit  body: { amount }
exports.depositToGoal = asyncHandler(async (req, res) => {
  requireFields(req.body, ['amount']);
  const amount = toNumber(req.body.amount);
  assert(Number.isFinite(amount) && amount > 0, 400, 'Số tiền đóng góp phải là số lớn hơn 0.');

  const depositId = req.params.id;
  const existing = isValidObjectId(depositId)
    ? await prisma.savingsGoal.findFirst({ where: { id: depositId, userId: req.userId } })
    : null;
  assert(existing, 404, 'Không tìm thấy mục tiêu tiết kiệm.');

  let goal = await prisma.savingsGoal.update({
    where: { id: existing.id },
    data: { currentAmount: { increment: amount } },
  });

  // Đủ mục tiêu -> tự chuyển sang COMPLETED
  if (goal.status !== 'COMPLETED' && goal.currentAmount >= goal.targetAmount) {
    goal = await prisma.savingsGoal.update({
      where: { id: goal.id },
      data: { status: 'COMPLETED' },
    });
  }

  res.json({
    message: `Đã đóng góp thành công vào mục tiêu "${goal.name}".`,
    goal: withPercent(goal),
  });
});

// DELETE /api/savings/:id
exports.deleteSavingsGoal = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const deleted = isValidObjectId(id)
    ? await prisma.savingsGoal.deleteMany({ where: { id, userId: req.userId } })
    : { count: 0 };
  assert(deleted.count > 0, 404, 'Không tìm thấy mục tiêu tiết kiệm.');

  res.json({ message: 'Đã xóa mục tiêu tiết kiệm.' });
});
