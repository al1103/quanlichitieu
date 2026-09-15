const cron = require('node-cron');
const prisma = require('../config/db');

// Chạy vào 00:01 mỗi ngày
const scheduleFixedExpenses = () => {
  cron.schedule('1 0 * * *', async () => {
    console.log('[Cron] Đang quét các khoản chi cố định tới hạn...');
    try {
      const now = new Date();
      let todayDay = now.getDate();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      // Tính ngày cuối cùng của tháng này
      const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      // Lấy tất cả khoản chi cố định
      const fixedExpenses = await prisma.fixedExpense.findMany({
        include: { user: true }
      });

      for (const expense of fixedExpenses) {
        // Logic xác định ngày trừ tiền:
        // Nếu deductDay lớn hơn số ngày trong tháng (vd: 31, nhưng tháng chỉ có 30 ngày)
        // thì ngày trừ tiền sẽ là ngày cuối cùng của tháng.
        let targetDay = expense.deductDay;
        if (targetDay > lastDayOfMonth) {
          targetDay = lastDayOfMonth;
        }

        // Nếu hôm nay đúng là ngày trừ tiền
        if (todayDay === targetDay) {
          // Kiểm tra xem tháng này đã trừ chưa (tránh trừ lặp do server restart)
          const alreadyDeducted = expense.lastDeducted && 
            expense.lastDeducted.getMonth() === currentMonth && 
            expense.lastDeducted.getFullYear() === currentYear;

          if (!alreadyDeducted) {
            // Xử lý trừ tiền
            if (expense.user.walletBalance >= expense.amount) {
              // Trừ tiền
              await prisma.$transaction(async (tx) => {
                // 1. Cập nhật số dư
                await tx.user.update({
                  where: { id: expense.userId },
                  data: { walletBalance: { decrement: expense.amount } }
                });

                // 2. Tạo giao dịch (Transaction)
                await tx.transaction.create({
                  data: {
                    userId: expense.userId,
                    amount: expense.amount,
                    type: 'CHI',
                    category: expense.category,
                    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
                    description: expense.description || `Thanh toán chi cố định: ${expense.category}`,
                  }
                });

                // 3. Cập nhật lastDeducted
                await tx.fixedExpense.update({
                  where: { id: expense.id },
                  data: { lastDeducted: new Date() }
                });

                // 4. Tạo thông báo thành công
                await tx.notification.create({
                  data: {
                    userId: expense.userId,
                    title: 'Đã thanh toán chi cố định',
                    message: `Hệ thống đã tự động thanh toán ${expense.amount.toLocaleString('vi-VN')}đ cho khoản ${expense.category}.`
                  }
                });
              });
              console.log(`[Cron] Đã thanh toán ${expense.category} cho user ${expense.userId}`);
            } else {
              // Không đủ tiền -> Tạo thông báo thất bại
              await prisma.notification.create({
                data: {
                  userId: expense.userId,
                  title: 'Thanh toán chi cố định thất bại',
                  message: `Số dư ví không đủ để thanh toán ${expense.amount.toLocaleString('vi-VN')}đ cho khoản ${expense.category}. Vui lòng nạp thêm tiền.`
                }
              });
              // Cập nhật lastDeducted để không báo lỗi liên tục mỗi lần server restart trong cùng ngày?
              // Không, nếu user nạp tiền vào trong ngày, có thể họ muốn nó tự trừ khi server khởi động lại?
              // Thực tế, hệ thống ngân hàng sẽ trừ lại hoặc đánh dấu fail. Ta sẽ đánh dấu lastDeducted luôn để khỏi báo liên tục.
              // Hoặc ta chỉ thông báo 1 lần trong ngày, ta có thể check Notification đã tạo hôm nay chưa.
              
              const existingNotif = await prisma.notification.findFirst({
                where: {
                  userId: expense.userId,
                  title: 'Thanh toán chi cố định thất bại',
                  createdAt: {
                    gte: new Date(currentYear, currentMonth, todayDay)
                  }
                }
              });

              if (!existingNotif) {
                 await prisma.notification.create({
                  data: {
                    userId: expense.userId,
                    title: 'Thanh toán chi cố định thất bại',
                    message: `Số dư ví không đủ để thanh toán ${expense.amount.toLocaleString('vi-VN')}đ cho khoản ${expense.category}. Vui lòng nạp thêm tiền và tự thanh toán.`
                  }
                });
                
                // Đánh dấu là đã xử lý trong tháng này để khỏi thử lại nữa
                await prisma.fixedExpense.update({
                  where: { id: expense.id },
                  data: { lastDeducted: new Date() }
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('[Cron] Lỗi khi chạy cron fixed expenses:', error);
    }
  });
};

module.exports = scheduleFixedExpenses;
