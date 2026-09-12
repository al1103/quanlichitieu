/**
 * API TEST SUITE - kiểm tra TOÀN BỘ luồng của ChiLotus Backend.
 *
 * Điều kiện chạy:
 *   1. DB đang chạy        : docker-compose up -d
 *   2. Schema đã đồng bộ   : npm run db:push
 *   3. Đã seed dữ liệu mẫu : npm run db:seed   (cần tài khoản admin mặc định)
 *   4. Server đang chạy    : npm run dev       (mặc định http://localhost:3001)
 *
 * Chạy test:
 *   npm run test:api
 *
 * Tuỳ chọn:
 *   TEST_BASE_URL=http://localhost:3001  -> địa chỉ server cần test
 *   SKIP_AI=1                            -> bỏ qua các test gọi AI thật (tốn quota)
 *
 * Kết quả: in ra từng case PASS/FAIL/SKIP, tổng kết cuối cùng,
 * exit code = 1 nếu có FAIL (tiện cho CI).
 */
const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3001';
const SKIP_AI = process.env.SKIP_AI === '1';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@chilotus.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Load .env để một số case đặc biệt có thể truy vấn DB trực tiếp
// (biến môi trường đã đặt từ ngoài sẽ được ưu tiên, không bị ghi đè)
require('dotenv').config();

// ---------- Khung chạy test ----------
const results = [];
let passCount = 0;
let failCount = 0;
let skipCount = 0;

function ok(condition, message) {
  if (!condition) throw new Error(message);
}

// Id giờ là MongoDB ObjectId (chuỗi 24 ký tự hex), không còn là số nguyên
function isObjectId(id) {
  return typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
}

function eq(actual, expected, label) {
  const a = typeof actual === 'number' ? Math.round(actual * 100) / 100 : actual;
  const b = typeof expected === 'number' ? Math.round(expected * 100) / 100 : expected;
  ok(a === b, `${label}: mong đợi ${JSON.stringify(b)} nhưng nhận ${JSON.stringify(a)}`);
}

async function test(name, fn) {
  try {
    await fn();
    passCount += 1;
    results.push({ name, status: 'PASS' });
    console.log(`  ✅ PASS | ${name}`);
  } catch (err) {
    failCount += 1;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  ❌ FAIL | ${name}\n           └─ ${err.message}`);
  }
}

async function skip(name, reason) {
  skipCount += 1;
  results.push({ name, status: 'SKIP', error: reason });
  console.log(`  ⏭️  SKIP | ${name} (${reason})`);
}

// ---------- HTTP helper ----------
async function req(method, path, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${TEST_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    const netErr = new Error(`NETWORK_ERROR: ${err.message}`);
    netErr.isNetwork = true;
    throw netErr;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {
    /* body rỗng hoặc không phải JSON */
  }
  return { status: res.status, data };
}

// ---------- Dữ liệu dùng chung ----------
const ts = Date.now();
const U1 = { name: 'Người Dùng Một', email: `test.u1.${ts}@example.com`, password: 'matkhau1' };
const U2 = { name: 'Người Dùng Hai', email: `test.u2.${ts}@example.com`, password: 'matkhau2' };
let u1Token;
let u1Email = U1.email; // Email hiện tại của U1 (có thể bị đổi giữa chừng bởi test profile)
let u1Id;
let u2Token;
let adminToken;
let adminId;
let aiOnline = true; // dịch vụ AI có reachable hay không

const now = new Date();
const Y = now.getUTCFullYear();
const M = now.getUTCMonth(); // 0-based
const pad = (n) => String(n).padStart(2, '0');
const CM = `${Y}-${pad(M + 1)}`; // tháng hiện tại 'YYYY-MM'
const PM = M === 0 ? `${Y - 1}-12` : `${Y}-${pad(M)}`; // tháng trước
const atDay = (monthKey, day) => `${monthKey}-${pad(day)}T12:00:00.000Z`;

// Số liệu kỳ vọng của U1 sau khi tạo xong giao dịch
const EXP = {
  incomeTotal: 15_000_000 + 2_000_000,
  expenseTotal: 85_000 + 450_000 + 65_000 + 300_000,
};

// ============================================================
// A. HẠ TẦNG / PUBLIC
// ============================================================
async function sectionInfra() {
  console.log('\n=== A. Hạ tầng & public endpoints ===');

  await test('GET / -> trang chủ app (HTML) khi có frontend, ngược lại JSON welcome', async () => {
    const res = await fetch(`${TEST_BASE_URL}/`, { signal: AbortSignal.timeout(30_000) });
    eq(res.status, 200, 'HTTP status');
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      // Backend đang phục vụ luôn frontend: trang chủ phải là HTML của app
      const html = await res.text();
      ok(html.includes('<html'), 'Nội dung không giống HTML');
    } else {
      const data = await res.json();
      ok(data.message && data.message.includes('ChiLotus'), 'Thiếu welcome message');
    }
  });

  await test('GET /index.html phục vụ frontend tĩnh (status 200)', async () => {
    const res = await fetch(`${TEST_BASE_URL}/index.html`, { signal: AbortSignal.timeout(30_000) });
    eq(res.status, 200, 'HTTP status');
    const html = await res.text();
    ok(html.includes('<html'), 'Nội dung không giống HTML');
  });

  await test('GET /api/khong-ton-tai trả 404 dạng JSON', async () => {
    const { status, data } = await req('GET', '/api/khong-ton-tai');
    eq(status, 404, 'HTTP status');
    ok(data.error, 'Thiếu trường error');
  });

  await test('Body JSON sai cú pháp trả 400 (không crash server)', async () => {
    const res = await fetch(`${TEST_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{json hỏng',
      signal: AbortSignal.timeout(30_000),
    });
    eq(res.status, 400, 'HTTP status');
  });
}

