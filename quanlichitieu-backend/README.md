# ChiLotus Backend — API quản lý chi tiêu cá nhân

Backend Node.js (Express + Prisma + MongoDB) cho app **ChiLotus**
(thư mục frontend `../quanlichitieu`). Backend phục vụ **cả API lẫn giao diện tĩnh** —
chạy 1 server là có full-stack.

## Tính năng đầy đủ

| Nhóm | Chức năng |
|------|-----------|
| Xác thực | Đăng ký, đăng nhập (JWT 7 ngày), hồ sơ cá nhân, đổi mật khẩu, khoá tài khoản |
| **Gói & Ví tiền** | Gói FREE/PREMIUM, **nạp tiền vào ví** (cổng thanh toán mô phỏng), mua gói **tự động trừ tiền + bật Premium**, lịch sử biến động ví, huỷ gói, admin tặng/set gói |
| Giao dịch | CRUD thu/chi, lọc theo loại/danh mục/tháng/khoảng ngày/từ khoá, toạ độ (latitude/longitude) |
| Ngân sách | Hạn mức theo danh mục/tháng, tự tính % thực chi, cảnh báo >= 80%, chặn trùng |
| Tiết kiệm | CRUD mục tiêu, đóng góp tiền, **tự hoàn tất** khi đủ mục tiêu |
| Thống kê | Tổng quan số dư, xu hướng theo tháng/ngày, breakdown danh mục kèm % |
| Danh mục | 6 danh mục mặc định khớp FE (icon/màu), admin quản lý toàn hệ thống |
| AI *(Premium)* | Proxy Ollama Cloud (`ai-insights`, `ai-chat`), chặn gói Free (403 `PLAN_REQUIRED`), hạn mức câu hỏi/ngày, log usage + chi phí |
| Admin | Quản lý user (khoá/mở, set gói), thống kê hệ thống (+doanh thu Premium), cấu hình model/quota AI |
| **Admin UI** | Trang `admin.html`: dashboard số liệu, quản lý người dùng (tìm kiếm/khoá/set gói), CRUD danh mục, cấu hình AI + log AI gần nhất — link chỉ hiện với role ADMIN |

## Chạy dự án (3 bước)

```bash
# 0. Cài thư viện
npm install

# Bước 1: khởi động DB (bắt buộc cài Docker)
docker-compose up -d

# Bước 2: tạo bảng + dữ liệu mẫu
npm run db:push
npm run db:seed

# Bước 3: chạy server
npm run dev
```

