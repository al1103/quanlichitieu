// icons.js
// Tự động thay thế thẻ <i data-icon="ten-icon"> bằng nội dung SVG thật
// lấy từ file riêng trong thư mục assets/icons/. Mỗi icon là 1 file .svg
// nhỏ, độc lập, dễ mở ra xem/sửa hơn là gộp chung 1 sprite khổng lồ.

const iconCache = {}; // Lưu tạm nội dung icon đã tải để không phải fetch lại

// Tải nội dung 1 file icon .svg (có cache)
async function loadIconFile(name) {
  if (iconCache[name]) return iconCache[name];
  const res = await fetch(`assets/icons/${name}.svg`);
  const svgText = await res.text();
  iconCache[name] = svgText;
  return svgText;
}

// Quét toàn bộ trang (hoặc 1 khu vực) tìm thẻ [data-icon] và thay bằng SVG thật
async function renderIcons(root = document) {
  const placeholders = root.querySelectorAll('[data-icon]');

  await Promise.all(Array.from(placeholders).map(async (el) => {
    const name = el.getAttribute('data-icon');
    try {
      const svgText = await loadIconFile(name);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = svgText.trim();
      const svgEl = wrapper.firstElementChild;
      if (!svgEl) return;

      // Giữ nguyên class (kích thước w-5 h-5, màu text-blue-600...) trên thẻ <i> gốc
      svgEl.setAttribute('class', el.getAttribute('class') || '');
      el.replaceWith(svgEl);
    } catch (err) {
      console.error(`Không tải được icon "${name}"`, err);
    }
  }));
}

// Trang có sidebar/header (dùng layout.js): quét icon sau khi layout đã chèn xong.
document.addEventListener('layoutLoaded', () => renderIcons());

// Trang độc lập không dùng layout.js (VD: login.html): vẫn cần quét icon ngay khi tải trang.
document.addEventListener('DOMContentLoaded', () => renderIcons());
