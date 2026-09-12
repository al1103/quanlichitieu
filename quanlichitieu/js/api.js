// api.js
// Đây là lớp gọi API THẬT tới backend (thư mục quanlichitieu-backend).
// Tên hàm và dữ liệu trả về GIỮ NGUYÊN so với bản giả lập localStorage
// trước đây, nên toàn bộ phần còn lại của app không cần đổi gì cả.
//
// Cách chạy app:
//   cd quanlichitieu-backend && npm run dev
//   -> Mở http://localhost:3001 (backend tự phục vụ luôn giao diện này,
//      nhờ vậy các fetch() tương đối "/api/..." đi thẳng vào API, khỏi lo CORS).
// Nếu bạn mở giao diện bằng server khác, hãy đổi API_BASE bên dưới
// thành địa chỉ backend, ví dụ: const API_BASE = 'http://localhost:3001';

const API_BASE = ''; // Để trống = cùng origin với trang hiện tại

// Lấy token đăng nhập đang lưu trong trình duyệt (localStorage)
function getToken() {
  return localStorage.getItem('token');
}

// Bộ gọi fetch dùng chung: tự gắn token, tự đọc { error } khi có lỗi
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (getToken()) headers['Authorization'] = `Bearer ${getToken()}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Không kết nối được máy chủ. Hãy chắc chắn backend đang chạy (npm run dev).');
  }

  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    // Phản hồi không có body JSON
  }

  if (!res.ok) {
    // Token hết hạn hoặc không hợp lệ -> đăng xuất về trang login (trừ trang login)
    if (res.status === 401 && !window.location.pathname.includes('login.html')) {
      logout();
    }
    throw new Error((data && data.error) || `Lỗi HTTP ${res.status}`);
  }
  return data;
}

// --- ĐĂNG NHẬP / ĐĂNG KÝ ---

async function apiLogin(email, password) {
  if (!email || !password) throw new Error('Vui lòng nhập email và mật khẩu');
  // Backend trả về: { message, token, user: { id, name, email } }
  return apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

async function apiRegister(name, email, password) {
  if (!email || !password) throw new Error('Vui lòng nhập đầy đủ thông tin');
  // Backend trả về: { message, token, user } — đăng ký xong là đăng nhập luôn
  return apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password })
  });
}

// Đăng xuất: xóa token đã lưu và quay về trang đăng nhập
async function logout() {
  try {
    if (getToken()) {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    }
  } catch (e) {
    // Bỏ qua lỗi nếu token đã hết hạn
  }
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'login.html';
}

// --- GIAO DỊCH (THU NHẬP / CHI TIÊU) ---

// Danh sách giao dịch, mới nhất trước (backend đã sort sẵn)
async function apiGetTransactions() {
  return apiFetch('/api/transactions');
}

// Thêm giao dịch mới: { amount, type: 'THU'|'CHI', category, description, date }
async function apiCreateTransaction(txData) {
  return apiFetch('/api/transactions', {
    method: 'POST',
    body: JSON.stringify(txData)
  });
}

async function apiUpdateTransaction(id, txData) {
  return apiFetch(`/api/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(txData)
  });
}

async function apiDeleteTransaction(id) {
  return apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
}

// --- NGÂN SÁCH (budget.html) ---

// month dạng 'YYYY-MM', bỏ trống = tháng hiện tại.
// Mỗi phần tử: { id, category, limitAmount, spent, remaining, percentUsed, warning, exceeded }
async function apiGetBudgets(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  return apiFetch(`/api/budgets${query}`);
}

async function apiCreateBudget(budgetData) {
  return apiFetch('/api/budgets', {
    method: 'POST',
    body: JSON.stringify(budgetData) // { category, limitAmount, month }
  });
}

async function apiUpdateBudget(id, budgetData) {
  return apiFetch(`/api/budgets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(budgetData)
  });
}

async function apiDeleteBudget(id) {
  return apiFetch(`/api/budgets/${id}`, { method: 'DELETE' });
}

// --- CHI CỐ ĐỊNH HÀNG THÁNG (fixed-expenses.html) ---

// Mỗi phần tử: { id, category, description, amount }
async function apiGetFixedExpenses() {
  return apiFetch('/api/fixed-expenses');
}

async function apiCreateFixedExpense(fixedExpenseData) {
  return apiFetch('/api/fixed-expenses', {
    method: 'POST',
    body: JSON.stringify(fixedExpenseData) // { category, description, amount }
  });
}

async function apiUpdateFixedExpense(id, fixedExpenseData) {
  return apiFetch(`/api/fixed-expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(fixedExpenseData)
  });
}

