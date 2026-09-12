/**
 * Danh mục (bảng toàn cục, Admin quản lý qua /api/admin/categories):
 * - GET /api/categories : danh sách cho mọi user đăng nhập.
 *   Nếu bảng trống thì tự động tạo 6 danh mục mặc định khớp với Frontend.
 */
const prisma = require('../config/db');
const { asyncHandler } = require('../utils/helpers');

// Khớp màu/icon mà js/main.js của FE đang dùng để vẽ biểu đồ
const DEFAULT_CATEGORIES = [
  { name: 'Ăn uống', icon: 'utensils', color: '#f97316', type: 'CHI' },
  { name: 'Mua sắm', icon: 'shopping-bag', color: '#3b82f6', type: 'CHI' },
  { name: 'Di chuyển', icon: 'car', color: '#eab308', type: 'CHI' },
  { name: 'Giải trí', icon: 'film', color: '#a855f7', type: 'CHI' },
  { name: 'Lương', icon: 'banknote', color: '#10b981', type: 'THU' },
  { name: 'Khác', icon: 'more-horizontal', color: '#64748b', type: 'BOTH' },
];

async function ensureSeeded() {
  const count = await prisma.category.count();
  if (count === 0) {
    await prisma.category.createMany({ data: DEFAULT_CATEGORIES });
  }
}

// GET /api/categories
exports.getCategories = asyncHandler(async (req, res) => {
  await ensureSeeded();
  const categories = await prisma.category.findMany({
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  res.json(categories);
});