→ Mở **http://localhost:3001** : vừa là giao diện web vừa là API.
(mongo-express quản trị DB: http://localhost:8081 — `admin` / `admin`)

### Tài khoản mẫu (do seed tạo)

| Tài khoản | Mật khẩu | Vai trò | Gói | Dữ liệu kèm theo |
|-----------|----------|---------|-----|------------------|
| `intern@chilotus.com` | `123456` | USER | **PREMIUM** (dùng thử AI luôn) | ~5 tháng giao dịch, ngân sách, mục tiêu tiết kiệm |
| `admin@chilotus.com` | `admin123` | ADMIN | PREMIUM | Quản trị hệ thống |

> Tài khoản tự đăng ký mới sẽ là gói **FREE**: vào trang **Nâng cấp gói** → nạp tiền
> vào ví → bấm mua gói, hệ thống **tự trừ 99.000₫ và bật Premium ngay**.

> ⚙️ AI cần `OLLAMA_API_KEY` trong `.env` (đã điền sẵn key mẫu). Không có key thì app
> vẫn chạy, riêng 2 endpoint AI trả lỗi rõ ràng. Port mặc định **3001** (đổi bằng `.env`).

## Kiểm thử tự động

```bash
npm run test:api          # chạy khi server đang chạy ở localhost:3001
SKIP_AI=1 npm run test:api   # bỏ qua các case gọi AI thật
TEST_BASE_URL=http://khác npm run test:api
```

Bộ test gồm **95 case** phủ toàn bộ luồng: validate input, phân quyền sở hữu dữ liệu,
block/unblock, **nạp tiền ví + tự động nâng cấp Premium + chặn AI gói Free**, quota AI,
toạ độ giao dịch, thống kê đúng số học...
Chi tiết sơ đồ UML từng chức năng: [`docs/diagrams/README.md`](docs/diagrams/README.md).

## Danh sách API

> Trừ `/api/auth/register|login`, mọi API đều cần header
> `Authorization: Bearer <token>` (nhận từ đăng nhập/đăng ký).

### Auth — `/api/auth`
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| POST | `/register` | `{name?, email, password(≥6)}` | `201 {token, user}` (plan mặc định FREE) |
| POST | `/login` | `{email, password}` | `200 {token, user}` |
| GET | `/me` | — | user hiện tại (có `plan`, `walletBalance`) |
| PUT | `/profile` | `{name?, email?, bio?, avatar?}` | `{message, user}` |
| PUT | `/password` | `{oldPassword, newPassword}` | `{message}` |
| GET | `/wallet` | — | `{balance, plan, premiumPrice: 99000, logs[≤20]}` |
| POST | `/wallet/deposit` | `{amount>0 ≤100tr}` | `201 {message, balance}` — nạp tiền mô phỏng |
| POST | `/upgrade` | — | **Trừ 99.000₫ trong ví → tự bật PREMIUM**; thiếu tiền → `400 {code:'INSUFFICIENT_BALANCE'}` |
| POST | `/downgrade` | — | Về Free (không hoàn tiền) |

### Giao dịch — `/api/transactions`
| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/` | Query: `type`, `category`, `q`, `month=YYYY-MM`, `from`, `to`, `limit≤1000`. Trả mảng mới nhất trước |
| POST | `/` | `{amount>0, type:'THU'|'CHI', category, description?, date?, latitude?, longitude?}` → `201` object |
| GET | `/:id` | Chi tiết kèm `latitude/longitude` (nếu đã lưu) |
| PUT | `/:id` | Cập nhật từng phần; chỉ chủ sở hữu |
| DELETE | `/:id` | Chỉ chủ sở hữu → `{message}` |

### Ngân sách — `/api/budgets`
| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/?month=` | Mặc định tháng hiện tại. Item: `{category, limitAmount, spent, remaining, percentUsed, warning(≥80%), exceeded}` |
| POST | `/` | `{category, limitAmount>0, month?}`; trùng (user+category+month) → `409` |
| PUT/DELETE | `/:id` | Sửa hạn mức / xoá |

### Tiết kiệm — `/api/savings`
| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/` | Danh sách + `percentComplete`, đang làm trước |
| POST | `/` | `{name, targetAmount>0, deadline?, monthlyContribution?, currentAmount?}` |
| POST | `/:id/deposit` | `{amount>0}` → tăng tiền, đạt target → **tự COMPLETED** |
| PUT/DELETE | `/:id` | Sửa / xoá mục tiêu |

### Thống kê — `/api/stats`
| Method | Path | Response |
|--------|------|----------|
| GET | `/summary` | `{balance, totalIncome, totalExpense, totalSavings, monthIncome, monthExpense, currentMonth, transactionCount}` |
| GET | `/monthly?months=1..24` | `[{month:'YYYY-MM', thu, chi}]` |
| GET | `/categories?type&month\|from\|to` | `[{category, total, percentage}]` sort giảm dần |
| GET | `/trend?days=1..365` | `[{date:'YYYY-MM-DD', thu, chi}]` (đều ngày 0) |

### Danh mục & AI *(AI chỉ cho gói PREMIUM)*
| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/api/categories` | Tự seed 6 danh mục mặc định lần đầu |
| POST | `/api/ai-insights` | `{summary}` → `{insight}`; gói Free → `403 {code:'PLAN_REQUIRED'}`; vượt quota → 429 |
| POST | `/api/ai-chat` | `{message, history[≤10], summary}` → `{reply}`; chặn gói như trên |

### Admin — `/api/admin/*` (yêu cầu role ADMIN)
| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/users?q=` | Danh sách + `counts.{transactions,budgets,savingsGoals}` |
| PUT | `/users/:id/status` | `{status:'ACTIVE'\|'BLOCKED'}`; không thể tự khoá mình |
| PUT | `/users/:id/plan` | `{plan:'FREE'\|'PREMIUM'}` — tặng/chuyển gói trực tiếp |
| GET | `/stats` | Users, phân bổ gói (`plans.free/premium`), doanh thu Premium, transactions, AI usage, top users, logs |
| GET/POST/PUT/DELETE | `/categories` | Quản lý danh mục toàn hệ thống (`type`: CHI/THU/BOTH) |
| GET/PUT | `/ai-settings` | `{model, dailyQuota}` — lưu vào DB, áp dụng ngay |

## Cấu trúc source

```
src/
├── server.js               # entrypoint
├── app.js                  # mount routes + serve FE tĩnh + error handler
├── config/
│   ├── db.js               # PrismaClient singleton
│   └── ollama.js           # proxy Ollama Cloud + ước lượng chi phí
├── middleware/
│   ├── auth.middleware.js  # verifyToken (+check BLOCKED) / requireAdmin
│   └── error.middleware.js # 404 JSON + error tập trung
├── controllers/            # auth, transaction, budget, saving,
│   ...                     # category, stats, ai, admin
├── routes/                 # khai báo path cho từng controller
└── utils/
    ├── helpers.js          # ApiError, asyncHandler, monthRange...
    └── settings.js         # AppSetting key-value
scripts/
├── seed.js                 # npm run db:seed
└── api.test.js             # npm run test:api (84 case)
docs/diagrams/              # Use Case, ERD, Class, Sequence, Activity
prisma/schema.prisma        # 7 models (User, Transaction,
                            # Budget, SavingsGoal, Category, AiLog, AppSetting)
```

## Ghi chú kỹ thuật

- **MongoDB**: chạy dạng replica set 1 node kể cả ở local (`docker-compose.yml`)
  vì Prisma bắt buộc replica set để dùng `$transaction` (nạp ví, mua gói Premium,
  xác nhận thanh toán...). Id của mọi bảng là `ObjectId` (chuỗi 24 ký tự hex);
  các controller kiểm tra định dạng id trước khi query (`isValidObjectId`) để
  trả `404`/`400` thân thiện thay vì lỗi 500 khi client gửi id sai định dạng.
- **Toạ độ giao dịch**: lưu trực tiếp 2 field `latitude`/`longitude` (Float) —
  không cần kiểu địa lý riêng như PostGIS trên Postgres trước đây.
- **JWT**: payload `{userId}`, hạn 7 ngày. `verifyToken` tra DB mỗi request để
  chặn ngay user bị khoá giữa phiên.
- **Gói Premium & ví tiền**: giá gói nằm ở `src/config/premium.js`
  (override bằng `PREMIUM_PRICE` trong `.env`). Nạp tiền chỉ tăng số dư ví;
  mua gói là 1 `$transaction`: trừ ví + bật `plan=PREMIUM` + ghi `WalletLog`
  (rollback nếu lỗi giữa chừng). AI controller kiểm tra plan TRƯỚC quota,
  trả `403 {code:'PLAN_REQUIRED'}` cho gói Free — FE dựa code này hiện CTA nâng cấp.
- **AI**: key chỉ nằm trong `.env` của server. Model ưu tiên: setting Admin →
  `OLLAMA_MODEL` env → `gpt-oss:20b-cloud`. Mỗi request thành công ghi `AiLog`
  (số token + chi phí ước tính USD) phục vụ thống kê admin.