// ============================================================
// B. XÁC THỰC & HỒ SƠ
// ============================================================
async function sectionAuth() {
  console.log('\n=== B. Đăng ký / Đăng nhập / Hồ sơ ===');

  await test('Register thiếu email -> 400', async () => {
    const { status } = await req('POST', '/api/auth/register', { body: { password: 'x' } });
    eq(status, 400, 'HTTP status');
  });

  await test('Register email sai định dạng -> 400', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      body: { email: 'khong-hop-le', password: 'matkhau1' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Register mật khẩu < 6 ký tự -> 400', async () => {
    const { status } = await req('POST', '/api/auth/register', {
      body: { email: U1.email, password: '123' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Đăng ký U1 thành công -> trả token + user (KHÔNG lộ password)', async () => {
    const { status, data } = await req('POST', '/api/auth/register', { body: U1 });
    eq(status, 201, 'HTTP status');
    ok(typeof data.token === 'string' && data.token.length > 20, 'Thiếu/cấu token');
    eq(data.user.email, U1.email, 'user.email');
    eq(data.user.name, U1.name, 'user.name');
    ok(!('password' in data.user), 'Response làm lộ password!');
    u1Token = data.token;
    u1Id = data.user.id;
  });

  await test('Register trùng email -> 400 kèm thông báo tiếng Việt', async () => {
    const { status, data } = await req('POST', '/api/auth/register', { body: U1 });
    eq(status, 400, 'HTTP status');
    ok(data.error.includes('Email đã được sử dụng'), `Sai message: ${data.error}`);
  });

  await test('Login email không tồn tại -> 404', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      body: { email: `khongton tai.${ts}@example.com`, password: 'whatever' },
    });
    eq(status, 404, 'HTTP status');
  });

  await test('Login sai mật khẩu -> 401', async () => {
    const { status } = await req('POST', '/api/auth/login', {
      body: { email: U1.email, password: 'saimat-khau' },
    });
    eq(status, 401, 'HTTP status');
  });

  await test('Login đúng -> nhận token mới', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
      body: { email: u1Email, password: U1.password },
    });
    eq(status, 200, 'HTTP status');
    ok(data.token.length > 20, 'Thiếu token');
    u1Token = data.token;
  });

  await test('GET /me không có token -> 403', async () => {
    const { status } = await req('GET', '/api/auth/me');
    eq(status, 403, 'HTTP status');
  });

  await test('GET /me sai token -> 401', async () => {
    const { status } = await req('GET', '/api/auth/me', { token: 'token-gia-ma' });
    eq(status, 401, 'HTTP status');
  });

  await test('GET /me đúng -> thông tin khớp U1', async () => {
    const { status, data } = await req('GET', '/api/auth/me', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.email, u1Email, 'email');
    eq(data.id, u1Id, 'id');
  });

  await test('PUT /profile cập nhật tên/bio/avatar -> đọc lại thấy thay đổi', async () => {
    const { status } = await req('PUT', '/api/auth/profile', {
      token: u1Token,
      body: { name: 'Tên Đã Sửa', bio: 'Bio test', avatar: 'https://example.com/a.png' },
    });
    eq(status, 200, 'HTTP status');
    const me = await req('GET', '/api/auth/me', { token: u1Token });
    eq(me.data.name, 'Tên Đã Sửa', 'name');
    eq(me.data.bio, 'Bio test', 'bio');
    eq(me.data.avatar, 'https://example.com/a.png', 'avatar');
  });

  await test('PUT /profile đổi sang email ĐÃ có người dùng (admin seed) -> 400', async () => {
    const { status, data } = await req('PUT', '/api/auth/profile', {
      token: u1Token,
      body: { email: ADMIN_EMAIL },
    });
    eq(status, 400, 'HTTP status');
    ok(data.error.includes('Email đã được sử dụng'), `Sai message: ${data.error}`);
  });

  await test('PUT /profile đổi email hợp lệ -> /me trả email mới', async () => {
    u1Email = `renamed.${ts}@example.com`;
    const { status } = await req('PUT', '/api/auth/profile', {
      token: u1Token,
      body: { email: u1Email },
    });
    eq(status, 200, 'HTTP status');
    const me = await req('GET', '/api/auth/me', { token: u1Token });
    eq(me.data.email, u1Email, 'email sau khi đổi');
  });

  await test('PUT /password với mật khẩu cũ sai -> 401', async () => {
    const { status } = await req('PUT', '/api/auth/password', {
      token: u1Token,
      body: { oldPassword: 'cu-sai', newPassword: 'matkhaumoi1' },
    });
    eq(status, 401, 'HTTP status');
  });

  await test('PUT /password thành công -> login bằng mật khẩu mới OK, cũ FAIL', async () => {
    const { status } = await req('PUT', '/api/auth/password', {
      token: u1Token,
      body: { oldPassword: U1.password, newPassword: 'matkhaumoi1' },
    });
    eq(status, 200, 'HTTP status đổi password');

    const oldLogin = await req('POST', '/api/auth/login', {
      body: { email: u1Email, password: U1.password },
    });
    eq(oldLogin.status, 401, 'Login mật khẩu cũ phải thất bại');

    const newLogin = await req('POST', '/api/auth/login', {
      body: { email: u1Email, password: 'matkhaumoi1' },
    });
    eq(newLogin.status, 200, 'Login mật khẩu mới phải thành công');
    u1Token = newLogin.data.token;
  });

  await test('Đăng ký U2 (phục vụ test phân quyền dữ liệu)', async () => {
    const { status, data } = await req('POST', '/api/auth/register', { body: U2 });
    eq(status, 201, 'HTTP status');
    u2Token = data.token;
  });
}

// ============================================================
// B2. VÍ TIỀN & LUỒNG THANH TOÁN NẠP TIỀN (có quy trình gateway)
//     Tạo đơn -> thanh toán theo phương thức -> xác nhận -> tiền về ví
// ============================================================

// Helper: nạp tiền qua đúng luồng checkout (giả lập khách hàng đi hết các bước)
async function depositViaCheckout(token, amount, method = 'BANK') {
  const created = await req('POST', '/api/auth/wallet/checkout', { token, body: { amount, method } });
  ok(created.status === 201 && created.data.order?.orderCode,
    `Tạo đơn nạp thất bại: ${JSON.stringify(created.data)}`);
  const body = method === 'CARD'
    ? { cardNumber: '4111111111111111', cardName: 'NGUYEN VAN A', expiry: '12/29', otp: '123456' }
    : { confirmed: true };
  const confirmed = await req('POST', `/api/auth/wallet/checkout/${created.data.order.orderCode}/confirm`, { token, body });
  ok(confirmed.status === 200, `Xác nhận đơn nạp thất bại: ${JSON.stringify(confirmed.data)}`);
  return confirmed.data;
}

