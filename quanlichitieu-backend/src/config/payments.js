/**
 * Cấu hình cổng thanh toán nạp tiền (mô phỏng gateway thật):
 * - Đơn hàng có mã riêng, trạng thái PENDING -> PAID/CANCELLED/EXPIRED
 * - Hết hạn sau ORDER_TTL_MINUTES phút không thanh toán
 */

const SUPPORTED_METHODS = ['BANK', 'CARD', 'MOMO'];

// Thông tin hiển thị theo từng phương thức (giả lập - chỉ dùng cho demo)
const PAYMENT_INFO = {
  BANK: {
    label: 'Chuyển khoản ngân hàng',
    bankName: 'Ngân hàng TMCP Demo (VCB)',
    accountName: 'CÔNG TY TNHH CHILOTUS',
    accountNumber: '0071000123456',
  },
  MOMO: {
    label: 'Ví điện tử MoMo',
    phone: '0987.654.321',
    receiver: 'CHILOTUS',
  },
  CARD: {
    label: 'Thẻ ATM / Visa / Mastercard',
  },
};

const ORDER_TTL_MINUTES = 15; // Đơn hết hạn nếu không thanh toán trong 15 phút

// Sinh mã đơn: MT + timestamp + 4 số ngẫu nhiên, VD: MT1719000000001234
function generateOrderCode() {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `MT${Date.now()}${rand}`;
}

module.exports = { SUPPORTED_METHODS, PAYMENT_INFO, ORDER_TTL_MINUTES, generateOrderCode };
