# Hướng Dẫn Cập Nhật Code & Áp Dụng Thay Đổi (Update Guide)

Mỗi khi dự án có sự thay đổi mã nguồn (như thêm tính năng mới, sửa lỗi, cập nhật thư viện, v.v.), hãy làm theo các bước dưới đây để đảm bảo ứng dụng (bot) của bạn áp dụng những thay đổi đó một cách an toàn và chính xác.

---

## 📍 1. Môi Trường Chạy Trực Tiếp Bằng Menu Bar App (`zalo-tg-tui`)

Nếu bạn đang quản lý bot trên máy tính cá nhân bằng công cụ Menu Bar (có biểu tượng chữ Z màu xanh trên màn hình Mac), quá trình cập nhật rất đơn giản vì app này có thể tự xử lý nhiều thứ.

**Các bước thực hiện:**
1. Mở Terminal tại thư mục code (`/Users/.../Projects/zalo-tg`).
2. Tải code mới nhất từ GitHub:
   ```bash
   git pull
   ```
3. Cài đặt các thư viện mới (nếu file `package.json` có thay đổi):
   ```bash
   npm install
   ```
4. Biên dịch mã nguồn từ TypeScript sang JavaScript:
   ```bash
   npm run build
   ```
5. Bấm vào biểu tượng chữ **Z** trên thanh Menu Bar của MacOS.
6. Chọn **"Restart bot"**. Bot sẽ tự động lấy code đã biên dịch trong thư mục `dist/` để khởi động lại.

---

## 📍 2. Môi Trường Phát Triển Chạy Thủ Công (Terminal / Local Dev)

Nếu bạn là nhà phát triển đang sửa code thủ công và chạy bot trực tiếp trên màn hình Terminal:

**Các bước thực hiện:**
1. Dừng process hiện tại bằng cách bấm `Control + C` trong cửa sổ Terminal đang chạy bot.
2. Tải code mới nhất (hoặc lưu file đang viết):
   ```bash
   git pull
   ```
3. Cài đặt dependency và biên dịch lại code:
   ```bash
   npm install && npm run build
   ```
4. Bật lại bot:
   ```bash
   npm run start
   # Hoặc dùng npm run dev (dùng tsx) nếu bạn muốn bot tự nhận diện thay đổi mà không cần gõ build lại
   ```

---

## 📍 3. Môi Trường Máy Chủ (VPS / Linux Server)

Khi triển khai trên VPS và bot đang chạy ngầm như một Background Service (Systemd / PM2).

### 🔹 Cách 1: Sử Dụng Systemd (Khuyên dùng)
*Điều kiện: Bạn đã cấu hình file `zalo-tg.service` theo tài liệu hướng dẫn.*

1. Truy cập vào thư mục bot trên server:
   ```bash
   cd /root/zalo-tg
   ```
2. Cập nhật code mới nhất:
   ```bash
   git pull
   ```
3. Cài đặt thư viện mới:
   ```bash
   npm install
   ```
4. Khởi động lại service:
   ```bash
   sudo systemctl restart zalo-tg
   ```
   *(Lưu ý: Systemd script trong dự án đã có sẵn lệnh `ExecStartPre=/usr/bin/npm run build`, nên khi bạn chạy restart, nó sẽ tự động biên dịch lại code mới).*

### 🔹 Cách 2: Sử Dụng PM2
1. Kéo code và cài đặt/biên dịch:
   ```bash
   git pull
   npm install
   npm run build
   ```
2. Restart process của PM2:
   ```bash
   pm2 restart zalo-tg
   ```

---

## 💡 Các Lưu Ý Quan Trọng
- **Luôn chạy `npm install`** nếu bạn thấy file `package.json` hoặc `package-lock.json` có sự thay đổi. Điều này giúp cập nhật các bản vá bảo mật và các thư viện mới (như việc sửa lỗi `npm audit`).
- **Luôn chạy `npm run build`** nếu không chạy bằng `tsx` (tức là lệnh `npm run dev`). Mã nguồn gốc được viết bằng TypeScript (`.ts`), trong khi Node.js chỉ chạy các file JavaScript (`.js`) được sinh ra trong thư mục `dist/`. Việc quên build sẽ làm bot tiếp tục sử dụng logic của bản code cũ.
