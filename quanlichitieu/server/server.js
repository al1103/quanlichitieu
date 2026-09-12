// server/server.js
// Server Node.js nhỏ gọn (không cần cài thư viện ngoài) làm 2 việc:
//   1) Phục vụ file tĩnh của app (HTML/CSS/JS/icon...) như 1 static server bình thường.
//   2) Làm "cầu nối" (proxy) gọi sang Ollama Cloud để phân tích chi tiêu bằng AI.
// Lý do cần proxy này: nếu gọi thẳng Ollama Cloud từ trình duyệt, API key sẽ bị lộ
// trong code JS phía client. Gọi qua server thì key chỉ nằm ở đây, trình duyệt
// không bao giờ nhìn thấy key thật.
//
// Chạy: node server/server.js   (mặc định cổng 3000, đổi bằng biến môi trường PORT)

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');

// Đọc cấu hình API key. Nếu chưa tạo server/config.js thì AI sẽ báo lỗi rõ ràng
// khi bấm nút phân tích, nhưng phần còn lại của app (xem trang, dữ liệu mẫu...)
// vẫn chạy bình thường.
let config = null;
try {
  config = require('./config.js');
} catch (err) {
  console.warn('[AI] Chưa có server/config.js -> tính năng "Nhận xét từ AI" sẽ báo lỗi.');
  console.warn('[AI] Copy server/config.example.js thành server/config.js rồi điền API key Ollama Cloud để bật tính năng này.');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg'
};

// Đọc toàn bộ nội dung request dạng JSON
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (err) { reject(err); }
    });
    req.on('error', reject);
  });
}

// Gọi Ollama Cloud (API dạng /api/chat, giống Ollama chạy local).
// "messages" là mảng hội thoại đầy đủ (system + các lượt hỏi/đáp trước + câu mới nhất).
async function askOllama(messages) {
  const response = await fetch('https://ollama.com/api/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.OLLAMA_API_KEY}`
    },
    body: JSON.stringify({ model: config.OLLAMA_MODEL, messages, stream: false })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama Cloud trả lỗi (mã ${response.status}): ${errText}`);
  }

  const data = await response.json();
  return data.message?.content || 'AI không trả về nội dung nào.';
}

// Câu hệ thống dùng chung: nhắc AI luôn trả lời ngắn gọn, đúng vai trò trợ lý tài chính
function buildSystemMessage(summary) {
  return {
    role: 'system',
    content: 'Bạn là trợ lý tài chính cá nhân, luôn trả lời ngắn gọn bằng tiếng Việt.\n' +
      `Dưới đây là số liệu thu chi hiện tại của người dùng, dùng để trả lời khi cần:\n${summary}`
  };
}

// Xử lý route POST /api/ai-insights: nhận tóm tắt thu chi, trả về vài nhận xét của AI
async function handleAiInsights(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!config || !config.OLLAMA_API_KEY) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Chưa cấu hình API key. Xem hướng dẫn trong server/config.example.js' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!body.summary) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Thiếu dữ liệu chi tiêu để phân tích' }));
      return;
    }

    const messages = [
      buildSystemMessage(body.summary),
      { role: 'user', content: 'Hãy đưa ra 3-4 nhận xét ngắn gọn (mỗi ý 1 dòng, có gạch đầu dòng "-"), chỉ ra danh mục chi nhiều nhất và 1 gợi ý tiết kiệm cụ thể.' }
    ];

    const insight = await askOllama(messages);
    res.writeHead(200);
    res.end(JSON.stringify({ insight }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Xử lý route POST /api/ai-chat: chatbot hỏi đáp tự do về tình hình thu chi
async function handleAiChat(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (!config || !config.OLLAMA_API_KEY) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'Chưa cấu hình API key. Xem hướng dẫn trong server/config.example.js' }));
    return;
  }

  try {
    const body = await readJsonBody(req);
    if (!body.message) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Thiếu câu hỏi' }));
      return;
    }

    // Chỉ giữ tối đa 10 lượt hội thoại gần nhất để tránh gửi payload quá dài
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    const messages = [
      buildSystemMessage(body.summary || '(chưa có dữ liệu giao dịch)'),
      ...history,
      { role: 'user', content: body.message }
    ];

    const reply = await askOllama(messages);
    res.writeHead(200);
    res.end(JSON.stringify({ reply }));
  } catch (error) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
}

// Phục vụ file tĩnh (HTML/CSS/JS/icon...) trong thư mục gốc project
function serveStaticFile(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const filePath = path.join(ROOT_DIR, urlPath === '/' ? 'index.html' : urlPath);

  // Chặn truy cập ra ngoài thư mục project (bảo mật cơ bản)
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end('Truy cập không hợp lệ');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Không tìm thấy file: ' + urlPath);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/ai-insights') {
    handleAiInsights(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/ai-chat') {
    handleAiChat(req, res);
    return;
  }
  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`MoneyTrack đang chạy tại http://localhost:${PORT}`);
});
