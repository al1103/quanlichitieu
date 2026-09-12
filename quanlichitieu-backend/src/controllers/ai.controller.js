/**
 * Proxy AI (giữ nguyên "hợp đồng" mà Frontend đang gọi):
 * - POST /api/ai-insights  body: { summary }                    -> 200 { insight }
 * - POST /api/ai-chat      body: { message, history, summary }  -> 200 { reply }
 * Lỗi trả về JSON { error } kèm status tương ứng.
 *
 * Mọi request đều được ghi vào bảng AiLog để Admin thống kê,
 * và bị giới hạn bởi hạn mức câu hỏi AI mỗi ngày (AppSetting 'ai_daily_quota').
 */
const prisma = require('../config/db');
const { ApiError, asyncHandler, assert, requireFields, startOfToday } = require('../utils/helpers');
const { getSetting } = require('../utils/settings');
const { callOllama, estimateCost } = require('../config/ollama');

// AI là tính năng trả phí: chỉ tài khoản gói PREMIUM mới được dùng.
// (User nâng cấp bằng cách nạp tiền vào ví rồi mua gói - xem auth.controller)
function checkPlan(user) {
  if (user.plan !== 'PREMIUM') {
    const err = new ApiError(
      403,
      'Chức năng AI chỉ dành cho gói Premium. Vui lòng nạp tiền và nâng cấp gói để sử dụng.'
    );
    err.code = 'PLAN_REQUIRED'; // FE dựa vào code này để hiện nút "Nâng cấp"
    throw err;
  }
}

// Giữ nguyên giọng điệu như server cũ của FE
function buildSystemPrompt(summary) {
  return (
    'Bạn là trợ lý tài chính cá nhân, luôn trả lời ngắn gọn bằng tiếng Việt.\n' +
    `Dưới đây là số liệu thu chi hiện tại của người dùng:\n${summary || '(chưa có dữ liệu)'}`
  );
}

async function checkQuota(userId) {
  const quota = parseInt((await getSetting('ai_daily_quota')) || '50', 10);
  if (!Number.isFinite(quota) || quota <= 0) return; // quota <= 0 coi như không giới hạn

  const used = await prisma.aiLog.count({
    where: { userId, endpoint: { in: ['ai-insights', 'ai-chat'] }, createdAt: { gte: startOfToday() } },
  });
  assert(used < quota, 429, `Bạn đã đạt hạn mức ${quota} câu hỏi AI mỗi ngày. Vui lòng thử lại vào ngày mai.`);
}

async function logUsage(userId, endpoint, result) {
  try {
    await prisma.aiLog.create({
      data: {
        userId,
        endpoint,
        model: result.model,
        tokens: result.promptTokens + result.completionTokens,
        costEstimate: estimateCost(result.promptTokens, result.completionTokens),
      },
    });
  } catch (err) {
    // Ghi log thất bại không làm hỏng kết quả đã tạo
    console.error('[AI LOG]', err.message);
  }
}

// POST /api/ai-insights
exports.getInsights = asyncHandler(async (req, res) => {
  requireFields(req.body, ['summary']);
  checkPlan(req.user);
  await checkQuota(req.userId);

  const messages = [
    { role: 'system', content: buildSystemPrompt(String(req.body.summary)) },
    { role: 'user', content: 'Hãy đưa ra nhận xét và một vài lời khuyên tài chính ngắn gọn từ số liệu trên.' },
  ];

  const result = await callOllama(messages);
  await logUsage(req.userId, 'ai-insights', result);

  res.json({ insight: result.content });
});

// POST /api/ai-chat
exports.chat = asyncHandler(async (req, res) => {
  requireFields(req.body, ['message']);
  assert(String(req.body.message).trim() !== '', 400, 'Câu hỏi không được để trống.');
  checkPlan(req.user);
  await checkQuota(req.userId);

  // Chỉ giữ tối đa 10 lượt hội thoại gần nhất, đúng như server cũ của FE
  const history = Array.isArray(req.body.history)
    ? req.body.history
        .filter((m) => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string')
        .slice(-10)
    : [];

  const messages = [
    { role: 'system', content: buildSystemPrompt(String(req.body.summary || '')) },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: String(req.body.message) },
  ];

  const result = await callOllama(messages);
  await logUsage(req.userId, 'ai-chat', result);

  res.json({ reply: result.content });
});
