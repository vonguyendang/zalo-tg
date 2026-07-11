<div align="center">
  <strong>Tiếng Việt</strong> | <a href="../en/quick-start-windows.md">English</a>
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

# Hướng dẫn thiết lập trên Windows

Bạn có thể chạy Zalo-TG Bridge trên hệ điều hành Windows theo hai cách: chạy trực tiếp bằng PowerShell (Native) hoặc thông qua hệ thống Linux nhúng của Windows (WSL - Cách khuyên dùng).

---

## CÁCH 1: Chạy qua WSL (Khuyên dùng, chạy mượt như máy chủ)

WSL (Windows Subsystem for Linux) cho phép bạn chạy một máy chủ Linux thực thụ ngay bên trong Windows. 

**Bước 1: Cài đặt WSL**
1. Mở PowerShell dưới quyền Quản trị viên (Run as Administrator).
2. Gõ lệnh:
   ```powershell
   wsl --install
   ```
3. Khởi động lại máy tính. Mở ứng dụng **Ubuntu** từ Start Menu và thiết lập username/mật khẩu.

**Bước 2: Cài đặt Zalo Bot trong Ubuntu**
1. Mở ứng dụng **Ubuntu** (hoặc gõ `wsl` trong PowerShell).
2. Chạy lệnh cài đặt tự động dành cho Linux:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh | sh
   ```
3. Script sẽ tự động cài Node.js, Git, FFmpeg và cấu hình môi trường cho bạn.
4. Di chuyển vào thư mục dự án và chạy:
   ```bash
   cd ~/zalo-tg
   npm start
   ```

---

## CÁCH 2: Chạy trực tiếp (Native Windows)

Nếu bạn không muốn dùng WSL, bạn có thể chạy bot trực tiếp bằng Command Prompt hoặc PowerShell. Yêu cầu bạn phải cài đặt thủ công các phần mềm phụ thuộc.

### Bước 1: Cài đặt phần mềm yêu cầu
1. **Node.js (>= 18):** Tải và cài đặt bản LTS tại [nodejs.org](https://nodejs.org/).
2. **Git:** Tải và cài đặt tại [git-scm.com](https://git-scm.com/).
3. **FFmpeg:** (Bắt buộc để gửi Voice/Video)
   - Tải file nén FFmpeg dành cho Windows tại [gyan.dev](https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-full.7z).
   - Giải nén vào ổ C (ví dụ: `C:\ffmpeg`).
   - Thêm đường dẫn `C:\ffmpeg\bin` vào **Environment Variables (PATH)** của Windows. Mở CMD/PowerShell gõ `ffmpeg -version` để kiểm tra.

### Bước 2: Tải mã nguồn và cài đặt
Mở **PowerShell** và chạy lần lượt các lệnh:

```powershell
git clone https://github.com/williamcachamwri/zalo-tg
cd zalo-tg
npm install
```

### Bước 3: Cấu hình và chạy Bot
Tạo file `.env` chứa Token và Group ID của bạn:
```powershell
copy .env.example .env
notepad .env
```
*(Điền `TG_TOKEN` và `TG_GROUP_ID` vào file .env rồi lưu lại).*

**Chạy bot:**
Biên dịch và khởi động bot:
```powershell
npm run build
npm start
```

### Bước 4 (Tùy chọn): Chạy ngầm 24/7 bằng PM2
Để bot không bị tắt khi bạn đóng cửa sổ PowerShell:
```powershell
npm install -g pm2
pm2 start dist/index.js --name zalo-tg
pm2 save
```
> [!TIP]
> PM2 sẽ giữ cho bot của bạn chạy ngầm. Để bot tự động bật mỗi khi bạn mở máy tính, bạn có thể tạo một Task trong **Task Scheduler** của Windows để tự động chạy lệnh `pm2 resurrect` khi đăng nhập.
