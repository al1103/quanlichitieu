// ai.js
// Gọi API thật tới backend (thư mục quanlichitieu-backend) — gửi tóm tắt thu chi
// lên server, server mới là nơi gọi tiếp sang Ollama Cloud để phân tích.
// Nhờ vậy API key không bao giờ lộ ra trình duyệt.
// Các request đều kèm Authorization (token lưu ở localStorage bởi api.js).

async function apiGetAiInsight(summary) {
  let res;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof getToken === 'function' && getToken()) {
      headers['Authorization'] = `Bearer ${getToken()}`;
    }
    res = await fetch('/api/ai-insights', {
      method: 'POST',
      headers,
      body: JSON.stringify({ summary })
    });
  } catch (err) {
    // Thường gặp khi backend chưa chạy
    throw new Error('Không gọi được API. Hãy chạy app bằng lệnh "npm run dev" trong thư mục quanlichitieu-backend.');
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('Server đang chạy không hỗ trợ AI. Hãy chạy app bằng lệnh "npm run dev" trong thư mục quanlichitieu-backend.');
  }

  if (!res.ok) throw new Error(data.error || 'Lỗi phân tích AI');
  return data.insight;
}

// Gửi 1 câu hỏi chatbot lên server, kèm lịch sử hội thoại (history) và tóm tắt
// thu chi (summary) để AI trả lời đúng ngữ cảnh tài chính của người dùng.
async function apiChatWithAi(message, history, summary) {
  let res;
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (typeof getToken === 'function' && getToken()) {
      headers['Authorization'] = `Bearer ${getToken()}`;
    }
    res = await fetch('/api/ai-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history, summary })
    });
  } catch (err) {
    throw new Error('Không gọi được API. Hãy chạy app bằng lệnh "npm run dev" trong thư mục quanlichitieu-backend.');
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('Server đang chạy không hỗ trợ AI. Hãy chạy app bằng lệnh "npm run dev" trong thư mục quanlichitieu-backend.');
  }

  if (!res.ok) throw new Error(data.error || 'Lỗi chatbot AI');
  return data.reply;
}
