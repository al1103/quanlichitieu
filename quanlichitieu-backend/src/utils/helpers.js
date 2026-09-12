/**
 * Tập hợp helper dùng chung cho toàn dự án:
 * - ApiError + asyncHandler: xử lý lỗi tập trung
 * - assert / requireFields: kiểm tra dữ liệu đầu vào
 * - Các hàm tiện ích về ngày/tháng (định dạng 'YYYY-MM')
 */
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Bọc hàm async để mọi exception tự động đi vào error middleware
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// MongoDB ObjectId: 24 ký tự hex. Kiểm tra trước khi query để tránh Prisma
// ném lỗi validation (500) khi client gửi id sai định dạng.
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
function isValidObjectId(id) {
  return typeof id === 'string' && OBJECT_ID_RE.test(id);
}

// Nếu điều kiện KHÔNG thoả thì ném lỗi với status tương ứng
function assert(condition, status, message) {
  if (!condition) throw new ApiError(status, message);
}

// Kiểm tra các trường bắt buộc tồn tại trong body
function requireFields(body, fields) {
  fields.forEach((f) =>
    assert(
      body[f] !== undefined && body[f] !== null && body[f] !== '',
      400,
      `Thiếu trường bắt buộc: ${f}`
    )
  );
}

// Chuyển an toàn sang số, NaN nếu không hợp lệ
function toNumber(v) {
  if (v === undefined || v === null || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Xoá mật khẩu trước khi trả user ra ngoài
function sanitizeUser(user) {
  if (!user) return user;
  const { password, ...rest } = user;
  return rest;
}

const pad2 = (n) => String(n).padStart(2, '0');

// Khoá tháng theo UTC: 'YYYY-MM' (dữ liệu date được lưu chuẩn UTC)
function monthKey(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

function currentMonth() {
  return monthKey(new Date());
}

// 'YYYY-MM' -> { start: Date(đầu tháng), end: Date(đầu tháng kế tiếp) }
function monthRange(month) {
  assert(/^\d{4}-\d{2}$/.test(String(month || '')), 400, 'Tháng không hợp lệ (định dạng YYYY-MM).');
  const [y, m] = String(month).split('-').map(Number);
  assert(m >= 1 && m <= 12, 400, 'Tháng phải nằm trong khoảng 01 đến 12.');
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

// Khoá ngày theo UTC: 'YYYY-MM-DD'
function dayKeyOf(d) {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// Lọc from/to ('YYYY-MM-DD') từ query thành điều kiện Prisma cho trường date
function dateFilterFromQuery(q) {
  const filter = {};
  if (q.from) {
    const from = new Date(`${q.from}T00:00:00.000Z`);
    assert(!isNaN(from.getTime()), 400, "Tham số 'from' không hợp lệ (định dạng YYYY-MM-DD).");
    filter.gte = from;
  }
  if (q.to) {
    const to = new Date(`${q.to}T00:00:00.000Z`);
    assert(!isNaN(to.getTime()), 400, "Tham số 'to' không hợp lệ (định dạng YYYY-MM-DD).");
    to.setUTCDate(to.getUTCDate() + 1); // bao trọn ngày 'to'
    filter.lt = to;
  }
  return filter;
}

// Đầu ngày hôm nay theo giờ local của server (dùng cho quota/thống kê trong ngày)
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = {
  ApiError,
  asyncHandler,
  assert,
  requireFields,
  toNumber,
  sanitizeUser,
  EMAIL_RE,
  isValidObjectId,
  monthKey,
  currentMonth,
  monthRange,
  dayKeyOf,
  dateFilterFromQuery,
  startOfToday,
};
