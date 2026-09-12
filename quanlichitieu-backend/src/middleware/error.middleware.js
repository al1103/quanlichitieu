/**
 * Xử lý lỗi tập trung cho toàn bộ ứng dụng:
 * - notFoundHandler: bắt đường dẫn không tồn tại -> 404 JSON
 * - errorHandler: mọi lỗi ném ra từ controller/middleware -> JSON { error }
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({ error: `Không tìm thấy đường dẫn: ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  // Body JSON gửi lên sai cú pháp
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Dữ liệu JSON gửi lên không hợp lệ.' });
  }

  const status = err.status || 500;
  if (status >= 500) console.error('[SERVER ERROR]', err);

  res.status(status).json({
    error: err.message || 'Lỗi server không xác định.',
    // Mã lỗi nghiệp vụ (VD: INSUFFICIENT_BALANCE) để FE biết đường xử lý
    ...(err.code ? { code: err.code } : {}),
  });
};

module.exports = { notFoundHandler, errorHandler };