async function apiDeleteFixedExpense(id) {
  return apiFetch(`/api/fixed-expenses/${id}`, { method: 'DELETE' });
}

// --- MỤC TIÊU TIẾT KIỆM (savings.html) ---

// Mỗi phần tử: { id, name, targetAmount, currentAmount, deadline, monthlyContribution, status, percentComplete }
async function apiGetSavingsGoals() {
  return apiFetch('/api/savings');
}

async function apiCreateSavingsGoal(goalData) {
  return apiFetch('/api/savings', {
    method: 'POST',
    body: JSON.stringify(goalData) // { name, targetAmount, deadline, monthlyContribution }
  });
}

async function apiUpdateSavingsGoal(id, goalData) {
  return apiFetch(`/api/savings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(goalData)
  });
}

// Đóng góp thêm tiền vào mục tiêu: { amount }
async function apiDepositToGoal(id, amount) {
  return apiFetch(`/api/savings/${id}/deposit`, {
    method: 'POST',
    body: JSON.stringify({ amount })
  });
}

async function apiDeleteSavingsGoal(id) {
  return apiFetch(`/api/savings/${id}`, { method: 'DELETE' });
}

// --- DANH MỤC & THỐNG KÊ ---

async function apiGetCategories() {
  return apiFetch('/api/categories');
}

// Tổng quan dashboard: { balance, totalIncome, totalExpense, totalSavings, monthIncome, monthExpense, ... }
async function apiGetStatsSummary() {
  return apiFetch('/api/stats/summary');
}

// Thu/chi theo tháng (mặc định 6 tháng): [{ month: 'YYYY-MM', thu, chi }]
async function apiGetMonthlyTrend(months = 6) {
  return apiFetch(`/api/stats/monthly?months=${months}`);
}

// Theo danh mục: [{ category, total, percentage }]
async function apiGetCategoryBreakdown(type = 'CHI') {
  return apiFetch(`/api/stats/categories?type=${encodeURIComponent(type)}`);
}

// Chuỗi theo ngày để vẽ biểu đồ đường: [{ date: 'YYYY-MM-DD', thu, chi }]
async function apiGetDailyTrend(days = 30) {
  return apiFetch(`/api/stats/trend?days=${days}`);
}

// --- ADMIN (quản trị hệ thống — chỉ role ADMIN mới gọi được) ---

async function apiAdminGetUsers(q = '') {
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch(`/api/admin/users${query}`);
}

async function apiAdminSetUserStatus(id, status) {
  return apiFetch(`/api/admin/users/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  });
}

// Thống kê hệ thống: users/transactions/ai
async function apiAdminGetStats() {
  return apiFetch('/api/admin/stats');
}

async function apiAdminGetCategories() {
  return apiFetch('/api/admin/categories');
}

async function apiAdminCreateCategory(catData) {
  return apiFetch('/api/admin/categories', {
    method: 'POST',
    body: JSON.stringify(catData)
  });
}

async function apiAdminUpdateCategory(id, catData) {
  return apiFetch(`/api/admin/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(catData)
  });
}

async function apiAdminDeleteCategory(id) {
  return apiFetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
}

async function apiAdminGetAiSettings() {
  return apiFetch('/api/admin/ai-settings');
}

async function apiAdminUpdateAiSettings(settingsData) {
  return apiFetch('/api/admin/ai-settings', {
    method: 'PUT',
    body: JSON.stringify(settingsData)
  });
}

// --- HỒ SƠ CÁ NHÂN (settings.html) ---

async function apiUpdateProfile(profileData) {
  return apiFetch('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(profileData) // { name, email, bio, avatar }
  });
}

async function apiChangePassword(oldPassword, newPassword) {
  return apiFetch('/api/auth/password', {
    method: 'PUT',
    body: JSON.stringify({ oldPassword, newPassword })
  });
}
