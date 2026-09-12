/**
 * Cấu hình kết nối tới Ollama Cloud cho tính năng AI.
 * API key CHỈ nằm trong file .env của server (không bao giờ lưu vào DB hay trả về client).
 */
const prisma = require('./db');
const { ApiError } = require('../utils/helpers');
const { getSetting } = require('../utils/settings');

const OLLAMA_URL = 'https://ollama.com/api/chat';
const FALLBACK_MODEL = 'gpt-oss:20b-cloud';

// Model ưu tiên: setting do Admin đặt -> biến môi trường -> mặc định
async function resolveModel() {
  const fromDb = await getSetting('ollama_model');
  if (fromDb) return fromDb;
  return process.env.OLLAMA_MODEL || FALLBACK_MODEL;
}

/**
 * Gọi Ollama Cloud với một mảng messages theo chuẩn OpenAI-style.
 * Trả về: { model, content, promptTokens, completionTokens }
 */
async function callOllama(messages) {
  const apiKey = process.env.OLLAMA_API_KEY;
  if (!apiKey) {
    throw new ApiError(500, 'Chưa cấu hình API key AI trên server. Vui lòng điền OLLAMA_API_KEY vào file .env.');
  }

  const model = await resolveModel();

  let data;
  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new ApiError(502, `Dịch vụ AI trả về lỗi (${response.status}). ${detail.slice(0, 200)}`);
    }
    data = await response.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'Không thể kết nối tới dịch vụ AI. Vui lòng thử lại sau.');
  }

  const promptTokens = data.prompt_eval_count || 0;
  const completionTokens = data.eval_count || 0;

  return {
    model,
    content: data.message?.content || 'AI không trả về nội dung nào.',
    promptTokens,
    completionTokens,
  };
}

// Ước lượng chi phí (USD) theo giá tham khảo đầu ra/đầu vào phổ biến
function estimateCost(promptTokens, completionTokens) {
  return Number(((promptTokens * 0.15 + completionTokens * 0.6) / 1_000_000).toFixed(8));
}

module.exports = { callOllama, resolveModel, estimateCost };
