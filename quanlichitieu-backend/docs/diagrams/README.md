# Sơ đồ UML — ChiLotus Backend

Toàn bộ sơ đồ viết bằng **PlantUML** (.puml). Mở bằng:

- VS Code: cài extension `PlantUML` → `Alt+D` để preview (cần Java hoặc dùng server render)
- Online: dán nội dung file vào https://www.plantuml.com/plantuml
- CLI: `plantuml docs/diagrams -o out/ -tpng`

## Danh mục sơ đồ

| # | Loại sơ đồ | File | Phạm vi |
|---|------------|------|---------|
| 1 | **Use Case Diagram** | `01-use-case.puml` | Toàn hệ thống: 27 use case, 4 actor (Khách, User, Admin, Ollama Cloud) |
| 2 | **ERD** | `02-erd.puml` | 8 bảng: users (+plan/ví), transactions (kèm toạ độ), budgets, savings_goals, categories, ai_logs, wallet_logs, app_settings |
| 3 | **Class Diagram** | `03-class-diagram.puml` | Kiến trúc layered: Routes → Middleware → Controllers → Prisma → Entities |

## Sequence Diagram (theo chức năng)

| Chức năng | File |
|-----------|------|
| Đăng ký / Đăng nhập / Hồ sơ / Đổi mật khẩu | `sequence/seq-auth.puml` |
| **Nạp tiền ví → TỰ ĐỘNG nâng cấp Premium** | `sequence/seq-upgrade.puml` |
| Giao dịch: thêm / xem / lọc / sửa / xoá (+ toạ độ) | `sequence/seq-transactions.puml` |
| Ngân sách: đặt hạn mức + tính % + cảnh báo | `sequence/seq-budgets.puml` |
| Tiết kiệm: tạo mục tiêu + deposit tự hoàn tất | `sequence/seq-savings.puml` |
| Thống kê: summary / monthly / categories / trend | `sequence/seq-stats.puml` |
| Trợ lý AI: insights + chatbot + chặn gói Free + quota + log | `sequence/seq-ai.puml` |
| Admin: khoá/mở user, thống kê, danh mục, cấu hình AI | `sequence/seq-admin.puml` |

## Activity Diagram (theo chức năng)

| Chức năng | File |
|-----------|------|
| Đăng ký / Đăng nhập (toàn bộ nhánh lỗi) | `activity/act-auth.puml` |
| Thêm giao dịch: validate + ghi toạ độ atomic | `activity/act-transactions.puml` |
| Ngân sách: đặt hạn mức + 80% cảnh báo / vượt mức | `activity/act-budgets.puml` |
| Tiết kiệm: 4 nhánh thao tác, deposit tự COMPLETED | `activity/act-savings.puml` |
| Admin: khoá/mở khoá user + thống kê hệ thống | `activity/act-admin-block.puml` |

> Sơ đồ khớp 100% với code đang chạy trong `src/` và schema trong `prisma/schema.prisma`
> (đã được kiểm chứng bởi bộ test `scripts/api.test.js` — 83 case PASS).
