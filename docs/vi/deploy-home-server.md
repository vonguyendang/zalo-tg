# Hướng dẫn triển khai Zalo-TG trên Raspberry Pi và Điện thoại Android (Termux)

<div align="center">
  <strong>Tiếng Việt</strong> | <a href="../en/deploy-home-server.md">English</a>
</div>
<br>
<details>
  <summary><b>📖 Menu Tài Liệu</b></summary>
  <ul>
    <li><a href="../../README.vi.md">🏠 Trang chủ (README)</a></li>
    <li><a href="../../docs/vi/user-guide.md">📖 Hướng dẫn sử dụng cơ bản</a></li>
    <br>
    <b>🍎 Dành cho máy Mac (macOS)</b>
    <li><a href="../../docs/vi/quick-start-automation.md">Cài đặt bằng Automator (Zalo Bot Control)</a></li>
    <li><a href="../../docs/vi/quick-start-command.md">Cài đặt bằng Command</a></li>
    <li><a href="../../docs/vi/clamshell-mode-setup.md">Thiết lập Mac gập màn hình chạy ngầm 24/7</a></li>
    <br>
    <b>🪟 Dành cho Windows</b>
    <li><a href="../../docs/vi/quick-start-windows.md">Cài đặt trên Windows (Native & WSL)</a></li>
    <br>
    <b>📱 Dành cho Điện thoại</b>
    <li><a href="../../docs/vi/quick-start-android.md">Cài đặt trên Android (qua Termux)</a></li>
    <br>
    <b>⚙️ Dành cho Máy chủ & Nâng cao</b>
    <li><a href="../../docs/vi/deploy-home-server.md">Triển khai trên VPS / Server Linux</a></li>
    <li><a href="../../docs/vi/local-bot-api-setup.md">Cài đặt Local Bot API (Gửi file lớn 2GB)</a></li>
    <li><a href="../../docs/vi/audit-report.md">Báo cáo Bảo mật & Audit</a></li>
  </ul>
</details>

---

Nếu bạn không có VPS, việc tận dụng một chiếc điện thoại Android cũ hoặc một board mạch như Raspberry Pi để treo bot 24/7 là một giải pháp hoàn hảo, tiết kiệm điện và hoàn toàn miễn phí. 

Tài liệu này sẽ hướng dẫn bạn chi tiết từng bước cho cả hai nền tảng.

---

## Phần 1: Triển khai trên Điện thoại Android cũ (qua Termux)

**Yêu cầu:** 
- Điện thoại Android chạy phiên bản 7.0 trở lên (khuyên dùng 8.0+).
- **Không cần Root.**
- Kết nối Wi-Fi ổn định và luôn cắm sạc.

### Bước 1: Cài đặt Termux
**LƯU Ý QUAN TRỌNG:** KHÔNG cài đặt Termux từ Google Play Store vì phiên bản đó đã lỗi thời và không còn được cập nhật.