async function sectionWallet() {
  console.log('\n=== B2. Ví tiền & luồng thanh toán nạp tiền có quy trình ===');

  await test('GET /wallet ban đầu: số dư 0, có danh sách orders', async () => {
    const { status, data } = await req('GET', '/api/auth/wallet', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.balance, 0, 'balance');
    ok(Array.isArray(data.logs), 'logs là mảng');
    ok(Array.isArray(data.orders), 'orders là mảng');
  });

  await test('Tạo đơn với số tiền âm -> 400', async () => {
    const { status } = await req('POST', '/api/auth/wallet/checkout', {
      token: u1Token,
      body: { amount: -1000, method: 'BANK' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Tạo đơn với phương thức không hỗ trợ -> 400', async () => {
    const { status } = await req('POST', '/api/auth/wallet/checkout', {
      token: u1Token,
      body: { amount: 50_000, method: 'PAYPAL' },
    });
    eq(status, 400, 'HTTP status');
  });

  let bankOrderCode;
  await test('BƯỚC 1 - Tạo đơn chuyển khoản 50.000đ -> PENDING, có mã đơn + hạn thanh toán', async () => {
    const { status, data } = await req('POST', '/api/auth/wallet/checkout', {
      token: u1Token,
      body: { amount: 50_000, method: 'BANK' },
    });
    eq(status, 201, 'HTTP status');
    bankOrderCode = data.order.orderCode;
    ok(/^MT\d+$/.test(bankOrderCode), `Mã đơn sai định dạng: ${bankOrderCode}`);
    eq(data.order.status, 'PENDING', 'status khởi tạo');
    eq(data.instructions.amount, 50_000, 'instructions.amount');
    ok(data.instructions.accountNumber, 'Thiếu thông tin tài khoản ngân hàng');
    ok(data.instructions.content.includes(bankOrderCode), 'Nội dung CK phải chứa mã đơn');
  });

  await test('Người KHÁC xác nhận đơn của mình -> 404 (bảo mật)', async () => {
    const { status } = await req('POST', `/api/auth/wallet/checkout/${bankOrderCode}/confirm`, {
      token: u2Token,
      body: { confirmed: true },
    });
    eq(status, 404, 'HTTP status');
  });

  await test('Chưa chuyển khoản mà bấm xác nhận (thiếu confirmed) -> 400', async () => {
    const { status } = await req('POST', `/api/auth/wallet/checkout/${bankOrderCode}/confirm`, {
      token: u1Token,
      body: {},
    });
    eq(status, 400, 'HTTP status');
  });

  await test('BƯỚC 2 - Xác nhận đã chuyển khoản -> tiền về ví (50.000đ)', async () => {
    const { status, data } = await req('POST', `/api/auth/wallet/checkout/${bankOrderCode}/confirm`, {
      token: u1Token,
      body: { confirmed: true },
    });
    eq(status, 200, 'HTTP status');
    eq(data.balance, 50_000, 'balance sau khi được cộng tiền');

    // Log ví ghi nhận biến động kèm mã đơn
    const wallet = await req('GET', '/api/auth/wallet', { token: u1Token });
    eq(wallet.data.logs[0].type, 'DEPOSIT', 'Loại log');
    ok(wallet.data.logs[0].note.includes(bankOrderCode), 'Log nên chứa mã đơn');

    // Đơn chuyển PAID và nằm trong lịch sử orders
    eq(wallet.data.orders[0].orderCode, bankOrderCode, 'Đơn mới nhất trong lịch sử');
    eq(wallet.data.orders[0].status, 'PAID', 'Đơn chuyển sang PAID');
  });

  await test('Xác nhận lại cùng một đơn -> 400 (chống double-payment)', async () => {
    const { status } = await req('POST', `/api/auth/wallet/checkout/${bankOrderCode}/confirm`, {
      token: u1Token,
      body: { confirmed: true },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Huỷ đơn đang chờ -> OK; xác nhận đơn đã huỷ -> 400', async () => {
    const created = await req('POST', '/api/auth/wallet/checkout', {
      token: u1Token,
      body: { amount: 20_000, method: 'MOMO' },
    });
    const code = created.data.order.orderCode;

    const cancel = await req('POST', `/api/auth/wallet/checkout/${code}/cancel`, { token: u1Token });
    eq(cancel.status, 200, 'HTTP status huỷ');

    const conf = await req('POST', `/api/auth/wallet/checkout/${code}/confirm`, {
      token: u1Token,
      body: { confirmed: true },
    });
    eq(conf.status, 400, 'Không được thanh toán đơn đã huỷ');
  });

  let expiredOrderCode;
  await test('Đơn hết hạn -> xác nhận bị từ chối (giả lập quá hạn qua DB)', async () => {
    const created = await req('POST', '/api/auth/wallet/checkout', {
      token: u1Token,
      body: { amount: 30_000, method: 'BANK' },
    });
    eq(created.status, 201, 'HTTP status tạo đơn');
    const code = created.data.order.orderCode;

    // Can thiệp trực tiếp DB: đưa expiresAt về quá khứ (giả lập chờ quá 15 phút)
    require('dotenv').config();
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();
    let dbOk = true;
    try {
      await prisma.paymentOrder.update({
        where: { orderCode: code },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
    } catch (err) {
      // Không nối được DB (VD: sai DATABASE_URL) -> bỏ qua case này thay vì fail dây chuyền
      dbOk = false;
    } finally {
      await prisma.$disconnect();
    }
    if (!dbOk) {
      return skip('Xác nhận đơn hết hạn', 'test này cần DATABASE_URL trỏ đúng DB đang chạy của server');
    }

    const { status, data } = await req('POST', `/api/auth/wallet/checkout/${code}/confirm`, {
      token: u1Token,
      body: { confirmed: true },
    });
    eq(status, 400, 'HTTP status');
    ok(/hết hạn/i.test(data.error || ''), `Thông báo nên nhắc hết hạn: ${data.error}`);
  });

  let cardOrderCode;
  await test('BƯỚC 1 - Tạo đơn thẻ ATM 100.000đ -> hướng dẫn nhập thẻ', async () => {
    const { status, data } = await req('POST', '/api/auth/wallet/checkout', {
      token: u1Token,
      body: { amount: 100_000, method: 'CARD' },
    });
    eq(status, 201, 'HTTP status');
    cardOrderCode = data.order.orderCode;
  });

  await test('OTP thiếu/sai định dạng -> 400', async () => {
    const cases = [
      { cardNumber: '4111111111111111', cardName: 'NGUYEN VAN A', expiry: '12/29', otp: '12345' }, // 5 số
      { cardNumber: '4111111111111111', cardName: 'NGUYEN VAN A', expiry: '12/29' },               // thiếu OTP
      { cardNumber: '1234', cardName: 'NGUYEN VAN A', expiry: '12/29', otp: '123456' },            // thẻ thiếu số
      { cardNumber: '4111111111111111', cardName: 'NV', expiry: '13/29', otp: '123456' },          // sai hạn thẻ
    ];
    for (const body of cases) {
      const { status } = await req('POST', `/api/auth/wallet/checkout/${cardOrderCode}/confirm`, { token: u1Token, body });
      eq(status, 400, `Confirm với ${JSON.stringify(body).slice(0, 40)}...`);
    }
  });

  await test('BƯỚC 2 - Nhập thẻ + OTP đúng -> nạp thành công 100.000đ (ví = 150.000đ)', async () => {
    const { status, data } = await req('POST', `/api/auth/wallet/checkout/${cardOrderCode}/confirm`, {
      token: u1Token,
      body: { cardNumber: '4111 1111 1111 1111', cardName: 'NGUYEN VAN A', expiry: '12/29', otp: '123456' },
    });
    eq(status, 200, 'HTTP status');
    eq(data.balance, 150_000, 'balance (50k + 100k)');
  });
}

// ============================================================
// C. GIAO DỊCH - CRUD + LỌC + PHÂN QUYỀN
// ============================================================
const txState = {};

async function sectionTransactions() {
  console.log('\n=== C. Giao dịch: tạo / xem / sửa / xoá / lọc / phân quyền ===');

  await test('U1 chưa có giao dịch -> mảng rỗng', async () => {
    const { status, data } = await req('GET', '/api/transactions', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.length, 0, 'Số lượng');
  });

  await test('POST thiếu amount -> 400', async () => {
    const { status } = await req('POST', '/api/transactions', {
      token: u1Token,
      body: { type: 'CHI', category: 'Ăn uống' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('POST amount âm -> 400', async () => {
    const { status } = await req('POST', '/api/transactions', {
      token: u1Token,
      body: { amount: -5000, type: 'CHI', category: 'Ăn uống' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('POST type lạ -> 400', async () => {
    const { status } = await req('POST', '/api/transactions', {
      token: u1Token,
      body: { amount: 1000, type: 'VANG LAI', category: 'Khác' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('POST thiếu category -> 400', async () => {
    const { status } = await req('POST', '/api/transactions', {
      token: u1Token,
      body: { amount: 1000, type: 'CHI' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('POST date không hợp lệ -> 400', async () => {
    const { status } = await req('POST', '/api/transactions', {
      token: u1Token,
      body: { amount: 1000, type: 'CHI', category: 'Khác', date: 'ngay-le' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Không có token mà POST giao dịch -> 403', async () => {
    const { status } = await req('POST', '/api/transactions', {
      body: { amount: 1000, type: 'CHI', category: 'Khác' },
    });
    eq(status, 403, 'HTTP status');
  });

  await test('Tạo 6 giao dịch mẫu (thu/chi, tháng này + tháng trước)', async () => {
    const cases = [
      { amount: 15_000_000, type: 'THU', category: 'Lương', description: 'Lương tháng này', date: atDay(CM, 1) },
      { amount: 85_000, type: 'CHI', category: 'Ăn uống', description: 'An trua Burger King', date: atDay(CM, 2) },
      { amount: 450_000, type: 'CHI', category: 'Mua sắm', description: 'Mua quan ao', date: atDay(CM, 3) },
      { amount: 65_000, type: 'CHI', category: 'Ăn uống', description: 'Ca phe sang', date: atDay(CM, 4) },
      { amount: 2_000_000, type: 'THU', category: 'Khác', description: 'Thuong du an', date: atDay(PM, 15) },
      { amount: 300_000, type: 'CHI', category: 'Giải trí', description: 'Xem phim rap', date: atDay(PM, 15) },
    ];
    for (const body of cases) {
      const { status, data } = await req('POST', '/api/transactions', { token: u1Token, body });
      eq(status, 201, `Tạo ${body.description}`);
      ok(isObjectId(data.id), 'Thiếu id (ObjectId) trong response');
      txState[data.description] = data.id;
    }
    eq(Object.keys(txState).length, 6, 'Số giao dịch đã tạo');
  });

  await test('Danh sách sắp xếp mới nhất trước và đủ 6 phần tử', async () => {
    const { status, data } = await req('GET', '/api/transactions', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.length, 6, 'Số lượng');
    ok(new Date(data[0].date) >= new Date(data[5].date), 'Chưa sort giảm dần theo ngày');
  });

  await test('Lọc type=THU -> đúng 2 giao dịch thu', async () => {
    const { data } = await req('GET', '/api/transactions?type=THU', { token: u1Token });
    eq(data.length, 2, 'Số lượng THU');
    data.forEach((tx) => eq(tx.type, 'THU', 'type'));
  });

  await test('Lọc category=Mua sắm -> đúng 1 giao dịch', async () => {
    const { data } = await req('GET', `/api/transactions?category=${encodeURIComponent('Mua sắm')}`, { token: u1Token });
    eq(data.length, 1, 'Số lượng');
    eq(data[0].category, 'Mua sắm', 'category');
  });

  await test('Tìm kiếm q="burger" -> đúng 1 kết quả', async () => {
    const { data } = await req('GET', '/api/transactions?q=burger', { token: u1Token });
    eq(data.length, 1, 'Số lượng');
    ok(data[0].description.toLowerCase().includes('burger'), 'Kết quả không khớp');
  });

  await test(`Lọc month=${CM} -> đúng 4 giao dịch tháng này`, async () => {
    const { data } = await req('GET', `/api/transactions?month=${CM}`, { token: u1Token });
    eq(data.length, 4, 'Số lượng');
  });

  await test('Lọc month sai định dạng -> 400', async () => {
    const { status } = await req('GET', '/api/transactions?month=2026-13', { token: u1Token });
    eq(status, 400, 'HTTP status');
  });

  await test('Lọc from/to phủ trọn tháng trước -> đúng 2 giao dịch', async () => {
    // from/to là NGÀY bao gồm cả đầu-mút (server cộng 1 ngày cho 'to')
    const pmMonthIdx = Number(PM.split('-')[1]) - 1; // 0-based
    const lastDayOfPm = new Date(Date.UTC(Y, M, 0)).getUTCDate(); // ngày cuối tháng trước
    const from = `${PM}-01`;
    const to = `${PM}-${pad(lastDayOfPm)}`;
    const { data } = await req('GET', `/api/transactions?from=${from}&to=${to}`, { token: u1Token });
    eq(data.length, 2, 'Số lượng');
    data.forEach((tx) => ok(tx.date.startsWith(PM), `Giao dịch ngoài khoảng: ${tx.date}`));
  });

  await test('GET chi tiết 1 giao dịch -> đủ các trường', async () => {
    const id = Object.values(txState)[0];
    const { status, data } = await req('GET', `/api/transactions/${id}`, { token: u1Token });
    eq(status, 200, 'HTTP status');
    ['id', 'amount', 'type', 'category', 'description', 'date'].forEach((f) =>
      ok(f in data, `Thiếu trường ${f}`)
    );
  });

  await test('GET giao dịch không tồn tại -> 404', async () => {
    const { status } = await req('GET', '/api/transactions/99999999', { token: u1Token });
    eq(status, 404, 'HTTP status');
  });

  await test('PUT sửa số tiền + danh mục -> đọc lại đúng giá trị mới', async () => {
    const id = txState['Xem phim rap'];
    const { status } = await req('PUT', `/api/transactions/${id}`, {
      token: u1Token,
      body: { amount: 350_000, description: 'Xem phim rap IMAX' },
    });
    eq(status, 200, 'HTTP status');
    const detail = await req('GET', `/api/transactions/${id}`, { token: u1Token });
    eq(detail.data.amount, 350_000, 'amount sau sửa');
    eq(detail.data.description, 'Xem phim rap IMAX', 'description sau sửa');
    // cập nhật lại số kỳ vọng cho các test thống kê phía sau
    EXP.expenseTotal += 50_000;
  });

  await test('PUT giao dịch của người KHÁC -> 404 (bảo mật dữ liệu)', async () => {
    const id = txState['Lương tháng này'];
    const { status } = await req('PUT', `/api/transactions/${id}`, {
      token: u2Token,
      body: { amount: 1 },
    });
    eq(status, 404, 'HTTP status');
  });

  await test('DELETE giao dịch của người KHÁC -> 404', async () => {
    const id = txState['Lương tháng này'];
    const { status } = await req('DELETE', `/api/transactions/${id}`, { token: u2Token });
    eq(status, 404, 'HTTP status');
  });

  await test('DELETE giao dịch của chính mình -> OK và list giảm còn 5', async () => {
    const id = txState['Xem phim rap'];
    const { status } = await req('DELETE', `/api/transactions/${id}`, { token: u1Token });
    eq(status, 200, 'HTTP status');
    EXP.expenseTotal -= 350_000;
    const list = await req('GET', '/api/transactions', { token: u1Token });
    eq(list.data.length, 5, 'Số lượng còn lại');
  });
}

// ============================================================
// D. TOẠ ĐỘ GIAO DỊCH (latitude/longitude - field thường trong Mongo)
// ============================================================
async function sectionLocation() {
  console.log('\n=== D. Toạ độ giao dịch ===');

  await test('POST giao dịch kèm latitude/longitude -> 201', async () => {
    const { status, data } = await req('POST', '/api/transactions', {
      token: u1Token,
      body: {
        amount: 25_000,
        type: 'CHI',
        category: 'Di chuyển',
        description: 'Grab den san bay',
        latitude: 21.0278,
        longitude: 105.8342,
      },
    });
    eq(status, 201, 'HTTP status');
    txState['Grab den san bay'] = data.id;
  });

  await test('GET chi tiết -> trả lại đúng latitude/longitude đã lưu', async () => {
    const id = txState['Grab den san bay'];
    const { data } = await req('GET', `/api/transactions/${id}`, { token: u1Token });
    ok(Math.abs(data.latitude - 21.0278) < 0.0001, `latitude=${data.latitude}`);
    ok(Math.abs(data.longitude - 105.8342) < 0.0001, `longitude=${data.longitude}`);
  });
}

// ============================================================
// E. NGÂN SÁCH
// ============================================================
let budgetId;
async function sectionBudgets() {
  console.log('\n=== E. Ngân sách theo danh mục/tháng ===');

  await test('POST limitAmount = 0 -> 400', async () => {
    const { status } = await req('POST', '/api/budgets', {
      token: u1Token,
      body: { category: 'Ăn uống', limitAmount: 0, month: CM },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('POST month sai định dạng -> 400', async () => {
    const { status } = await req('POST', '/api/budgets', {
      token: u1Token,
      body: { category: 'Ăn uống', limitAmount: 200_000, month: 'thang-nay' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Tạo ngân sách Ăn uống 200.000đ tháng này -> tính đúng spent từ giao dịch', async () => {
    const { status, data } = await req('POST', '/api/budgets', {
      token: u1Token,
      body: { category: 'Ăn uống', limitAmount: 200_000, month: CM },
    });
    eq(status, 201, 'HTTP status');
    budgetId = data.id;
    ok(isObjectId(budgetId), 'Thiếu id');

    const list = await req('GET', `/api/budgets?month=${CM}`, { token: u1Token });
    eq(list.status, 200, 'HTTP status list');
    eq(list.data.length, 1, 'Số ngân sách');
    const b = list.data[0];
    eq(b.spent, 150_000, 'spent (85k + 65k)');
    eq(b.remaining, 50_000, 'remaining');
    eq(b.percentUsed, 75, 'percentUsed');
    eq(b.warning, false, 'warning dưới 80%');
    eq(b.exceeded, false, 'exceeded');
  });

  await test('Tạo trùng danh mục + tháng -> 409', async () => {
    const { status } = await req('POST', '/api/budgets', {
      token: u1Token,
      body: { category: 'Ăn uống', limitAmount: 300_000, month: CM },
    });
    eq(status, 409, 'HTTP status');
  });

  await test('Giảm hạn mức xuống 100.000đ -> cảnh báo vượt (percent 150)', async () => {
    const { status } = await req('PUT', `/api/budgets/${budgetId}`, {
      token: u1Token,
      body: { limitAmount: 100_000 },
    });
    eq(status, 200, 'HTTP status');
    const list = await req('GET', `/api/budgets?month=${CM}`, { token: u1Token });
    const b = list.data[0];
    eq(b.percentUsed, 150, 'percentUsed');
    eq(b.warning, true, 'warning >= 80%');
    eq(b.exceeded, true, 'exceeded');
    eq(b.remaining, 0, 'remaining không âm');
  });

  await test('U2 xem budgets tháng này -> rỗng (phân quyền)', async () => {
    const { data } = await req('GET', `/api/budgets?month=${CM}`, { token: u2Token });
    eq(data.length, 0, 'Số ngân sách của U2');
  });

  await test('DELETE ngân sách -> list rỗng', async () => {
    const { status } = await req('DELETE', `/api/budgets/${budgetId}`, { token: u1Token });
    eq(status, 200, 'HTTP status');
    const list = await req('GET', `/api/budgets?month=${CM}`, { token: u1Token });
    eq(list.data.length, 0, 'Số ngân sách sau xoá');
  });

  await test('Budget mặc định lấy tháng hiện tại khi không truyền month', async () => {
    await req('POST', '/api/budgets', {
      token: u1Token,
      body: { category: 'Mua sắm', limitAmount: 1_000_000 },
    });
    const list = await req('GET', '/api/budgets', { token: u1Token });
    eq(list.data.length, 1, 'Số ngân sách');
    eq(list.data[0].month, CM, 'month mặc định là tháng hiện tại');
    eq(list.data[0].spent, 450_000, 'spent Mua sắm');
  });
}

// ============================================================
// F. TIẾT KIỆM
// ============================================================
let goalId;
async function sectionSavings() {
  console.log('\n=== F. Mục tiêu tiết kiệm ===');

  await test('POST thiếu tên mục tiêu -> 400', async () => {
    const { status } = await req('POST', '/api/savings', {
      token: u1Token,
      body: { targetAmount: 1_000_000 },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('POST targetAmount <= 0 -> 400', async () => {
    const { status } = await req('POST', '/api/savings', {
      token: u1Token,
      body: { name: 'Mua laptop', targetAmount: -5 },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Tạo mục tiêu 1.000.000đ -> percentComplete ban đầu = 0', async () => {
    const { status, data } = await req('POST', '/api/savings', {
      token: u1Token,
      body: {
        name: 'Mục tiêu test',
        targetAmount: 1_000_000,
        monthlyContribution: 100_000,
        deadline: `${Y + 1}-01-01`,
      },
    });
    eq(status, 201, 'HTTP status');
    goalId = data.id;
    eq(data.currentAmount, 0, 'currentAmount');
    eq(data.percentComplete, 0, 'percentComplete');
    eq(data.status, 'IN_PROGRESS', 'status');
  });

  await test('Deposit số âm -> 400', async () => {
    const { status } = await req('POST', `/api/savings/${goalId}/deposit`, {
      token: u1Token,
      body: { amount: -1000 },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('Deposit 400.000đ -> 40% hoàn thành, vẫn IN_PROGRESS', async () => {
    const { status, data } = await req('POST', `/api/savings/${goalId}/deposit`, {
      token: u1Token,
      body: { amount: 400_000 },
    });
    eq(status, 200, 'HTTP status');
    eq(data.goal.currentAmount, 400_000, 'currentAmount');
    eq(data.goal.percentComplete, 40, 'percentComplete');
    eq(data.goal.status, 'IN_PROGRESS', 'status');
  });

  await test('Deposit thêm 700.000đ -> vượt mục tiêu -> tự COMPLETED, % chặn ở 100', async () => {
    const { status, data } = await req('POST', `/api/savings/${goalId}/deposit`, {
      token: u1Token,
      body: { amount: 700_000 },
    });
    eq(status, 200, 'HTTP status');
    eq(data.goal.currentAmount, 1_100_000, 'currentAmount');
    eq(data.goal.status, 'COMPLETED', 'status tự hoàn tất');
    eq(data.goal.percentComplete, 100, 'percentComplete chạm trần 100');
  });

  await test('PUT đổi tên + tăng mục tiêu -> trạng thái quay lại IN_PROGRESS', async () => {
    const { status, data } = await req('PUT', `/api/savings/${goalId}`, {
      token: u1Token,
      body: { name: 'Mục tiêu test (mở rộng)', targetAmount: 2_000_000, status: 'IN_PROGRESS' },
    });
    eq(status, 200, 'HTTP status');
    eq(data.name, 'Mục tiêu test (mở rộng)', 'name');
    eq(data.percentComplete, 55, 'percentComplete theo target mới');
    eq(data.status, 'IN_PROGRESS', 'status');
  });

  await test('Tạo thêm mục tiêu rồi xoá -> list chỉ còn 1', async () => {
    const created = await req('POST', '/api/savings', {
      token: u1Token,
      body: { name: 'Mục tiêu sẽ bị xoá', targetAmount: 500_000 },
    });
    eq(created.status, 201, 'HTTP status tạo thêm');

    const del = await req('DELETE', `/api/savings/${created.data.id}`, { token: u1Token });
    eq(del.status, 200, 'HTTP status xoá');

    const list = await req('GET', '/api/savings', { token: u1Token });
    eq(list.data.length, 1, 'Số mục tiêu còn lại');
    eq(list.data[0].id, goalId, 'ID mục tiêu còn lại');
  });

  await test('U2 thao tác goal của U1 -> 404', async () => {
    const { status } = await req('POST', `/api/savings/${goalId}/deposit`, {
      token: u2Token,
      body: { amount: 1000 },
    });
    eq(status, 404, 'HTTP status');
  });
}

// ============================================================
// G. DANH MỤC
// ============================================================
async function sectionCategories() {
  console.log('\n=== G. Danh mục mặc định ===');

  await test('GET categories không token -> 403', async () => {
    const { status } = await req('GET', '/api/categories');
    eq(status, 403, 'HTTP status');
  });

  await test('GET categories -> tự seed đủ 6 danh mục chuẩn FE (icon/màu khớp)', async () => {
    const { status, data } = await req('GET', '/api/categories', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.length, 6, 'Số danh mục');

    const byName = Object.fromEntries(data.map((c) => [c.name, c]));
    ['Ăn uống', 'Mua sắm', 'Di chuyển', 'Giải trí', 'Lương', 'Khác'].forEach((name) =>
      ok(byName[name], `Thiếu danh mục ${name}`)
    );
    eq(byName['Ăn uống'].color, '#f97316', 'color Ăn uống');
    eq(byName['Lương'].type, 'THU', 'type Lương');
    eq(byName['Khác'].type, 'BOTH', 'type Khác');
  });
}

// ============================================================
// H. THỐNG KÊ
// ============================================================
async function sectionStats() {
  console.log('\n=== H. Thống kê & báo cáo ===');

  await test('summary: balance/tổng thu/chi khớp số liệu đã tạo', async () => {
    const { status, data } = await req('GET', '/api/stats/summary', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.totalIncome, EXP.incomeTotal, 'totalIncome');
    eq(data.totalExpense, EXP.expenseTotal, 'totalExpense');
    eq(data.balance, EXP.incomeTotal - EXP.expenseTotal, 'balance');
    eq(data.monthIncome, 15_000_000, 'monthIncome (tháng này)');
    eq(data.monthExpense, 600_000, 'monthExpense (tháng này)');
    eq(data.currentMonth, CM, 'currentMonth');
  });

  await test('monthly (6 tháng): tháng này + tháng trước đúng số liệu', async () => {
    const { status, data } = await req('GET', '/api/stats/monthly?months=6', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.length, 6, 'Số bucket');
    const cur = data[5];
    eq(cur.month, CM, 'bucket cuối là tháng hiện tại');
    eq(cur.thu, 15_000_000, 'thu tháng này');
    eq(cur.chi, 600_000, 'chi tháng này');
    const prev = data[4];
    eq(prev.month, PM, 'bucket áp cuối là tháng trước');
    eq(prev.thu, 2_000_000, 'thu tháng trước');
    eq(prev.chi, 0, 'chi tháng trước (giao dịch Giải trí đã bị sửa rồi xoá)');
    // Tổng toàn bộ chuỗi phải khớp tổng chi thực tế
    const sumChi = data.reduce((s, b) => s + b.chi, 0);
    eq(sumChi, EXP.expenseTotal, 'tổng chi 6 tháng');
  });

  await test('categories?type=CHI: đủ danh mục, sort giảm dần, % chuẩn', async () => {
    // Chi còn lại: Mua sắm 450k (75%), Ăn uống 85k+65k=150k (25%)
    const { status, data } = await req('GET', '/api/stats/categories?type=CHI', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.length, 2, 'Số danh mục chi');
    eq(data[0].category, 'Mua sắm', 'Top danh mục');
    eq(data[0].total, 450_000, 'total Mua sắm');
    eq(data[0].percentage, 75, '% Mua sắm');
    eq(data[1].category, 'Ăn uống', 'Danh mục thứ hai');
    eq(data[1].total, 150_000, 'total Ăn uống');
    eq(data[1].percentage, 25, '% Ăn uống');
    ok(data.reduce((s, c) => s + c.percentage, 0) === 100, 'Tổng % phải = 100');
  });

  await test('trend days=7: đủ 7 điểm, ngày cuối là hôm nay, đều có key thu/chi', async () => {
    const { status, data } = await req('GET', '/api/stats/trend?days=7', { token: u1Token });
    eq(status, 200, 'HTTP status');
    eq(data.length, 7, 'Số điểm');
    const todayKey = new Date().toISOString().slice(0, 10);
    eq(data[6].date, todayKey, 'Điểm cuối là hôm nay (UTC)');
    data.forEach((d) => {
      ok('thu' in d && 'chi' in d, 'Thiếu key thu/chi');
    });
  });

  await test('monthly months=100 -> 400 (giới hạn 24)', async () => {
    const { status } = await req('GET', '/api/stats/monthly?months=100', { token: u1Token });
    eq(status, 400, 'HTTP status');
  });

  await test('summary của U2 khác hoàn toàn U1 (phân quyền thống kê)', async () => {
    const { data } = await req('GET', '/api/stats/summary', { token: u2Token });
    eq(data.totalIncome, 0, 'totalIncome U2');
    eq(data.totalExpense, 0, 'totalExpense U2');
  });
}

// ============================================================
// I. AI PROXY
// ============================================================
async function sectionAi() {
  console.log('\n=== I. AI (Ollama Cloud qua backend) ===');

  if (SKIP_AI) {
    await skip('Toàn nhóm AI', 'SKIP_AI=1');
    return;
  }

  const summary = `Tổng thu nhập: 17.000.000đ\nTổng chi tiêu: 900.000đ\nChi tiêu theo danh mục:\n- Mua sắm: 450.000đ\n- Ăn uống: 150.000đ`;

  await test('POST /api/ai-insights không token -> 403', async () => {
    const { status } = await req('POST', '/api/ai-insights', { body: { summary } });
    eq(status, 403, 'HTTP status');
  });

  await test('POST /api/ai-insights thiếu summary -> 400', async () => {
    const { status } = await req('POST', '/api/ai-insights', { token: u1Token, body: {} });
    eq(status, 400, 'HTTP status');
  });

  await test('POST /api/ai-insights có nội dung -> nhận insight thật từ AI', async () => {
    let out;
    try {
      out = await req('POST', '/api/ai-insights', { token: u1Token, body: { summary } });
    } catch (err) {
      if (err.isNetwork) {
        aiOnline = false;
        return skip('Gọi AI thật', 'máy này không kết nối được Ollama Cloud');
      }
      throw err;
    }
    if (out.status === 500 && /OLLAMA_API_KEY/.test(out.data?.error || '')) {
      return skip('Gọi AI thật', 'server chưa cấu hình OLLAMA_API_KEY');
    }
    if (out.status === 502 || out.status === 429) {
      return skip('Gọi AI thật', `dịch vụ AI từ chối (${out.status}): ${out.data?.error?.slice(0, 80)}`);
    }
    eq(out.status, 200, 'HTTP status');
    ok(typeof out.data.insight === 'string' && out.data.insight.length > 10, 'insight rỗng hoặc quá ngắn');
  });

  if (!aiOnline) {
    await skip('Chatbot AI', 'AI offline');
    await skip('Hạn mức AI (quota)', 'AI offline');
    return;
  }

  await test('POST /api/ai-chat với lịch sử hội thoại -> nhận reply', async () => {
    const { status, data } = await req('POST', '/api/ai-chat', {
      token: u1Token,
      body: {
        message: 'Cho tôi một lời khuyên tiết kiệm ngắn gọn.',
        history: [
          { role: 'user', content: 'Chào bạn' },
          { role: 'assistant', content: 'Chào bạn!' },
        ],
        summary,
      },
    });
    eq(status, 200, 'HTTP status');
    ok(typeof data.reply === 'string' && data.reply.length > 0, 'reply rỗng');
  });

  await test('Vượt hạn mức AI mỗi ngày -> 429 (set quota=1 rồi thử lại)', async () => {
    if (!adminToken) return skip('Quota test', 'chưa có token admin');
    // đã dùng ít nhất 2 lần phía trên -> hạ quota xuống 1 sẽ bị chặn ngay
    const put = await req('PUT', '/api/admin/ai-settings', { token: adminToken, body: { dailyQuota: 1 } });
    eq(put.status, 200, 'HTTP status đặt quota');
    const blocked = await req('POST', '/api/ai-insights', { token: u1Token, body: { summary } });
    eq(blocked.status, 429, 'HTTP status khi vượt quota');
    ok(/hạn mức|ngày/i.test(blocked.data.error || ''), 'Thông báo nên nhắc tới hạn mức/ngày');
    // trả lại quota mặc định
    const restore = await req('PUT', '/api/admin/ai-settings', { token: adminToken, body: { dailyQuota: 50 } });
    eq(restore.status, 200, 'HTTP status trả lại quota');
  });
}

// ============================================================
// J. ADMIN
// ============================================================
async function sectionAdmin() {
  console.log('\n=== J. Quản trị viên ===');

  await test('Admin đăng nhập bằng tài khoản seed mặc định', async () => {
    const { status, data } = await req('POST', '/api/auth/login', {
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    if (status !== 200) {
      return skip('Toàn nhóm Admin', `không login được admin (${ADMIN_EMAIL}). Hãy chạy: npm run db:seed`);
    }
    eq(status, 200, 'HTTP status');
    adminToken = data.token;
    adminId = data.user.id;
    eq(data.user.role, 'ADMIN', 'role');
  });

  if (!adminToken) return;

  await test('User thường gọi API admin -> 403', async () => {
    const { status } = await req('GET', '/api/admin/users', { token: u1Token });
    eq(status, 403, 'HTTP status');
  });

  await test('GET /admin/users -> có cả user test + đếm số liệu kèm theo', async () => {
    const { status, data } = await req('GET', '/api/admin/users', { token: adminToken });
    eq(status, 200, 'HTTP status');
    ok(Array.isArray(data) && data.length >= 3, `Cần >= 3 user, nhận ${data.length}`);
    const u1Row = data.find((u) => u.email === u1Email);
    ok(u1Row, `Không tìm thấy U1 (${u1Email})`);
    eq(u1Row.counts.transactions, 5, 'U1 số transaction');
    ok(!('password' in u1Row), 'List admin làm lộ password!');
  });

  await test('GET /admin/users?q= lọc theo tên/email', async () => {
    const { data } = await req('GET', `/api/admin/users?q=${encodeURIComponent(U2.email)}`, { token: adminToken });
    eq(data.length, 1, 'Số kết quả');
    eq(data[0].email, U2.email, 'email');
  });

  await test('Block U2 -> U2 bị chặn mọi API (403) kể cả token còn hạn', async () => {
    const users = await req('GET', `/api/admin/users?q=${encodeURIComponent(U2.email)}`, { token: adminToken });
    const u2Id = users.data[0].id;
    const put = await req('PUT', `/api/admin/users/${u2Id}/status`, {
      token: adminToken,
      body: { status: 'BLOCKED' },
    });
    eq(put.status, 200, 'HTTP status block');

    const blockedCall = await req('GET', '/api/transactions', { token: u2Token });
    eq(blockedCall.status, 403, 'U2 bị chặn sau block');
    ok(/khóa/i.test(blockedCall.data.error || ''), 'Thông báo nhắc tài khoản bị khóa');

    const unblock = await req('PUT', `/api/admin/users/${u2Id}/status`, {
      token: adminToken,
      body: { status: 'ACTIVE' },
    });
    eq(unblock.status, 200, 'HTTP status unblock');
    const afterUnblock = await req('GET', '/api/transactions', { token: u2Token });
    eq(afterUnblock.status, 200, 'U2 hoạt động trở lại');
  });

  await test('Admin tự block chính mình -> 400 (an toàn)', async () => {
    const { status } = await req('PUT', `/api/admin/users/${adminId}/status`, {
      token: adminToken,
      body: { status: 'BLOCKED' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('GET /admin/stats -> có tổng quan users/transactions/AI', async () => {
    const { status, data } = await req('GET', '/api/admin/stats', { token: adminToken });
    eq(status, 200, 'HTTP status');
    ok(data.users.total >= 3, 'users.total');
    ok(data.users.active >= 3, 'users.active');
    ok(data.transactions.total >= 5, 'transactions.total');
    ok(typeof data.ai.totalRequests === 'number', 'ai.totalRequests');
    ok(Array.isArray(data.ai.recentLogs), 'ai.recentLogs là mảng');
  });

  await test('CRUD danh mục toàn hệ thống: tạo -> trùng 409 -> sửa -> xoá', async () => {
    const create = await req('POST', '/api/admin/categories', {
      token: adminToken,
      body: { name: 'Sức khỏe', icon: 'heart', color: '#ef4444', type: 'CHI' },
    });
    eq(create.status, 201, 'HTTP status tạo');

    const dup = await req('POST', '/api/admin/categories', {
      token: adminToken,
      body: { name: 'Sức khỏe', type: 'CHI' },
    });
    eq(dup.status, 409, 'HTTP status trùng tên');

    const renamed = await req('PUT', `/api/admin/categories/${create.data.id}`, {
      token: adminToken,
      body: { name: 'Y tế' },
    });
    eq(renamed.status, 200, 'HTTP status sửa');
    eq(renamed.data.name, 'Y tế', 'tên sau khi sửa');

    // user thường nhìn thấy luôn danh mục mới
    const publicList = await req('GET', '/api/categories', { token: u1Token });
    ok(publicList.data.some((c) => c.name === 'Y tế'), 'Danh mục mới chưa xuất hiện cho user');

    const del = await req('DELETE', `/api/admin/categories/${create.data.id}`, { token: adminToken });
    eq(del.status, 200, 'HTTP status xoá');
    const afterDel = await req('GET', '/api/categories', { token: u1Token });
    eq(afterDel.data.length, 6, 'Về lại 6 danh mục chuẩn');
  });

  await test('POST /admin/categories type sai -> 400', async () => {
    const { status } = await req('POST', '/api/admin/categories', {
      token: adminToken,
      body: { name: 'Loai Sai', type: 'ABC' },
    });
    eq(status, 400, 'HTTP status');
  });

  await test('GET/PUT /admin/ai-settings: xem model + quota, đổi rồi trả lại', async () => {
    const got = await req('GET', '/api/admin/ai-settings', { token: adminToken });
    eq(got.status, 200, 'HTTP status GET');
    ok(typeof got.data.model === 'string' && got.data.model.length > 0, 'model rỗng');
    ok(Number.isInteger(got.data.dailyQuota) && got.data.dailyQuota >= 1, 'dailyQuota không hợp lệ');

    const changed = await req('PUT', '/api/admin/ai-settings', {
      token: adminToken,
      body: { model: got.data.model, dailyQuota: 77 },
    });
    eq(changed.status, 200, 'HTTP status PUT');
    eq(changed.data.dailyQuota, 77, 'quota sau khi đổi');

    await req('PUT', '/api/admin/ai-settings', { token: adminToken, body: { dailyQuota: 50 } });
  });
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  const started = Date.now();
  console.log(`\n🧪 CHILOTUS API TEST SUITE -> ${TEST_BASE_URL}`);
  console.log('='.repeat(64));

  // Kiểm tra server sống trước khi chạy
  try {
    await req('GET', '/');
  } catch (err) {
    console.error(`\n❌ Không kết nối được server tại ${TEST_BASE_URL}`);
    console.error('   Hãy chạy: npm run dev  (sau khi đã docker-compose up -d && npm run db:push && npm run db:seed)\n');
    process.exit(1);
  }

  await sectionInfra();
  await sectionAuth();
  await sectionWallet();
  await sectionTransactions();
  await sectionBudgets();
  await sectionSavings();
  await sectionCategories();
  await sectionStats();
  await sectionLocation(); // để CUỐI nhóm dữ liệu vì có thể tạo thêm giao dịch toạ độ
  await sectionAdmin();    // cần chạy trước AI để test quota dùng được token admin
  await sectionAi();

  console.log('\n' + '='.repeat(64));
  console.log(`📊 KẾT QUẢ: ${passCount} PASS | ${failCount} FAIL | ${skipCount} SKIP  (trong ${(Date.now() - started) / 1000}s)`);

  if (failCount > 0) {
    console.log('\n❌ Các case FAILED:');
    results.filter((r) => r.status === 'FAIL').forEach((r, i) => console.log(`   ${i + 1}. ${r.name}\n      ${r.error}`));
  }
  console.log('');
  process.exit(failCount > 0 ? 1 : 0);
})();
