# Hướng dẫn thiết lập Bot chạy 24/7 khi gập màn hình (Clamshell Mode)

Tài liệu này hướng dẫn cách thiết lập macOS Intel để chạy Zalo Bot liên tục 24/7 ngay cả khi gập màn hình, đảm bảo tính ổn định cao nhất và không bị gián đoạn.

---

## Phần 1: Áp dụng thay đổi bot (Chỉ làm 1 lần)

Hệ thống bot đã được tối ưu mã nguồn. Để áp dụng:
1. Nhìn lên thanh **Menu Bar** (góc phải màn hình), nhấn vào icon chữ **Z**.
2. Chọn **Khởi động lại bot** (Restart bot).
3. Bot sẽ tự động biên dịch lại phiên bản chống quá nhiệt và khởi động lại ngầm.

---

## Phần 2: Thiết lập macOS (Bắt buộc)

Để bot tự động sống lại khi mất điện và an toàn khi chạy 24/7, bạn cần cấu hình các mục sau trong System Settings (Cài đặt hệ thống):

### 1. Bật Tự động đăng nhập (Auto-login)
> Đảm bảo bot tự chạy lại nếu máy Mac bị tắt nguồn và tự bật lên lại.
> 
> 💡 **Giải thích:** Tính năng này chỉ dùng để "bảo hiểm" khi mất điện hoặc máy khởi động lại sau khi cập nhật. Nếu bạn đặt máy chạy liên tục, không bao giờ tắt nguồn thì **không cần bật tính năng này**.
- Mở **System Settings** > **Users & Groups** (Người dùng & Nhóm).
- Tìm mục **Automatically log in as** (Tự động đăng nhập dưới dạng).
- Chọn tài khoản của bạn và nhập mật khẩu để xác nhận.

### 2. Thiết lập Khóa màn hình (Lock Screen)
> Đảm bảo máy tự động khóa lại khi gập màn hình để bảo mật dữ liệu.
> 
> 💡 **Giải thích:** Khi bật Clamshell Mode, máy Mac của bạn hoàn toàn KHÔNG NGỦ dù đã gập màn hình. Thiết lập "Ngay lập tức" đảm bảo ngay khi nắp máy đóng lại, hệ thống sẽ bị khóa trái. Ai mở nắp máy lên sẽ bị chặn ở màn hình nhập mật khẩu, ngăn chặn việc đánh cắp dữ liệu. Thiết lập này luôn hoạt động độc lập kể cả khi bạn không bật Auto-login.
- Mở **System Settings** > **Lock Screen** (Màn hình khóa).
- Đặt **Require password after screen saver begins or display is turned off** thành `Immediately` (Ngay lập tức).

---

## Phần 3: Thao tác sử dụng hàng ngày

Khi bạn muốn treo máy chạy bot 24/7 và gập màn hình lại, hãy làm đúng theo trình tự sau:

1. **Cấp nguồn:** Cắm sạc cho MacBook. (Bắt buộc).
2. **Bật chế độ chống Sleep:**
   - Nhấn vào icon chữ **Z** trên Menu Bar.
   - Chọn **Toggle Clamshell Mode**.
   - Nhập mật khẩu máy Mac của bạn. Cửa sổ thông báo **"Đã BẬT chế độ chống Sleep 24/7"** sẽ hiện ra.
3. **Gập màn hình:** 
   - Lúc này bạn có thể gập màn hình lại một cách thoải mái. 
   - Màn hình sẽ tắt (tiết kiệm điện) và tự động khóa (bảo mật), nhưng hệ thống mạng và CPU vẫn chạy ngầm để bot Zalo phục vụ tin nhắn liên tục.
4. **Vị trí đặt máy:** Đặt máy ở nơi thoáng mát, bề mặt cứng (mặt bàn), không kê lên nệm hoặc chăn để tản nhiệt tốt.

---

## ⚠️ Cảnh báo an toàn phần cứng (Rất quan trọng)

> [!CAUTION]
> NẾU BẠN CẦN MANG MÁY ĐI LÀM / BỎ VÀO BALO:
> - Bạn **BẮT BUỘC PHẢI TẮT** chế độ Clamshell.
> - Bấm lại vào mục **Toggle Clamshell Mode** trên menu chữ Z.
> - Khi có thông báo **"Đã TẮT chế độ chống Sleep"**, bạn mới được rút sạc, gập máy và cho vào balo.
> 
> *Lý do: Nếu quên tắt, máy sẽ tiếp tục chạy ngầm, không thể tản nhiệt trong không gian kín của balo, dẫn đến phù pin, hư hỏng linh kiện hoặc cháy nổ!*
