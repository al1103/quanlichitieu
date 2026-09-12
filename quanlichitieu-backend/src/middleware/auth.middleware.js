/**
 * Middleware xác thực JWT:
 * - verifyToken: yêu cầu đăng nhập (gắn req.userId + req.user)
 * - requireAdmin: yêu cầu quyền ADMIN (dùng sau verifyToken)
 */
const jwt = require('jsonwebtoken');
const prisma = require('../config/db');
const { isValidObjectId } = require('../utils/helpers');

const verifyToken = async (req, res, next) => {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Không tìm thấy Token. Vui lòng đăng nhập!' });
  }

  try {
    const token = header.split(' ')[1]; // Tách chữ "Bearer <token>"
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!isValidObjectId(decoded.userId)) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
    }
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: 'Tài khoản không tồn tại.' });
    }
    if (user.status === 'BLOCKED') {
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản trị viên.' });
    }

    req.userId = user.id; // Lưu ID user vào request để các hàm sau dùng
    req.user = user;
    next(); // Cho đi tiếp
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn.' });
  }
};

// Lưu ý: phải đặt SAU verifyToken
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Chức năng này chỉ dành cho quản trị viên.' });
  }
  next();
};

module.exports = { verifyToken, requireAdmin };