1. Tải ứng dụng **F-Droid** tại [f-droid.org](https://f-droid.org/) và cài đặt (hoặc tải trực tiếp file APK của Termux từ [GitHub của Termux](https://github.com/termux/termux-app/releases)).
2. Mở F-Droid, tìm kiếm **Termux** (Termux Terminal emulator with packages) và cài đặt.

### Bước 2: Cài đặt môi trường (Node.js, Git, FFmpeg)
Mở ứng dụng Termux và gõ lần lượt các lệnh sau (nhấn Enter sau mỗi lệnh, nếu được hỏi `Y/n` thì gõ `Y` và Enter):

```bash
# Cấp quyền truy cập bộ nhớ cho Termux (Sẽ hiện popup trên điện thoại, chọn Cho phép)
termux-setup-storage

# Cập nhật danh sách gói phần mềm
pkg update && pkg upgrade -y

# Cài đặt Node.js, Git và FFmpeg (để xử lý tin nhắn thoại)
pkg install nodejs git ffmpeg nano -y
```

*Mẹo: Kiểm tra xem Node.js đã cài thành công chưa bằng lệnh `node -v`. Yêu cầu phiên bản >= 18.*

### Bước 3: Tải source code và cấu hình
Vẫn trong Termux, chạy các lệnh:

```bash
# Clone dự án từ GitHub
git clone https://github.com/williamcachamwri/zalo-tg.git

# Di chuyển vào thư mục dự án
cd zalo-tg

# Cài đặt các thư viện cần thiết
npm install

# Tạo file cấu hình từ file mẫu
cp .env.example .env
```

### Bước 4: Chỉnh sửa cấu hình `.env`
Chúng ta sẽ dùng trình soạn thảo `nano` tích hợp sẵn:
```bash
nano .env
```
1. Điền `TG_TOKEN` (Lấy từ @BotFather trên Telegram).
2. Điền `TG_GROUP_ID` (ID của nhóm Telegram).
3. Sau khi chỉnh sửa xong, nhấn `Ctrl + X`, sau đó gõ `Y` và nhấn `Enter` để lưu file.

### Bước 5: Chạy Bot và Giữ cho bot không bị ngủ
Android có cơ chế tự đóng các ứng dụng chạy nền để tiết kiệm pin. Bạn CẦN làm 2 việc sau để bot chạy 24/7:

1. **Bật Wakelock trong Termux:**
   Gõ lệnh sau vào Termux:
   ```bash
   termux-wake-lock
   ```
   *(Bạn sẽ thấy một thông báo "wake lock held" trên thanh thông báo của Android).*

2. **Tắt tối ưu hóa pin (Battery Optimization) cho Termux:**
   Vào **Cài đặt điện thoại -> Pin (Battery) -> Tối ưu hóa pin**. Tìm ứng dụng Termux và chọn **Không tối ưu hóa (Don't optimize / Unrestricted)**.

3. **Khởi chạy bot:**
   ```bash
   # Build code TypeScript sang JavaScript
   npm run build
   
   # Chạy bot
   npm start
   ```
Bây giờ bot đã chạy. Bạn có thể vào nhóm Telegram và gõ lệnh `/login` hoặc `/loginweb` để bắt đầu.

---

## Phần 2: Triển khai trên Raspberry Pi (hoặc máy chủ Linux tại nhà)

**Yêu cầu:** Raspberry Pi 3/4/5 chạy hệ điều hành Raspberry Pi OS (hoặc Ubuntu/Debian). Đã kết nối mạng.

### Bước 1: Cài đặt môi trường
Mở Terminal (hoặc SSH vào Pi) và chạy:

```bash
# Cập nhật hệ thống
sudo apt update && sudo apt upgrade -y

# Cài đặt Git và FFmpeg
sudo apt install git ffmpeg -y
```

**Cài đặt Node.js:** (Hệ điều hành của Pi thường có Node.js rất cũ, chúng ta cần cài NodeSource bản 18 hoặc 20)
```bash
# Cài đặt Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Bước 2: Clone dự án và cấu hình
```bash
# Clone dự án
git clone https://github.com/williamcachamwri/zalo-tg.git
cd zalo-tg

# Cài đặt thư viện
npm install

# Copy file cấu hình
cp .env.example .env

# Chỉnh sửa file .env (Điền TOKEN và GROUP_ID)
nano .env
```

### Bước 3: Build dự án
```bash
npm run build
```

### Bước 4: Chạy bot nền tự động với PM2
Nếu bạn chỉ gõ `npm start`, bot sẽ tắt khi bạn đóng cửa sổ Terminal. Để bot chạy ngầm và tự động khởi động lại khi Pi mất điện/khởi động lại, ta dùng `pm2`.

```bash
# Cài đặt pm2 toàn cục
sudo npm install -g pm2

# Khởi chạy bot bằng pm2
pm2 start dist/index.js --name "zalo-tg"

# Lưu cấu hình pm2 hiện tại
pm2 save

# Lấy lệnh để pm2 tự khởi động cùng hệ thống
pm2 startup
```
*(Sau khi gõ `pm2 startup`, màn hình sẽ hiện ra một dòng lệnh có chữ `sudo ...`. Copy dòng lệnh đó và chạy lại nó để hoàn tất).*

**Các lệnh PM2 hữu ích:**
- Xem log của bot: `pm2 logs zalo-tg`
- Khởi động lại bot: `pm2 restart zalo-tg`
- Dừng bot: `pm2 stop zalo-tg`
- Xem trạng thái: `pm2 status`

---
**Chúc bạn cấu hình thành công!** Nếu gặp lỗi `ECONNREFUSED` hoặc mạng chặn, đảm bảo mạng gia đình của bạn không chặn các kết nối tới Telegram API.
