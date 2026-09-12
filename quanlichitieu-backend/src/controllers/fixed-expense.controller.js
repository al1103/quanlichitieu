const prisma = require('../config/db');

exports.getFixedExpenses = async (req, res, next) => {
  try {
    const fixedExpenses = await prisma.fixedExpense.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(fixedExpenses);
  } catch (error) {
    next(error);
  }
};

exports.createFixedExpense = async (req, res, next) => {
  try {
    const { amount, category, description } = req.body;
    const parsedAmount = parseFloat(amount);

    if (!category || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Vui lòng nhập số tiền hợp lệ (lớn hơn 0) và danh mục.' });
    }

    const fixedExpense = await prisma.fixedExpense.create({
      data: {
        userId: req.user.id,
        amount: parsedAmount,
        category,
        description
      }
    });

    res.status(201).json(fixedExpense);
  } catch (error) {
    next(error);
  }
};

exports.updateFixedExpense = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { amount, category, description } = req.body;

    const existing = await prisma.fixedExpense.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy khoản chi cố định' });
    }

    let parsedAmount;
    if (amount !== undefined) {
      parsedAmount = parseFloat(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ message: 'Số tiền phải là số lớn hơn 0.' });
      }
    }

    const updated = await prisma.fixedExpense.update({
      where: { id },
      data: {
        amount: parsedAmount,
        category: category !== undefined ? category : undefined,
        description: description !== undefined ? description : undefined
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
};

exports.deleteFixedExpense = async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.fixedExpense.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy khoản chi cố định' });
    }

    await prisma.fixedExpense.delete({ where: { id } });

    res.json({ message: 'Đã xóa khoản chi cố định' });
  } catch (error) {
    next(error);
  }
};
