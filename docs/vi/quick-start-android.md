<div align="center">
  <strong>Tiếng Việt</strong> | <a href="../en/quick-start-android.md">English</a>
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

# Hướng dẫn biến điện thoại Android thành máy chủ chạy Bot

Bạn hoàn toàn có thể tận dụng một chiếc điện thoại Android cũ để làm máy chủ (Home Server) chạy ngầm Zalo-TG Bridge 24/7 một cách miễn phí và tiết kiệm điện. Công cụ tốt nhất để làm việc này là **Termux**.

> [!WARNING]
> **Về hệ điều hành iOS (iPhone/iPad):**
> Rất tiếc là bạn **không thể** chạy hệ thống này trên các thiết bị iOS chưa jailbreak. Apple áp đặt các quy định hộp cát (sandbox) rất khắt khe và hệ thống sẽ lập tức "giết chết" các tiến trình chạy ngầm để tiết kiệm pin. Hướng dẫn này chỉ dành riêng cho **Android**.

---

## Bước 1: Cài đặt Termux đúng cách

> [!IMPORTANT]
> Tuyệt đối **KHÔNG** tải Termux từ Google Play Store vì phiên bản đó đã bị bỏ hoang và không thể cài đặt được Node.js.

1. Tải ứng dụng **F-Droid** từ trang chủ: [f-droid.org](https://f-droid.org/)
2. Mở F-Droid, tìm kiếm và cài đặt hai ứng dụng:
   - **Termux**
   - **Termux:API**

## Bước 2: Tắt tối ưu hóa pin (Bắt buộc)

Nếu không tắt tối ưu hóa pin, hệ điều hành Android sẽ đóng Termux ngay khi bạn tắt màn hình.
1. Kéo thanh thông báo trên điện thoại xuống, tìm thông báo của Termux và chọn **"Acquire wakelock"** (Giữ màn hình/CPU thức).
2. Vào **Cài đặt điện thoại** > **Ứng dụng** > **Termux** > **Pin** > Chọn **Không hạn chế (Unrestricted)**.

## Bước 3: Cài đặt môi trường

Mở ứng dụng Termux và gõ lần lượt các lệnh sau (nhấn Enter sau mỗi dòng):

```bash
# Nâng cấp hệ thống Termux
pkg update && pkg upgrade -y

# Cài đặt Node.js, Git và FFmpeg
pkg install nodejs git ffmpeg -y
```
*(Nếu Termux hỏi `[Y/n]` trong quá trình cài đặt, hãy gõ `y` và nhấn Enter).*

## Bước 4: Tải mã nguồn và cài đặt Bot

Cũng trong Termux, chạy các lệnh sau:

```bash
# Tải mã nguồn
git clone https://github.com/williamcachamwri/zalo-tg
cd zalo-tg

# Cài đặt thư viện
npm install
```

## Bước 5: Cấu hình và Khởi động

1. Tạo file `.env`:
   ```bash
   cp .env.example .env
   ```
2. Chỉnh sửa file `.env` bằng trình soạn thảo `nano`:
   ```bash
   nano .env
   ```
   *Di chuyển con trỏ và điền `TG_TOKEN` cùng `TG_GROUP_ID`. Sau khi xong, nhấn `Ctrl + X`, gõ `y`, rồi nhấn `Enter` để lưu lại.*

3. Biên dịch và khởi chạy bot:
   ```bash
   npm run build
   npm start
   ```

> [!TIP]
> Để giữ bot chạy ngầm sau khi thoát ứng dụng Termux, bạn có thể cài thêm **PM2** bằng lệnh: `npm install -g pm2`, sau đó chạy bot bằng lệnh: `pm2 start dist/index.js --name zalo-bot`.
