// Giá gói Premium (VND). Có thể override bằng biến môi trường PREMIUM_PRICE.
module.exports = {
  PREMIUM_PRICE: Number(process.env.PREMIUM_PRICE) || 99_000,
};
