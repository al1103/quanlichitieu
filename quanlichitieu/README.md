# Hướng dẫn chạy ứng dụng Quản lý chi tiêu

Ứng dụng này sử dụng một server Node.js nhỏ gọn để phục vụ các file tĩnh (HTML/CSS/JS) và làm proxy gọi API AI để phân tích chi tiêu.

## Yêu cầu

- Đã cài đặt [Node.js](https://nodejs.org/) trên máy tính.

## Cách thiết lập và chạy

**Bước 1: Cấu hình API Key cho tính năng AI (Tuỳ chọn nhưng khuyên dùng để dùng tính năng AI)**
1. Mở thư mục `server/`.
2. Copy file `config.example.js` và đổi tên thành `config.js` (để cùng thư mục `server/`).
3. Mở file `config.js` vừa tạo và điền API key thật của bạn vào chỗ `'dan-api-key-cua-ban-vao-day'`.
   *(Nếu bạn không dùng AI hoặc không có key, ứng dụng vẫn chạy bình thường với các tính năng cơ bản, chỉ là tính năng "Phân tích AI" sẽ báo lỗi).*

**Bước 2: Khởi động Server**
1. Mở Terminal (Command Prompt / PowerShell).
2. Di chuyển đến thư mục gốc của dự án (thư mục chứa file này).
3. Chạy lệnh sau:
   ```bash
   node server/server.js
   ```
4. Nếu thấy thông báo `[OK] Server dang chay tai: http://localhost:3000`, server đã khởi động thành công.

**Bước 3: Sử dụng ứng dụng**
1. Mở trình duyệt web (Chrome, Edge, Firefox, Safari...).
2. Truy cập vào địa chỉ: [http://localhost:3000](http://localhost:3000)

## Lưu ý
- Không chia sẻ file `server/config.js` cho người khác hoặc đưa lên Git để bảo mật API key của bạn.
- Bạn có thể đổi cổng mặc định (3000) bằng cách truyền biến môi trường `PORT` khi chạy server, ví dụ: `PORT=8080 node server/server.js` (trên Mac/Linux) hoặc cấu hình tương đương trên Windows.
