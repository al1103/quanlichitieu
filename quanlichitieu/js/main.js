// main.js
// File JS chính của toàn bộ app: kiểm tra đăng nhập, hiển thị danh sách
// giao dịch, tìm kiếm, vẽ biểu đồ báo cáo, chatbot AI, và xử lý popup thêm giao dịch.
// Chỉ chạy sau khi layout (sidebar, header...) đã được chèn xong.
document.addEventListener('layoutLoaded', () => {

  // --- 1. KIỂM TRA ĐĂNG NHẬP: chưa có token thì đá về trang đăng nhập ---
  if (!getToken() && !window.location.pathname.includes('login.html')) {
    window.location.href = 'login.html';
    return;
  }

  // --- 1.5 ĐỒNG BỘ THÔNG TIN TÀI KHOẢN MỚI NHẤT TỪ SERVER ---
  // Luôn lấy bản mới nhất từ /me để tên/avatar/email trên sidebar luôn đúng.
  apiFetch('/api/auth/me')
    .then(latestUser => {
      localStorage.setItem('user', JSON.stringify(latestUser));
      const sidebarEmailEl = document.getElementById('sidebar-user-email');
      if (sidebarEmailEl && latestUser.email) sidebarEmailEl.textContent = latestUser.email;
    })
    .catch(() => { /* token hết hạn đã được apiFetch xử lý (đá về login) */ });

  // --- 2. HÀM TIỆN ÍCH DÙNG CHUNG ---

  // Định dạng số tiền theo kiểu Việt Nam, VD: 1500000 -> "1.500.000 ₫"
  const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

  // Định dạng ngày, VD: "2026-08-12" -> "12 Aug 2026"
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  // Icon + màu nền hiển thị theo từng danh mục giao dịch
  const getIconForCategory = (cat) => {
    const map = {
      'Ăn uống':   { icon: 'utensils',        colorClass: 'tx-icon-orange' },
      'Mua sắm':   { icon: 'shopping-bag',    colorClass: 'tx-icon-blue' },
      'Di chuyển': { icon: 'car',             colorClass: 'tx-icon-yellow' },
      'Giải trí':  { icon: 'film',            colorClass: 'tx-icon-purple' },
      'Lương':     { icon: 'banknote',        colorClass: 'tx-icon-emerald' },
      'Khác':      { icon: 'more-horizontal', colorClass: 'tx-icon-slate' }
    };
    return map[cat] || map['Khác'];
  };

  // Màu vẽ biểu đồ theo từng danh mục (dùng ở trang Thống kê & báo cáo)
  const CATEGORY_CHART_COLORS = {
    'Ăn uống': '#f97316',
    'Mua sắm': '#3b82f6',
    'Di chuyển': '#eab308',
    'Giải trí': '#a855f7',
    'Khác': '#64748b'
  };

  // Tóm tắt số liệu thu/chi thành đoạn text ngắn để gửi cho AI (dùng chung cho
  // cả nút "Phân tích chi tiêu" và chatbot), không gửi nguyên dữ liệu giao dịch thô.
  const buildFinanceSummaryText = (transactions) => {
    let totalIncome = 0;
    let totalExpense = 0;
    const categoryTotals = {};

    transactions.forEach(tx => {
      if (tx.type === 'THU') {
        totalIncome += tx.amount;
      } else {
        totalExpense += tx.amount;
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      }
    });

    const categoryLines = Object.entries(categoryTotals)
      .map(([cat, amount]) => `- ${cat}: ${formatCurrency(amount)}`)
      .join('\n') || '- (không có khoản chi nào)';

    return `Tổng thu nhập: ${formatCurrency(totalIncome)}\n` +
      `Tổng chi tiêu: ${formatCurrency(totalExpense)}\n` +
      `Chi tiêu theo danh mục:\n${categoryLines}`;
  };

  // Hiện thông báo nhỏ (toast) ở góc phải màn hình
  const showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-enter flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium ${
      type === 'success' ? 'bg-white border-emerald-100 text-emerald-800' : 'bg-white border-rose-100 text-rose-800'
    }`;

    const iconName = type === 'success' ? 'check-circle' : 'alert-circle';
    const iconColor = type === 'success' ? 'text-emerald-500' : 'text-rose-500';
    toast.innerHTML = `<i data-icon="${iconName}" class="w-5 h-5 ${iconColor}"></i><span>${message}</span>`;
    container.appendChild(toast);
    renderIcons(toast); // đổi <i data-icon> vừa thêm thành SVG thật

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease-in';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  };

  // Cho phép nơi khác (VD: sau khi thêm giao dịch) yêu cầu chuông thông báo tải lại ngay,
  // thay vì đợi người dùng tự bấm chuông. initNotifications() sẽ gán hàm thật vào đây.
  let refreshNotifications = () => {};

  // --- 3. DỰNG HTML DANH SÁCH GIAO DỊCH (dùng chung cho mọi trang có bảng giao dịch) ---

  // Tạo sẵn HTML cho bảng (desktop) và danh sách thẻ (mobile) từ 1 mảng giao dịch
  const buildTxRowsHtml = (transactions) => {
    let desktopHtml = '';
    let mobileHtml = '';

    transactions.forEach(tx => {
      const style = getIconForCategory(tx.category);
      const amountStr = tx.type === 'THU' ? `+${formatCurrency(tx.amount)}` : `-${formatCurrency(tx.amount)}`;
      const amountClass = tx.type === 'THU' ? 'amount-positive' : 'amount-negative';

      desktopHtml += `
        <tr class="hover:bg-slate-50 transition-colors group">
          <td class="px-5 py-3">
            <div class="flex items-center gap-3">
              <div class="tx-icon ${style.colorClass}">
                <i data-icon="${style.icon}" class="w-4 h-4"></i>
              </div>
              <span class="text-sm font-medium text-slate-900">${tx.description || tx.category}</span>
            </div>
          </td>
          <td class="px-5 py-3 text-sm text-slate-500">${tx.category}</td>
          <td class="px-5 py-3 text-sm text-slate-500">${formatDate(tx.date)}</td>
          <td class="px-5 py-3 text-sm text-right ${amountClass}">${amountStr}</td>
        </tr>
      `;

      mobileHtml += `
        <div class="px-4 py-3 flex justify-between items-center bg-white hover:bg-slate-50">
          <div class="flex items-center gap-3">
            <div class="tx-icon ${style.colorClass}">
              <i data-icon="${style.icon}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <p class="text-sm font-medium text-slate-900 truncate">${tx.description || tx.category}</p>
              <p class="text-xs text-slate-500 truncate">${tx.category} • ${formatDate(tx.date)}</p>
            </div>
          </div>
          <div class="text-sm whitespace-nowrap ml-2 ${amountClass}">${amountStr}</div>
        </div>
      `;
    });

    return { desktopHtml, mobileHtml };
  };

  // Đổ danh sách giao dịch vào bảng + danh sách thẻ của trang hiện tại,
  // rồi quét lại icon vì nội dung mới chèn vào chưa được đổi thành SVG.
  const renderTxList = (transactions) => {
    const tbody = document.getElementById('tx-table-body');
    const mobileList = document.getElementById('tx-mobile-list');
    if (!tbody && !mobileList) return;

    const { desktopHtml, mobileHtml } = buildTxRowsHtml(transactions);
    const emptyRow = '<tr><td colspan="6" class="p-4 text-center text-slate-500 text-sm">Không có giao dịch nào</td></tr>';

    if (tbody) {
      tbody.innerHTML = desktopHtml || emptyRow;
      renderIcons(tbody);
    }
    if (mobileList) {
      mobileList.innerHTML = mobileHtml;
      renderIcons(mobileList);
    }
  };

  // --- 4. TRANG DASHBOARD / GIAO DỊCH / THU NHẬP / CHI TIÊU: tải & hiển thị giao dịch từ API ---
  const renderTransactions = async () => {
    // Trang Tìm kiếm tự quản lý danh sách của nó (xem initSearch), không dùng hàm này
    if (document.getElementById('search-input')) return;
    // Trang Giao dịch có bộ lọc riêng (xem initTxFilters), tự tải và render danh sách
    if (document.getElementById('tx-filter-btn')) return;

    const tbody = document.getElementById('tx-table-body');
    const mobileList = document.getElementById('tx-mobile-list');
    if (!tbody && !mobileList) return;

    // data-tx-filter trên thẻ <body> cho biết trang chỉ hiện Thu nhập (THU) hoặc Chi tiêu (CHI)
    const filterType = document.body.dataset.txFilter;

    try {
      let transactions = await apiGetTransactions();
      if (filterType) {
        transactions = transactions.filter(tx => tx.type === filterType);
      }

      // Trang income.html/expense.html có ô tổng tiền riêng, tính tổng rồi điền vào
      const totalEl = document.getElementById('page-total-amount');
      if (totalEl) {
        const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
        totalEl.textContent = formatCurrency(total);
      }

      renderTxList(transactions);
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  // --- 4.5 TRANG GIAO DỊCH: bộ lọc theo loại / danh mục + bật/tắt chỉ xem tháng này ---
  const initTxFilters = () => {
    const filterBtn = document.getElementById('tx-filter-btn');
    const filterPanel = document.getElementById('tx-filter-panel');
    const typeSelect = document.getElementById('tx-filter-type');
    const categorySelect = document.getElementById('tx-filter-category');
    const clearBtn = document.getElementById('tx-filter-clear-btn');
    const monthBtn = document.getElementById('tx-filter-month-btn');
    const monthLabel = document.getElementById('tx-filter-month-label');
    if (!filterBtn) return;

    let allTransactions = [];
    let monthOnly = false; // false = tất cả thời gian, true = chỉ giao dịch tháng hiện tại

    const isThisMonth = (dateStr) => {
      const d = new Date(dateStr);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    };

    const applyFilters = () => {
      let list = allTransactions;
      if (typeSelect.value) list = list.filter(tx => tx.type === typeSelect.value);
      if (categorySelect.value) list = list.filter(tx => tx.category === categorySelect.value);
      if (monthOnly) list = list.filter(tx => isThisMonth(tx.date));
      renderTxList(list);
    };

    // Đổ danh mục đang thực sự xuất hiện trong giao dịch vào select lọc
    const fillCategoryOptions = () => {
      const cats = [...new Set(allTransactions.map(tx => tx.category))].filter(Boolean).sort();
      const current = categorySelect.value;
      categorySelect.innerHTML = '<option value="">Tất cả danh mục</option>' +
        cats.map(c => `<option value="${c}">${c}</option>`).join('');
      categorySelect.value = current;
    };

    apiGetTransactions()
      .then(transactions => {
        allTransactions = transactions;
        fillCategoryOptions();
        applyFilters();
      })
      .catch(error => showToast(error.message, 'error'));

    // Mở/đóng bảng lọc, đóng khi bấm ra ngoài
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterPanel.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (filterPanel.classList.contains('hidden')) return;
      if (!filterPanel.contains(e.target) && e.target !== filterBtn && !filterBtn.contains(e.target)) {
        filterPanel.classList.add('hidden');
      }
    });

    typeSelect.addEventListener('change', applyFilters);
    categorySelect.addEventListener('change', applyFilters);
    clearBtn.addEventListener('click', () => {
      typeSelect.value = '';
      categorySelect.value = '';
      applyFilters();
    });

    // Bấm để bật/tắt chỉ xem giao dịch trong tháng hiện tại
    monthBtn.addEventListener('click', () => {
      monthOnly = !monthOnly;
      monthLabel.textContent = monthOnly ? 'Tháng này' : 'Tất cả thời gian';
      monthBtn.classList.toggle('btn-primary', monthOnly);
      monthBtn.classList.toggle('btn-secondary', !monthOnly);
      applyFilters();
    });
  };

  // --- 5. TRANG TÌM KIẾM: lọc giao dịch theo từ khóa gõ vào ô tìm kiếm ---
  const initSearch = () => {
    const searchInput = document.getElementById('search-input');
    const statusEl = document.getElementById('search-status');
    if (!searchInput) return;

    let allTransactions = [];

    const runSearch = () => {
      const keyword = searchInput.value.trim().toLowerCase();

      if (!keyword) {
        renderTxList([]);
        statusEl.textContent = 'Nhập từ khóa để tìm kiếm giao dịch.';
        return;
      }

      const results = allTransactions.filter(tx =>
        (tx.description || '').toLowerCase().includes(keyword) ||
        (tx.category || '').toLowerCase().includes(keyword)
      );

      renderTxList(results);
      statusEl.textContent = `Tìm thấy ${results.length} giao dịch phù hợp với "${searchInput.value}".`;
    };

    // Tải toàn bộ giao dịch 1 lần, sau đó lọc ngay trên trình duyệt khi gõ (không gọi lại API)
    apiGetTransactions()
      .then(transactions => { allTransactions = transactions; })
      .catch(error => showToast(error.message, 'error'));

    searchInput.addEventListener('input', runSearch);
  };

  // --- 6. TRANG THỐNG KÊ & BÁO CÁO: tính tổng thu/chi và vẽ biểu đồ ---
  const initReports = async () => {
    const trendCanvas = document.getElementById('reportTrendChart');
    const categoryCanvas = document.getElementById('reportCategoryChart');
    if (!trendCanvas && !categoryCanvas) return;

    try {
      const transactions = await apiGetTransactions();

      // 6.1. Tính tổng thu nhập / tổng chi tiêu / chênh lệch
      let totalIncome = 0;
      let totalExpense = 0;
      transactions.forEach(tx => {
        if (tx.type === 'THU') totalIncome += tx.amount;
        else totalExpense += tx.amount;
      });
      const net = totalIncome - totalExpense;

      const incomeEl = document.getElementById('report-total-income');
      const expenseEl = document.getElementById('report-total-expense');
      const netEl = document.getElementById('report-net');
      if (incomeEl) incomeEl.textContent = formatCurrency(totalIncome);
      if (expenseEl) expenseEl.textContent = formatCurrency(totalExpense);
      if (netEl) {
        netEl.textContent = formatCurrency(net);
        netEl.classList.toggle('text-emerald-600', net >= 0);
        netEl.classList.toggle('text-rose-600', net < 0);
      }

      // 6.2. Gom thu/chi theo từng tháng, chỉ lấy 6 tháng gần nhất có dữ liệu
      const monthlyTotals = {}; // key "YYYY-MM" -> { thu, chi }
      transactions.forEach(tx => {
        const d = new Date(tx.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyTotals[key]) monthlyTotals[key] = { thu: 0, chi: 0 };
        if (tx.type === 'THU') monthlyTotals[key].thu += tx.amount;
        else monthlyTotals[key].chi += tx.amount;
      });
      const sortedMonths = Object.keys(monthlyTotals).sort().slice(-6);
      const monthLabels = sortedMonths.map(key => {
        const [year, month] = key.split('-');
        return `T${parseInt(month, 10)}/${year}`;
      });

      if (trendCanvas && window.Chart) {
        new Chart(trendCanvas, {
          type: 'bar',
          data: {
            labels: monthLabels,
            datasets: [
              { label: 'Thu nhập', data: sortedMonths.map(k => monthlyTotals[k].thu), backgroundColor: '#10b981', borderRadius: 4 },
              { label: 'Chi tiêu', data: sortedMonths.map(k => monthlyTotals[k].chi), backgroundColor: '#f43f5e', borderRadius: 4 }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
      }

      // 6.3. Gom chi tiêu theo danh mục để vẽ biểu đồ tròn
      const categoryTotals = {};
      transactions.filter(tx => tx.type === 'CHI').forEach(tx => {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
      });
      const categories = Object.keys(categoryTotals);
      const categoryColors = categories.map(cat => CATEGORY_CHART_COLORS[cat] || '#64748b');

      if (categoryCanvas && window.Chart && categories.length) {
        new Chart(categoryCanvas, {
          type: 'doughnut',
          data: { labels: categories, datasets: [{ data: categories.map(c => categoryTotals[c]), backgroundColor: categoryColors, borderWidth: 0 }] },
          options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
      }

      // Chú thích màu cho từng danh mục, thay cho legend mặc định của Chart.js
      const legendEl = document.getElementById('reportCategoryLegend');
      if (legendEl) {
        const totalForPct = categories.reduce((sum, c) => sum + categoryTotals[c], 0) || 1;
        legendEl.innerHTML = categories.map((cat, i) => {
          const pct = Math.round((categoryTotals[cat] / totalForPct) * 100);
          return `
            <div class="flex items-center justify-between">
              <span class="flex items-center gap-2 text-slate-600">
                <span class="w-2.5 h-2.5 rounded-full" style="background:${categoryColors[i]}"></span>
                ${cat}
              </span>
              <span class="font-medium text-slate-900">${pct}%</span>
            </div>
          `;
        }).join('') || '<p class="text-slate-500">Chưa có dữ liệu chi tiêu.</p>';
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  };

  // --- 7. NHẬN XÉT CHI TIÊU TỪ AI (trang Thống kê & báo cáo) ---

  // Thông tin user hiện tại (đã lưu khi đăng nhập)
  const getCurrentUser = () => {
    try { return JSON.parse(localStorage.getItem('user')); } catch (err) { return null; }
  };

  const initAiInsights = () => {
    const btn = document.getElementById('ai-insight-btn');
    const contentEl = document.getElementById('ai-insight-content');
    if (!btn || !contentEl) return;

    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const originalHtml = btn.innerHTML;
      btn.innerHTML = 'Đang phân tích...';
      contentEl.textContent = 'AI đang đọc dữ liệu chi tiêu của bạn, vui lòng chờ...';

      try {
        const transactions = await apiGetTransactions();
        const summary = buildFinanceSummaryText(transactions);
        const insight = await apiGetAiInsight(summary);
        contentEl.textContent = insight;
      } catch (error) {
        contentEl.textContent = `Không thể phân tích: ${error.message}`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        renderIcons(btn);
      }
    });
  };

  // --- 8. CHATBOT AI: hỏi đáp tự do về thu chi, hiện trên mọi trang ---
  const initAiChat = () => {
    const toggleBtn = document.getElementById('ai-chat-toggle-btn');
    const panel = document.getElementById('ai-chat-panel');
    const closeBtn = document.getElementById('ai-chat-close-btn');
    const messagesEl = document.getElementById('ai-chat-messages');
    const input = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send-btn');
    if (!toggleBtn || !panel) return;

    // Lịch sử hội thoại lưu tạm trong bộ nhớ (mất khi tải lại trang, đủ dùng cho demo)
    let chatHistory = [];

    toggleBtn.addEventListener('click', () => panel.classList.toggle('hidden'));
    if (closeBtn) closeBtn.addEventListener('click', () => panel.classList.add('hidden'));

    // Thêm 1 bong bóng chat vào khung, "user" thì lệch phải, "assistant" thì lệch trái
    const appendMessage = (role, text) => {
      const bubble = document.createElement('div');
      bubble.className = role === 'user'
        ? 'bg-blue-600 text-white rounded-lg px-3 py-2 max-w-[85%] ml-auto'
        : 'bg-slate-100 text-slate-700 rounded-lg px-3 py-2 max-w-[85%]';
      bubble.textContent = text;
      messagesEl.appendChild(bubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return bubble;
    };

    const sendMessage = async () => {
      const question = input.value.trim();
      if (!question) return;

      input.value = '';
      appendMessage('user', question);
      const thinkingBubble = appendMessage('assistant', 'Đang suy nghĩ...');

      sendBtn.disabled = true;
      try {
        const transactions = await apiGetTransactions();
        const summary = buildFinanceSummaryText(transactions);
        const reply = await apiChatWithAi(question, chatHistory, summary);

        thinkingBubble.textContent = reply;
        // Lưu lại lượt hỏi/đáp này để lần hỏi sau AI vẫn nhớ ngữ cảnh
        chatHistory.push({ role: 'user', content: question });
        chatHistory.push({ role: 'assistant', content: reply });
      } catch (error) {
        thinkingBubble.textContent = `Lỗi: ${error.message}`;
      } finally {
        sendBtn.disabled = false;
      }
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  };

  // --- 8.5 CHUÔNG THÔNG BÁO (header): cảnh báo vượt/sắp vượt ngân sách + mục tiêu tiết kiệm hoàn thành ---
  const initNotifications = () => {
    const bellBtn = document.getElementById('notif-bell-btn');
    const panel = document.getElementById('notif-panel');
    const dot = document.getElementById('notif-dot');
    const listEl = document.getElementById('notif-list');
    if (!bellBtn || !panel) return;

    const emptyHtml = '<p class="px-4 py-6 text-center text-slate-500 text-sm">Không có thông báo nào.</p>';

    const buildRow = (icon, colorClass, title, desc) => `
      <div class="px-4 py-3 flex gap-3 items-start">
        <div class="tx-icon ${colorClass} shrink-0">
          <i data-icon="${icon}" class="w-4 h-4"></i>
        </div>
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-900">${title}</p>
          <p class="text-xs text-slate-500">${desc}</p>
        </div>
      </div>`;

    // Gom cảnh báo ngân sách (vượt/sắp vượt) + mục tiêu tiết kiệm vừa hoàn thành
    const loadNotifications = async () => {
      try {
        const [budgets, goals] = await Promise.all([
          apiGetBudgets().catch(() => []),
          apiGetSavingsGoals().catch(() => [])
        ]);

        const rows = [];
        budgets.forEach(b => {
          if (b.exceeded) {
            rows.push(buildRow('alert-circle', 'tx-icon-rose',
              `Vượt ngân sách "${b.category}"`,
              `Đã chi ${formatCurrency(b.spent)} / hạn mức ${formatCurrency(b.limitAmount)} tháng này.`));
          } else if (b.warning) {
            rows.push(buildRow('alert-circle', 'tx-icon-yellow',
              `Sắp vượt ngân sách "${b.category}"`,
              `Đã dùng ${b.percentUsed}% hạn mức (${formatCurrency(b.spent)} / ${formatCurrency(b.limitAmount)}).`));
          }
        });
        goals.forEach(g => {
          if (g.status === 'COMPLETED') {
            rows.push(buildRow('piggy-bank', 'tx-icon-emerald',
              `Hoàn thành mục tiêu "${g.name}"`,
              `Bạn đã đạt ${formatCurrency(g.targetAmount)}. Chúc mừng!`));
          }
        });

        listEl.innerHTML = rows.join('') || emptyHtml;
        renderIcons(listEl);
        dot.classList.toggle('hidden', rows.length === 0);
      } catch (error) {
        listEl.innerHTML = emptyHtml;
      }
    };

    bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('hidden')) return;
      if (!panel.contains(e.target) && e.target !== bellBtn && !bellBtn.contains(e.target)) {
        panel.classList.add('hidden');
      }
    });

    loadNotifications(); // tải ngay để chấm đỏ hiện đúng trạng thái khi vừa vào trang
    refreshNotifications = loadNotifications; // cho phép nơi khác gọi lại khi có giao dịch mới
  };

  // --- 9. POPUP THÊM GIAO DỊCH MỚI ---
  const modal = document.getElementById('tx-modal');
  const backdrop = document.getElementById('tx-backdrop');
  const card = document.getElementById('tx-card');
  const addTxBtns = document.querySelectorAll('.add-tx-btn');
  const closeBtns = document.querySelectorAll('.close-modal-btn');
  const saveBtn = document.getElementById('save-tx-btn');

  const openModal = () => {
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => {
      backdrop.classList.remove('opacity-0');
      card.classList.remove('opacity-0', 'scale-95');
      card.classList.add('opacity-100', 'scale-100');
    }, 10);
  };

  const closeModal = () => {
    if (!modal) return;
    backdrop.classList.add('opacity-0');
    card.classList.remove('opacity-100', 'scale-100');
    card.classList.add('opacity-0', 'scale-95');
    setTimeout(() => modal.classList.add('hidden'), 300);
  };

  addTxBtns.forEach(btn => btn.addEventListener('click', openModal));
  closeBtns.forEach(btn => btn.addEventListener('click', closeModal));

  // Nút chuyển đổi Thu nhập / Chi tiêu trong popup
  let currentTxType = 'CHI';
  const typeChiBtn = document.getElementById('tx-type-chi');
  const typeThuBtn = document.getElementById('tx-type-thu');

  if (typeChiBtn && typeThuBtn) {
    typeChiBtn.addEventListener('click', () => {
      currentTxType = 'CHI';
      typeChiBtn.className = 'flex-1 py-1.5 bg-white shadow-sm rounded-md text-sm font-medium text-rose-600';
      typeThuBtn.className = 'flex-1 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700';
    });
    typeThuBtn.addEventListener('click', () => {
      currentTxType = 'THU';
      typeThuBtn.className = 'flex-1 py-1.5 bg-white shadow-sm rounded-md text-sm font-medium text-emerald-600';
      typeChiBtn.className = 'flex-1 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700';
    });
  }

  // Bấm "Lưu giao dịch": gửi lên API rồi tải lại danh sách
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const amount = document.getElementById('tx-amount').value;
      const category = document.getElementById('tx-category').value;
      const date = document.getElementById('tx-date').value;
      const desc = document.getElementById('tx-desc').value;

      if (!amount || amount <= 0) {
        showToast('Vui lòng nhập số tiền hợp lệ', 'error');
        return;
      }

      saveBtn.disabled = true;
      saveBtn.innerText = 'Đang lưu...';

      try {
        await apiCreateTransaction({
          amount: parseFloat(amount),
          type: currentTxType,
          category: category,
          description: desc,
          date: date || new Date().toISOString()
        });

        closeModal();
        showToast('Thêm giao dịch thành công!');

        // Tải lại danh sách giao dịch của trang hiện tại (nếu có)
        renderTransactions();
        refreshNotifications(); // cập nhật chuông thông báo ngay (vượt ngân sách, mục tiêu hoàn thành...)

        // Là khoản chi -> kiểm tra luôn xem có vừa làm vượt/sắp vượt ngân sách hạng mục này không
        if (currentTxType === 'CHI') {
          try {
            const budgets = await apiGetBudgets();
            const b = budgets.find(x => x.category === category);
            if (b && b.exceeded) {
              showToast(`Bạn đã chi vượt ngân sách hạng mục "${b.category}"!`, 'error');
            } else if (b && b.warning) {
              showToast(`Sắp vượt ngân sách hạng mục "${b.category}" (đã dùng ${b.percentUsed}%).`, 'error');
            }
          } catch (err) { /* không lấy được ngân sách thì bỏ qua, không chặn luồng thêm giao dịch */ }
        }

        // Xóa trắng form để lần sau nhập tiếp
        document.getElementById('tx-amount').value = '';
        document.getElementById('tx-desc').value = '';
      } catch (error) {
        showToast(error.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Lưu giao dịch';
      }
    });
  }

  // --- 10. MINI POPUP DÙNG CHUNG (thêm ngân sách / mục tiêu / đóng góp tiền) ---
  // Các popup này khai báo ngay trong từng trang HTML, cấu trúc giống tx-modal:
  // có 1 lớp nền .mini-backdrop và 1 khối nội dung .mini-card để làm hiệu ứng.
  const bindMiniModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (!modal) return null;
    const backdrop = modal.querySelector('.mini-backdrop');
    const cardEl = modal.querySelector('.mini-card');

    const open = () => {
      modal.classList.remove('hidden');
      setTimeout(() => {
        backdrop.classList.remove('opacity-0');
        cardEl.classList.remove('opacity-0', 'scale-95');
        cardEl.classList.add('opacity-100', 'scale-100');
      }, 10);
    };

    const close = () => {
      backdrop.classList.add('opacity-0');
      cardEl.classList.remove('opacity-100', 'scale-100');
      cardEl.classList.add('opacity-0', 'scale-95');
      setTimeout(() => modal.classList.add('hidden'), 300);
    };

    modal.querySelectorAll('.close-mini-btn').forEach(btn => btn.addEventListener('click', close));
    if (backdrop) backdrop.addEventListener('click', close);
    return { open, close };
  };

  // --- 11. TRANG DASHBOARD: lời chào, 4 thẻ số liệu và 2 biểu đồ ---
  const initDashboard = () => {
    const balanceEl = document.getElementById('stat-balance');
    if (!balanceEl) return;

    // Lời chào theo tên tài khoản đang đăng nhập (đã lưu ở localStorage khi login)
    try {
      const savedUser = JSON.parse(localStorage.getItem('user'));
      const greetingEl = document.getElementById('dashboard-greeting');
      if (greetingEl && savedUser && savedUser.name) {
        greetingEl.textContent = `Xin chào, ${savedUser.name}`;
      }
    } catch (err) { /* localStorage trống/hỏng thì giữ lời chào mặc định */ }

    // 4 thẻ số liệu lấy từ API thống kê tổng quan
    apiGetStatsSummary()
      .then(s => {
        balanceEl.textContent = formatCurrency(s.balance);
        const incomeEl = document.getElementById('stat-income');
        const expenseEl = document.getElementById('stat-expense');
        const savingsEl = document.getElementById('stat-savings');
        if (incomeEl) incomeEl.textContent = `+${formatCurrency(s.totalIncome)}`;
        if (expenseEl) expenseEl.textContent = `-${formatCurrency(s.totalExpense)}`;
        if (savingsEl) savingsEl.textContent = formatCurrency(s.totalSavings);
      })
      .catch(error => showToast(error.message, 'error'));

    // Biểu đồ đường: 7/30 ngày gần nhất hoặc 6 tháng (theo ô chọn kỳ)
    const lineCanvas = document.getElementById('lineChart');
    let lineChart = null;

    const drawLineChart = async (period) => {
      try {
        let labels, thuData, chiData;
        if (period === '6m') {
          const rows = await apiGetMonthlyTrend(6);
          labels = rows.map(r => `T${parseInt(r.month.split('-')[1], 10)}`);
          thuData = rows.map(r => r.thu);
          chiData = rows.map(r => r.chi);
        } else {
          const rows = await apiGetDailyTrend(parseInt(period, 10));
          labels = rows.map(r => `${r.date.slice(8, 10)}/${r.date.slice(5, 7)}`);
          thuData = rows.map(r => r.thu);
          chiData = rows.map(r => r.chi);
        }
        if (!window.Chart) return;
        if (lineChart) lineChart.destroy(); // vẽ lại thì xoá biểu đồ cũ
        lineChart = new Chart(lineCanvas, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Thu nhập', data: thuData, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.08)', tension: 0.4, fill: true, pointRadius: 2 },
              { label: 'Chi tiêu', data: chiData, borderColor: '#f43f5e', backgroundColor: 'rgba(244,63,94,.08)', tension: 0.4, fill: true, pointRadius: 2 }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxHeight: 6 } } },
            scales: { y: { beginAtZero: true } }
          }
        });
      } catch (error) {
        showToast(error.message, 'error');
      }
    };

    const periodSelect = document.getElementById('trend-period');
    if (periodSelect) {
      drawLineChart(periodSelect.value || '30');
      periodSelect.addEventListener('change', () => drawLineChart(periodSelect.value));
    }

    // Biểu đồ tròn: chi tiêu theo danh mục (màu khớp bảng màu danh mục chung)
    const donutCanvas = document.getElementById('donutChart');
    if (donutCanvas && window.Chart) {
      apiGetCategoryBreakdown('CHI')
        .then(rows => {
          if (!rows.length) return;
          new Chart(donutCanvas, {
            type: 'doughnut',
            data: {
              labels: rows.map(r => r.category),
              datasets: [{
                data: rows.map(r => r.total),
                backgroundColor: rows.map(r => CATEGORY_CHART_COLORS[r.category] || '#64748b'),
                borderWidth: 0
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              cutout: '68%',
              plugins: { legend: { display: false } }
            }
          });
        })
        .catch(() => {}); // chưa có dữ liệu chi thì bỏ qua, đừng làm phiền người dùng
    }
  };

  // --- 12. TRANG NGÂN SÁCH: danh sách hạn mức tháng này + thêm/xoá ---
  const initBudgets = () => {
    const listEl = document.getElementById('budget-list');
    if (!listEl) return;
    const budgetModal = bindMiniModal('budget-modal');

    // Đổ danh mục chi tiêu vào select của popup (từ API danh mục, loại bỏ mục chỉ thu)
    apiGetCategories()
      .then(cats => {
        const sel = document.getElementById('budget-category');
        if (sel) {
          sel.innerHTML = cats
            .filter(c => c.type !== 'THU')
            .map(c => `<option value="${c.name}">${c.name}</option>`)
            .join('');
        }
      })
      .catch(() => {});

    const renderBudgetCard = (b) => {
      const style = getIconForCategory(b.category);
      const badge = b.exceeded
        ? '<span class="text-xs font-medium px-2 py-1 bg-rose-50 text-rose-600 rounded-md border border-rose-200/50">Vượt mức</span>'
        : b.warning
          ? '<span class="text-xs font-medium px-2 py-1 bg-amber-50 text-amber-600 rounded-md border border-amber-200/50">Cảnh báo</span>'
          : '<span class="text-xs font-medium px-2 py-1 bg-slate-100 text-slate-600 rounded-md">Bình thường</span>';
      const barColor = b.exceeded ? 'bg-rose-500' : b.warning ? 'bg-amber-500' : 'bg-blue-500';
      const amountClass = b.exceeded || b.warning ? 'text-amber-600' : 'text-slate-900';

      return `
        <div class="card card-hover p-5">
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
              <div class="tx-icon ${style.colorClass}">
                <i data-icon="${style.icon}" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-semibold text-slate-900">${b.category}</h3>
                <p class="text-xs text-slate-500">Tháng này</p>
              </div>
            </div>
            ${badge}
          </div>
          <div class="mb-2 flex justify-between items-end">
            <div class="text-sm font-medium ${amountClass}">
              ${formatCurrency(b.spent)} <span class="text-slate-400 font-normal">/ ${formatCurrency(b.limitAmount)}</span>
            </div>
            <span class="text-sm font-semibold ${amountClass}">${b.percentUsed}%</span>
          </div>
          <div class="progress-track h-1.5">
            <div class="progress-bar ${barColor}" style="width: ${Math.min(b.percentUsed, 100)}%"></div>
          </div>
          <div class="mt-3 pt-3 border-t border-gray-50 flex justify-end">
            <button class="delete-budget-btn text-xs text-slate-400 hover:text-rose-600 font-medium" data-id="${b.id}">Xoá</button>
          </div>
        </div>`;
    };

    const renderBudgets = async () => {
      try {
        const items = await apiGetBudgets();
        listEl.innerHTML = items.map(renderBudgetCard).join('')
          || '<p class="col-span-full card p-8 text-center text-slate-500 text-sm">Chưa có ngân sách nào cho tháng này. Bấm "Thêm ngân sách" để bắt đầu!</p>';
        renderIcons(listEl);

        listEl.querySelectorAll('.delete-budget-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Xoá ngân sách này?')) return;
            try {
              await apiDeleteBudget(btn.dataset.id);
              showToast('Đã xóa ngân sách.');
              renderBudgets();
              refreshNotifications();
            } catch (error) {
              showToast(error.message, 'error');
            }
          });
        });
      } catch (error) {
        showToast(error.message, 'error');
      }
    };
    renderBudgets();

    document.getElementById('add-budget-btn')?.addEventListener('click', () => budgetModal?.open());
    document.getElementById('save-budget-btn')?.addEventListener('click', async () => {
      const category = document.getElementById('budget-category').value;
      const limitAmount = parseFloat(document.getElementById('budget-limit').value);

      if (!category) { showToast('Vui lòng chọn danh mục', 'error'); return; }
      if (!limitAmount || limitAmount <= 0) { showToast('Vui lòng nhập hạn mức hợp lệ', 'error'); return; }

      try {
        await apiCreateBudget({ category, limitAmount });
        budgetModal?.close();
        document.getElementById('budget-limit').value = '';
        showToast('Thêm ngân sách thành công!');
        renderBudgets();
        refreshNotifications();
      } catch (error) {
        showToast(error.message, 'error'); // VD: 409 đã tồn tại danh mục này trong tháng
      }
    });
  };

  // --- 13. TRANG TIẾT KIỆM: danh sách mục tiêu + thêm/xoá/đóng góp ---
  const GOAL_ICONS = [
    { icon: 'laptop', color: 'stat-icon-blue' },
    { icon: 'shield-alert', color: 'stat-icon-rose' },
    { icon: 'plane-takeoff', color: 'stat-icon-emerald' },
    { icon: 'piggy-bank', color: 'stat-icon-purple' }
  ];

  const initSavingsGoals = () => {
    const listEl = document.getElementById('goal-list');
    if (!listEl) return;
    const goalModal = bindMiniModal('goal-modal');
    const depositModal = bindMiniModal('deposit-modal');
    let depositGoalId = null;

    const fmtDeadline = (d) => {
      if (!d) return 'Không thời hạn';
      const dt = new Date(d);
      return `T${dt.getMonth() + 1} ${dt.getFullYear()}`;
    };
    const pctTextClass = (p) => (p >= 100 ? 'text-emerald-600' : p >= 70 ? 'text-blue-600' : 'text-rose-500');
    const barBgClass = (p) => (p >= 100 ? 'bg-emerald-500' : p >= 70 ? 'bg-blue-600' : 'bg-rose-500');

    const renderGoalCard = (goal, i) => {
      const ic = GOAL_ICONS[i % GOAL_ICONS.length];
      const completed = goal.status === 'COMPLETED';

      return `
        <div class="card card-hover p-5">
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
              <div class="stat-icon ${ic.color}">
                <i data-icon="${ic.icon}" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-semibold text-slate-900">${goal.name}</h3>
                <p class="text-xs text-slate-500">Mục tiêu: ${formatCurrency(goal.targetAmount)}</p>
              </div>
            </div>
            ${completed ? '<span class="text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-200/50">Hoàn thành</span>' : ''}
          </div>

          <div class="mb-2 flex justify-between items-end">
            <div class="text-sm font-semibold text-slate-900">${formatCurrency(goal.currentAmount)}</div>
            <span class="text-xs font-semibold ${pctTextClass(goal.percentComplete)}">${goal.percentComplete}%</span>
          </div>

          <div class="progress-track h-2 mb-3">
            <div class="progress-bar ${barBgClass(goal.percentComplete)}" style="width: ${Math.min(goal.percentComplete, 100)}%"></div>
          </div>

          <div class="flex justify-between items-center gap-2 flex-wrap text-xs text-slate-500 border-t border-gray-50 pt-3 mt-1">
            <span class="flex items-center gap-1"><i data-icon="calendar" class="w-3 h-3"></i> ${fmtDeadline(goal.deadline)}</span>
            <div class="flex items-center gap-2">
              ${goal.monthlyContribution ? `<span class="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">+${formatCurrency(goal.monthlyContribution)}/tháng</span>` : ''}
              ${completed ? '' : `<button class="deposit-btn btn btn-secondary !px-3 !py-1 !text-xs" data-id="${goal.id}" data-name="${goal.name}">Đóng góp</button>`}
              <button class="delete-goal-btn text-rose-400 hover:text-rose-600 font-medium px-1" data-id="${goal.id}">Xoá</button>
            </div>
          </div>
        </div>`;
    };

    const renderGoals = async () => {
      try {
        const goals = await apiGetSavingsGoals();
        listEl.innerHTML = goals.map(renderGoalCard).join('')
          || '<p class="col-span-full card p-8 text-center text-slate-500 text-sm">Chưa có mục tiêu tiết kiệm nào. Bấm "Thêm mục tiêu" để bắt đầu!</p>';
        renderIcons(listEl);

        listEl.querySelectorAll('.deposit-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            depositGoalId = btn.dataset.id;
            document.getElementById('deposit-goal-name').textContent = btn.dataset.name || '';
            document.getElementById('deposit-amount').value = '';
            depositModal?.open();
          });
        });

        listEl.querySelectorAll('.delete-goal-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Xoá mục tiêu tiết kiệm này?')) return;
            try {
              await apiDeleteSavingsGoal(btn.dataset.id);
              showToast('Đã xóa mục tiêu.');
              renderGoals();
            } catch (error) {
              showToast(error.message, 'error');
            }
          });
        });
      } catch (error) {
        showToast(error.message, 'error');
      }
    };
    renderGoals();

    document.getElementById('add-goal-btn')?.addEventListener('click', () => goalModal?.open());

    document.getElementById('save-goal-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('goal-name').value.trim();
      const targetAmount = parseFloat(document.getElementById('goal-target').value);
      const monthlyRaw = document.getElementById('goal-monthly').value;
      const deadline = document.getElementById('goal-deadline').value;

      if (!name) { showToast('Vui lòng nhập tên mục tiêu', 'error'); return; }
      if (!targetAmount || targetAmount <= 0) { showToast('Vui lòng nhập số tiền mục tiêu hợp lệ', 'error'); return; }

      try {
        await apiCreateSavingsGoal({
          name,
          targetAmount,
          monthlyContribution: monthlyRaw ? parseFloat(monthlyRaw) : undefined,
          deadline: deadline || undefined
        });
        goalModal?.close();
        ['goal-name', 'goal-target', 'goal-monthly', 'goal-deadline'].forEach(id => { document.getElementById(id).value = ''; });
        showToast('Thêm mục tiêu thành công!');
        renderGoals();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });

    document.getElementById('save-deposit-btn')?.addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('deposit-amount').value);
      if (!depositGoalId) return;
      if (!amount || amount <= 0) { showToast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }

      try {
        const res = await apiDepositToGoal(depositGoalId, amount);
        depositModal?.close();
        showToast(res.goal?.status === 'COMPLETED'
          ? `Chúc mừng! Mục tiêu "${res.goal.name}" đã hoàn thành!`
          : 'Đóng góp thành công!');
        renderGoals();
        refreshNotifications();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  };

  // --- 14. TRANG CÀI ĐẶT TÀI KHOẢN: chuyển tab, đổi mật khẩu ---
  const initSettings = () => {

    // Chuyển tab bên trái: bật nav-link-active và hiện đúng panel tương ứng
    document.querySelectorAll('#settings-tabs [data-tab]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('#settings-tabs [data-tab]')
          .forEach(l => l.classList.toggle('nav-link-active', l === link));
        document.querySelectorAll('[data-panel]')
          .forEach(p => p.classList.toggle('hidden', p.dataset.panel !== link.dataset.tab));
      });
    });


    // Đổi mật khẩu
    document.getElementById('change-password-btn')?.addEventListener('click', async () => {
      const oldPassword = document.getElementById('old-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      if (!oldPassword || !newPassword) { showToast('Vui lòng nhập đầy đủ mật khẩu', 'error'); return; }
      if (newPassword.length < 6) { showToast('Mật khẩu mới tối thiểu 6 ký tự', 'error'); return; }
      if (newPassword !== confirmPassword) { showToast('Nhập lại mật khẩu mới không khớp', 'error'); return; }

      try {
        await apiChangePassword(oldPassword, newPassword);
        ['old-password', 'new-password', 'confirm-password'].forEach(id => { document.getElementById(id).value = ''; });
        showToast('Đổi mật khẩu thành công!');
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  };

  // --- 16. TRANG QUẢN TRỊ HỆ THỐNG (chỉ role ADMIN) ---
  const initAdminPage = () => {
    if (!document.getElementById('admin-page')) return;

    const contentEl = document.getElementById('admin-content');
    const deniedEl = document.getElementById('admin-denied');
    if (getCurrentUser()?.role !== 'ADMIN') {
      deniedEl.classList.remove('hidden'); // ẩn toàn bộ nội dung quản trị
      return;
    }
    contentEl.classList.remove('hidden');

    // ---- Thẻ số liệu tổng quan + log AI gần nhất ----
    const loadStats = async () => {
      try {
        const s = await apiAdminGetStats();
        document.getElementById('st-users').textContent = s.users.total;
        document.getElementById('st-premium').textContent = s.plans.premium;
        document.getElementById('st-free').textContent = s.plans.free;
        document.getElementById('st-revenue').textContent = formatCurrency(s.revenue);
        document.getElementById('st-ai-today').textContent = s.ai.todayRequests;
        document.getElementById('st-transactions').textContent = s.transactions.total;

        const logsEl = document.getElementById('ai-recent-logs');
        logsEl.innerHTML = (s.ai.recentLogs || []).map(log => `
          <div class="px-5 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-medium text-slate-900 truncate">${log.user ? log.user.email : '(ẩn danh)'} • ${log.endpoint}</p>
              <p class="text-xs text-slate-500">${formatDate(log.createdAt)} • ${log.model} • ${log.tokens} tokens</p>
            </div>
            <span class="text-xs text-slate-400 whitespace-nowrap">~$${(log.costEstimate || 0).toFixed(4)}</span>
          </div>`).join('') || '<p class="px-5 py-6 text-center text-slate-500 text-sm">Chưa có ai dùng AI.</p>';
      } catch (error) {
        showToast(error.message, 'error');
      }
    };

    // ---- Quản lý người dùng: tìm kiếm / khoá-mở / đổi gói ----
    const usersTbody = document.getElementById('admin-users-tbody');

    const renderUsers = async (q = '') => {
      try {
        const users = await apiAdminGetUsers(q);
        usersTbody.innerHTML = users.map(u => {
          const blocked = u.status === 'BLOCKED';
          const statusBadge = blocked
            ? '<span class="text-xs font-medium px-2 py-1 bg-rose-50 text-rose-600 rounded-md border border-rose-200/50">Bị khóa</span>'
            : '<span class="text-xs font-medium px-2 py-1 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-200/50">Hoạt động</span>';
          const roleBadge = u.role === 'ADMIN'
            ? '<span class="text-xs font-semibold px-2 py-1 bg-purple-50 text-purple-600 rounded-md">Admin</span>'
            : '<span class="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-md">User</span>';

          return `
            <tr class="hover:bg-slate-50">
              <td class="px-5 py-3">
                <p class="font-medium text-slate-900">${u.name || '(chưa có tên)'}</p>
                <p class="text-xs text-slate-500">${u.email}</p>
              </td>
              <td class="px-5 py-3">${roleBadge}</td>
              <td class="px-5 py-3">
                <select class="form-input !py-1 !px-2 !text-xs w-auto admin-plan-select" data-id="${u.id}" data-email="${u.email}" ${u.role === 'ADMIN' ? 'disabled' : ''}>
                  <option value="FREE" ${u.plan === 'FREE' ? 'selected' : ''}>Free</option>
                  <option value="PREMIUM" ${u.plan === 'PREMIUM' ? 'selected' : ''}>Premium</option>
                </select>
              </td>
              <td class="px-5 py-3 text-xs text-slate-500">
                ${u.counts.transactions} GD • ${u.counts.budgets} NS • ${u.counts.savingsGoals} TK
              </td>
              <td class="px-5 py-3">${statusBadge}</td>
              <td class="px-5 py-3 text-right">
                ${u.id === getCurrentUser()?.id
                  ? '<span class="text-xs text-slate-400">(bạn)</span>'
                  : `<button class="toggle-block-btn btn btn-secondary !px-3 !py-1.5 !text-xs" data-id="${u.id}" data-status="${u.status}">${blocked ? 'Mở khóa' : 'Khóa'}</button>`}
              </td>
            </tr>`;
        }).join('');
        renderIcons(usersTbody);

        usersTbody.querySelectorAll('.toggle-block-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const nextStatus = btn.dataset.status === 'BLOCKED' ? 'ACTIVE' : 'BLOCKED';
            if (!confirm(`Bạn chắc chắn muốn ${nextStatus === 'BLOCKED' ? 'khóa' : 'mở khóa'} tài khoản này?`)) return;
            try {
              const res = await apiAdminSetUserStatus(btn.dataset.id, nextStatus);
              showToast(res.message);
              renderUsers(document.getElementById('admin-user-search').value.trim());
            } catch (error) { showToast(error.message, 'error'); }
          });
        });

        usersTbody.querySelectorAll('.admin-plan-select').forEach(sel => {
          sel.addEventListener('change', async () => {
            try {
              const res = await apiAdminSetUserPlan(sel.dataset.id, sel.value);
              showToast(`${sel.dataset.email}: ${res.message}`);
            } catch (error) {
              showToast(error.message, 'error');
              renderUsers(document.getElementById('admin-user-search').value.trim()); // trả lại giá trị cũ
            }
          });
        });
      } catch (error) {
        showToast(error.message, 'error');
      }
    };
    renderUsers();

    // Tìm kiếm người dùng (chờ 300ms sau khi ngừng gõ rồi mới gọi API)
    let searchTimer = null;
    document.getElementById('admin-user-search')?.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderUsers(e.target.value.trim()), 300);
    });

    // ---- Quản lý danh mục toàn hệ thống ----
    const catsTbody = document.getElementById('admin-cats-tbody');

    const renderCats = async () => {
      try {
        const cats = await apiAdminGetCategories();
        catsTbody.innerHTML = cats.map(c => {
          const typeLabel = { CHI: 'Chi tiêu', THU: 'Thu nhập', BOTH: 'Cả hai' }[c.type] || c.type;
          return `
            <tr class="hover:bg-slate-50">
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full" style="background:${c.color}"></span>
                  <span class="font-medium text-slate-900">${c.name}</span>
                  <i data-icon="${c.icon}" class="w-4 h-4 text-slate-400"></i>
                </div>
              </td>
              <td class="px-5 py-3 text-slate-500">${typeLabel}</td>
              <td class="px-5 py-3 text-right space-x-2">
                <button class="rename-cat-btn text-xs text-blue-600 hover:underline font-medium" data-id="${c.id}" data-name="${c.name}">Đổi tên</button>
                <button class="delete-cat-btn text-xs text-rose-500 hover:underline font-medium" data-id="${c.id}" data-name="${c.name}">Xoá</button>
              </td>
            </tr>`;
        }).join('');
        renderIcons(catsTbody);

        catsTbody.querySelectorAll('.rename-cat-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const newName = prompt('Tên mới cho danh mục:', btn.dataset.name);
            if (!newName || newName.trim() === btn.dataset.name) return;
            try {
              await apiAdminUpdateCategory(btn.dataset.id, { name: newName.trim() });
              showToast('Đã đổi tên danh mục.');
              renderCats();
            } catch (error) { showToast(error.message, 'error'); }
          });
        });

        catsTbody.querySelectorAll('.delete-cat-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm(`Xoá danh mục "${btn.dataset.name}"? Giao dịch cũ vẫn giữ nguyên tên danh mục.`)) return;
            try {
              await apiAdminDeleteCategory(btn.dataset.id);
              showToast('Đã xóa danh mục.');
              renderCats();
            } catch (error) { showToast(error.message, 'error'); }
          });
        });
      } catch (error) {
        showToast(error.message, 'error');
      }
    };
    renderCats();

    document.getElementById('add-cat-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('cat-name').value.trim();
      const type = document.getElementById('cat-type').value;
      const icon = document.getElementById('cat-icon').value.trim() || 'more-horizontal';
      const color = document.getElementById('cat-color').value;
      if (!name) { showToast('Vui lòng nhập tên danh mục', 'error'); return; }

      try {
        await apiAdminCreateCategory({ name, type, icon, color });
        document.getElementById('cat-name').value = '';
        showToast('Thêm danh mục thành công!');
        renderCats();
      } catch (error) { showToast(error.message, 'error'); }
    });

    // ---- Cấu hình AI ----
    const loadAiSettings = async () => {
      try {
        const s = await apiAdminGetAiSettings();
        document.getElementById('ai-model-input').value = s.model;
        document.getElementById('ai-quota-input').value = s.dailyQuota;
      } catch (error) { showToast(error.message, 'error'); }
    };
    loadAiSettings();

    document.getElementById('save-ai-settings-btn')?.addEventListener('click', async () => {
      const model = document.getElementById('ai-model-input').value.trim();
      const dailyQuota = parseInt(document.getElementById('ai-quota-input').value, 10);
      if (!model) { showToast('Vui lòng nhập tên model', 'error'); return; }
      if (!Number.isFinite(dailyQuota) || dailyQuota < 1) { showToast('Hạn mức phải là số >= 1', 'error'); return; }

      try {
        const res = await apiAdminUpdateAiSettings({ model, dailyQuota });
        showToast(`Đã lưu cấu hình AI (${res.model}, hạn mức ${res.dailyQuota}/ngày).`);
        loadStats(); // làm mới thẻ số liệu
      } catch (error) { showToast(error.message, 'error'); }
    });

    loadStats(); // chạy cuối để log AI hiển thị đúng cấu hình vừa tải
  };

  // --- 17. CHI CỐ ĐỊNH HÀNG THÁNG ---
  const initFixedExpenses = () => {
    const listEl = document.getElementById('fixed-expense-list');
    if (!listEl) return;
    const modal = bindMiniModal('fixed-expense-modal');

    const renderCard = (item) => {
      const style = getIconForCategory(item.category);
      return `
        <div class="card card-hover p-5">
          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
              <div class="tx-icon ${style.colorClass}">
                <i data-icon="${style.icon}" class="w-5 h-5"></i>
              </div>
              <div>
                <h3 class="text-base font-semibold text-slate-900">${item.description || item.category}</h3>
                <p class="text-xs text-slate-500">${item.category}</p>
              </div>
            </div>
          </div>
          <div class="mb-2 flex justify-between items-end">
            <div class="text-sm font-semibold text-rose-600">${formatCurrency(item.amount)}</div>
          </div>
          <div class="mt-3 pt-3 border-t border-gray-50 flex justify-end">
            <button class="delete-fixed-btn text-xs text-slate-400 hover:text-rose-600 font-medium" data-id="${item.id}">Xoá</button>
          </div>
        </div>`;
    };

    const loadData = async () => {
      try {
        const items = await apiGetFixedExpenses();
        let total = items.reduce((sum, i) => sum + i.amount, 0);
        const totalEl = document.getElementById('fixed-expense-total');
        if (totalEl) totalEl.textContent = formatCurrency(total);

        listEl.innerHTML = items.map(renderCard).join('') || 
          '<p class="col-span-full card p-8 text-center text-slate-500 text-sm">Chưa có khoản chi cố định nào. Bấm "Thêm chi cố định" để bắt đầu!</p>';
        renderIcons(listEl);

        listEl.querySelectorAll('.delete-fixed-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (!confirm('Xoá khoản chi cố định này?')) return;
            try {
              await apiDeleteFixedExpense(btn.dataset.id);
              showToast('Đã xóa khoản chi cố định.');
              loadData();
            } catch (error) {
              showToast(error.message, 'error');
            }
          });
        });
      } catch (error) {
        showToast(error.message, 'error');
      }
    };

    loadData();

    document.getElementById('add-fixed-btn')?.addEventListener('click', () => modal?.open());
    document.getElementById('save-fixed-expense-btn')?.addEventListener('click', async () => {
      const category = document.getElementById('fixed-expense-category').value;
      const desc = document.getElementById('fixed-expense-desc').value.trim();
      const amount = parseFloat(document.getElementById('fixed-expense-amount').value);

      if (!amount || amount <= 0) { showToast('Vui lòng nhập số tiền hợp lệ', 'error'); return; }

      try {
        await apiCreateFixedExpense({ category, description: desc, amount });
        modal?.close();
        document.getElementById('fixed-expense-amount').value = '';
        document.getElementById('fixed-expense-desc').value = '';
        showToast('Thêm khoản chi cố định thành công!');
        loadData();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  };

  // --- 18. CHẠY CÁC HÀM KHỞI TẠO THEO TỪNG TRANG ---
  renderTransactions(); // Dashboard / Giao dịch / Thu nhập / Chi tiêu
  initTxFilters();      // Bộ lọc trang Giao dịch (loại / danh mục / tháng này)
  initNotifications();  // Chuông thông báo ở header (vượt ngân sách, mục tiêu tiết kiệm...)
  initSearch();         // Tìm kiếm
  initReports();        // Thống kê & báo cáo
  initAiInsights();     // Nút "Phân tích chi tiêu" trong trang Thống kê & báo cáo
  initAiChat();         // Chatbot AI nổi, hiện trên mọi trang
  initDashboard();      // Thẻ số liệu + biểu đồ trang chủ
  initBudgets();        // Trang ngân sách
  initSavingsGoals();   // Trang tiết kiệm
  initSettings();       // Trang cài đặt tài khoản
  initAdminPage();      // Trang quản trị hệ thống (chỉ ADMIN)
  initFixedExpenses();  // Trang chi cố định

  // Đăng xuất (nếu trang có nút logout)
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => logout());
  }
});
