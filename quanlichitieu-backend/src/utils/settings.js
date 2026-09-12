/**
 * Bảng cấu hình key-value (AppSetting) với giá trị mặc định.
 * Admin có thể thay đổi qua API /api/admin/ai-settings
 */
const prisma = require('../config/db');

const DEFAULT_SETTINGS = {
  ollama_model: '', // Rỗng = dùng OLLAMA_MODEL trong .env
  ai_daily_quota: '50', // Số câu hỏi AI tối đa mỗi ngày mỗi người dùng
};

async function getSetting(key) {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  if (row && row.value !== '') return row.value;
  return DEFAULT_SETTINGS[key] ?? null;
}

async function setSetting(key, value) {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });
}

module.exports = { getSetting, setSetting, DEFAULT_SETTINGS };
