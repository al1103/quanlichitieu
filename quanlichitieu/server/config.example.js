// server/config.example.js
// ĐÂY LÀ FILE MẪU. Hãy copy file này thành "config.js" (cùng thư mục server/)
// rồi điền API key Ollama Cloud thật của bạn vào bên dưới.
//
// Cách lấy API key: đăng nhập https://ollama.com -> vào phần API keys -> tạo key mới.
//
// File "config.js" (sau khi copy) chứa key thật nên KHÔNG được chia sẻ hay đưa lên Git.

module.exports = {
  // Dán API key Ollama Cloud của bạn vào đây
  OLLAMA_API_KEY: 'dan-api-key-cua-ban-vao-day',

  // Tên model chạy trên Ollama Cloud. Đổi sang model khác nếu tài khoản bạn dùng model khác.
  OLLAMA_MODEL: 'gpt-oss:20b-cloud'
};
