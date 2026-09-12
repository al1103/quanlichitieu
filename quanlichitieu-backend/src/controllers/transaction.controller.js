/**
 * Giao dịch thu/chi - đầy đủ CRUD + lọc + tìm kiếm:
 * - GET    /api/transactions      : danh sách (lọc theo type/category/month/from/to/q)
 * - POST   /api/transactions      : tạo mới (hỗ trợ toạ độ latitude/longitude)
 * - GET    /api/transactions/:id  : chi tiết (kèm toạ độ nếu có)
 * - PUT    /api/transactions/:id  : cập nhật
 * - DELETE /api/transactions/:id  : xoá
 */
const prisma = require('../config/db');
const {
  asyncHandler,
  assert,
  toNumber,
  monthRange,
  currentMonth,
  dateFilterFromQuery,
  isValidObjectId,
} = require('../utils/helpers');

const VALID_TYPES = ['THU', 'CHI'];

// Kiểm tra & chuẩn hoá các trường giao dịch trong body
// partial=true: chỉ lấy những trường người dùng có gửi lên (dùng cho PUT)
function parseTxFields(body, { partial = false } = {}) {
  const data = {};

  if (!partial || body.amount !== undefined) {
    const amount = toNumber(body.amount);
    assert(Number.isFinite(amount) && amount > 0, 400, 'Số tiền phải là số lớn hơn 0.');
    data.amount = amount;
  }
  if (!partial || body.type !== undefined) {
    assert(VALID_TYPES.includes(body.type), 400, "Loại giao dịch phải là 'THU' (thu nhập) hoặc 'CHI' (chi tiêu).");
    data.type = body.type;
  }
  if (!partial || body.category !== undefined) {
    const category = String(body.category || '').trim();
    assert(category !== '', 400, 'Vui lòng chọn danh mục.');
    data.category = category;
  }
  if (body.description !== undefined) {
    data.description = String(body.description || '').trim() || null;
  }
  if (body.date !== undefined && body.date !== null && body.date !== '') {
    const date = new Date(body.date);
    assert(!isNaN(date.getTime()), 400, 'Ngày giao dịch không hợp lệ.');
    data.date = date;
  }

  return data;
}

// Kiểm tra & chuẩn hoá toạ độ nếu client gửi lên (rỗng nếu không có)
function parseCoords(body) {
  if (body.latitude === undefined && body.longitude === undefined) return {};

  const lat = toNumber(body.latitude);
  const lng = toNumber(body.longitude);
  assert(Number.isFinite(lat) && Number.isFinite(lng), 400, 'latitude/longitude phải là số.');
  assert(lat >= -90 && lat <= 90, 400, 'Vĩ độ (latitude) phải nằm trong khoảng [-90, 90].');
  assert(lng >= -180 && lng <= 180, 400, 'Kinh độ (longitude) phải nằm trong khoảng [-180, 180].');
  return { latitude: lat, longitude: lng };
}

// GET /api/transactions
exports.getTransactions = asyncHandler(async (req, res) => {
  const where = { userId: req.userId };

  // Bộ lọc tuỳ chọn
  if (req.query.type) {
    assert(VALID_TYPES.includes(req.query.type), 400, "Tham số 'type' chỉ nhận 'THU' hoặc 'CHI'.");
    where.type = req.query.type;
  }
  if (req.query.category) {
    where.category = String(req.query.category).trim();
  }
  if (req.query.q) {
    const q = String(req.query.q).trim();
    where.OR = [
      { description: { contains: q, mode: 'insensitive' } },
      { category: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (req.query.month) {
    const { start, end } = monthRange(req.query.month);
    where.date = { gte: start, lt: end };
  } else if (req.query.from || req.query.to) {
    where.date = dateFilterFromQuery(req.query);
  }

  // Giới hạn số lượng để tránh quá tải (FE mặc định tải hết)
  let take;
  if (req.query.limit) {
    take = Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 1), 1000);
  } else {
    take = 1000;
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: 'desc' }, { id: 'desc' }], // Mới nhất trước
    take,
  });

  res.json(transactions); // Trả mảng thuần đúng định dạng FE đang dùng
});

// POST /api/transactions
exports.createTransaction = asyncHandler(async (req, res) => {
  const data = parseTxFields(req.body);
  const coords = parseCoords(req.body); // Kiểm tra toạ độ TRƯỚC khi ghi DB

  const newTx = await prisma.transaction.create({
    data: {
      userId: req.userId,
      amount: data.amount,
      type: data.type,
      category: data.category,
      description: data.description ?? null,
      date: data.date ?? new Date(),
      ...coords,
    },
  });

  res.status(201).json(newTx); // Trả thẳng object giao dịch vừa tạo
});

// GET /api/transactions/:id
exports.getTransactionById = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const tx = isValidObjectId(id)
    ? await prisma.transaction.findFirst({ where: { id, userId: req.userId } })
    : null;
  assert(tx, 404, 'Không tìm thấy giao dịch.');

  res.json(tx);
});

// PUT /api/transactions/:id
exports.updateTransaction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const existing = isValidObjectId(id)
    ? await prisma.transaction.findFirst({ where: { id, userId: req.userId } })
    : null;
  assert(existing, 404, 'Không tìm thấy giao dịch.');

  const data = parseTxFields(req.body, { partial: true });
  const coords = parseCoords(req.body);
  assert(Object.keys(data).length > 0 || Object.keys(coords).length > 0, 400, 'Không có dữ liệu nào để cập nhật.');

  const updated = await prisma.transaction.update({
    where: { id: existing.id },
    data: { ...data, ...coords },
  });

  res.json(updated);
});

// DELETE /api/transactions/:id
exports.deleteTransaction = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const deleted = isValidObjectId(id)
    ? await prisma.transaction.deleteMany({ where: { id, userId: req.userId } }) // Chỉ cho xoá giao dịch của chính mình
    : { count: 0 };
  assert(deleted.count > 0, 404, 'Không tìm thấy giao dịch.');

  res.json({ message: 'Đã xóa giao dịch.' });
});
