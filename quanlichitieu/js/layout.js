// layout.js
// Tải các phần giao diện dùng chung (sidebar, header, bottom nav, modal)
// từ các file HTML riêng trong thư mục components/, rồi chèn vào đúng vị trí
// trên trang. Nhờ vậy mỗi trang không phải lặp lại code sidebar/header.

// Danh sách các khối layout cần tải: id thẻ chứa <-> file HTML nguồn
const LAYOUT_PARTS = [
  { targetId: 'layout-sidebar', file: 'components/sidebar.html' },
  { targetId: 'layout-bottom-nav', file: 'components/bottom_nav.html' },
  { targetId: 'layout-header', file: 'components/header.html' },
  { targetId: 'layout-modal', file: 'components/modal.html' },
  { targetId: 'layout-chatbot', file: 'components/chatbot.html' }
];

// Tải 1 file HTML và chèn nội dung vào thẻ có id tương ứng
async function loadLayoutPart(part) {
  const target = document.getElementById(part.targetId);
  if (!target) return;
  const res = await fetch(part.file);
  target.innerHTML = await res.text();
}

async function loadLayout() {
  // 1. Tải song song tất cả phần layout (nhanh hơn tải tuần tự)
  await Promise.all(LAYOUT_PARTS.map(loadLayoutPart));

  // 2. Lấy tiêu đề trang (phần trước dấu "-" trong thẻ <title>) để hiển thị lên header
  const headerTitle = document.getElementById('header-page-title');
  if (headerTitle) {
    headerTitle.innerText = document.title.split('-')[0].trim();
  }

  // 3. Bôi sáng menu tương ứng với trang đang mở (so khớp theo tên file URL)
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('#layout-sidebar a, #layout-bottom-nav a').forEach(link => {
    if (link.getAttribute('href') === currentPath) {
      if (link.closest('#layout-sidebar')) {
        link.classList.add('nav-link-active');
      } else {
        link.classList.add('text-blue-600');
        link.classList.remove('text-slate-400');
      }
    }
  });

  // 4. Cá nhân hoá thẻ user ở cuối sidebar theo tài khoản đang đăng nhập
  try {
    const savedUser = JSON.parse(localStorage.getItem('user'));
    if (savedUser) {
      if (savedUser.name) {
        const nameEl = document.querySelector('#layout-sidebar .font-medium.text-slate-900.truncate');
        if (nameEl) nameEl.textContent = savedUser.name;
      }
      // Email tài khoản hiển thị dưới tên trong thẻ user (bấm vào để mở trang cài đặt)
      const emailEl = document.getElementById('sidebar-user-email');
      if (emailEl && savedUser.email) emailEl.textContent = savedUser.email;
      const avatarImg = document.querySelector('#layout-sidebar img[alt="Avatar"]');
      if (avatarImg && savedUser.avatar) avatarImg.src = savedUser.avatar;

      // Link "Quản trị hệ thống" chỉ hiện với tài khoản ADMIN
      const isAdmin = savedUser.role === 'ADMIN';
      ['nav-admin-link', 'nav-admin-link-mobile'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden', !isAdmin);
      });
    }
  } catch (err) { /* localStorage trống/hỏng thì giữ nguyên dữ liệu mẫu */ }

  // 5. Báo cho main.js (và icons.js) biết layout đã sẵn sàng để chạy tiếp
  document.dispatchEvent(new Event('layoutLoaded'));
}

document.addEventListener('DOMContentLoaded', loadLayout);
