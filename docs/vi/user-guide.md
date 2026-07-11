# Hướng Dẫn Sử Dụng ZaloBot (Phiên bản Đa Tài Khoản & Mac Menu Bar)

<div align="center">
  <strong>Tiếng Việt</strong> | <a href="../en/user-guide.md">English</a>
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

Phiên bản này đã được nâng cấp mạnh mẽ để hỗ trợ **nhiều tài khoản Zalo cùng lúc** trên một Bot Telegram duy nhất, đồng thời đi kèm với **Ứng dụng Menu Bar tiện lợi cho macOS**.

---

## 0. Hướng Dẫn Cài Đặt & Build

### Bước 1: Chuẩn bị môi trường cho Bot
Trước khi sử dụng, bạn cần tải các thư viện cần thiết và cấu hình file `.env`.
1. Mở Terminal và di chuyển vào thư mục code (ví dụ: `cd /Users/dangvo/Projects/zalo-tg`).
2. Chạy lệnh: `npm install` để cài đặt thư viện.
3. Chạy lệnh: `npm run build` để biên dịch mã nguồn TypeScript sang JavaScript.
4. Tạo file `.env` dựa trên `.env.example` và điền Token Telegram của bạn.

### Bước 2: Cài đặt Ứng dụng Mac Menu Bar
Chỉ cần thao tác 1 lần duy nhất, script sẽ tự động đóng gói ứng dụng thành file `.app` và đưa lên Menu Bar của bạn.
1. Trong cửa sổ Terminal (đang ở thư mục gốc của project), chạy lệnh sau:
   ```bash
   cd quick-start-script/mac-menu-bar
   ./install-menu-bar.sh
   ```
2. Ngay lập tức, bạn sẽ thấy biểu tượng chữ **Z** nằm trong hình tròn xuất hiện ở góc phải phía trên màn hình (thanh Menu Bar).
3. Ứng dụng đã được cấu hình tự động ẩn khỏi thanh Dock bên dưới và tự động bật lên mỗi khi bạn khởi động lại máy tính.

> **💡 Lưu ý:** File `ZaloBotMenu.app` được lưu trữ tại thư mục ẩn `~/.zalo-bot-control/` ở thư mục Home của máy Mac. Mặc định Finder sẽ ẩn thư mục này để tránh vô tình xoá nhầm. Nếu muốn mở thư mục này ra xem, bạn có thể chạy lệnh `open ~/.zalo-bot-control` trong Terminal.

### Bước 3: Lưu ý khi thay đổi đường dẫn dự án
Nếu sau này bạn có di chuyển toàn bộ thư mục `zalo-tg` sang một vị trí khác (hoặc đổi tên thư mục), Ứng dụng Menu Bar có thể sẽ báo lỗi không tìm thấy dự án.
Để khắc phục, bạn chỉ cần giúp hệ thống cập nhật đường dẫn mới bằng 1 trong 2 cách:
* **Cách 1**: Mở Terminal, di chuyển vào thư mục mới và chạy lệnh `quick-start-script/zalo-bot-control.sh show_status`.
* **Cách 2**: Dùng Finder vào thư mục dự án mới, mở thư mục `quick-start-script` và nhấp đúp vào file `zalo-bot-control.sh` để chạy nó 1 lần.
Ngay khi script chạy, nó sẽ tự động ghi nhớ lại đường dẫn mới vào file cấu hình. Sau đó mọi thứ sẽ hoạt động bình thường!

---

## 1. Ứng Dụng Mac Menu Bar (Status Bar)
Thay vì phải dùng Terminal, bạn có thể kiểm soát toàn bộ Bot trực tiếp từ thanh Menu Bar ở góc phải màn hình MacBook.

### Ý nghĩa Biểu tượng (Icon)
*   🟢 **Z (Xanh lá)**: Bot đang hoạt động bình thường.
*   🔴 **Z (Đỏ)**: Bot hiện đang tắt hoặc đang gặp lỗi khởi động.

### Các Chức Năng Menu
Khi click vào biểu tượng chữ **Z**, bạn có thể thao tác:
*   **Bật/Tắt Bot**: Khởi động hoặc dừng bot hoàn toàn ngầm (không hiện cửa sổ Terminal gây phiền).
*   **Khởi động lại Bot**: Thao tác này hữu ích khi bạn vừa thay đổi file cấu hình (như `.env`).
*   **Mở Log**: Nhanh chóng mở thư mục chứa file log báo lỗi (`~/Library/Logs/zalo-bot-control/`).
*   **Cấu hình xóa log / Xóa log ngay**: Tuỳ chỉnh việc dọn dẹp dung lượng rác định kỳ.
*   **Cấu hình nhánh (Branch)**: Chuyển đổi giữa các phiên bản mã nguồn (ví dụ: `dev` sang `multi-zalo`). Bot sẽ tự động tải cấu hình và khởi động lại sau khi đổi nhánh.

---

## 2. Kết Nối Nhiều Tài Khoản Zalo

Giờ đây bạn không còn bị giới hạn ở 1 tài khoản Zalo nữa. Bot có thể làm cầu nối cho bao nhiêu tài khoản tùy thích.

### Đăng nhập thêm tài khoản (`/login`)
Trong nhóm chat Telegram của Bot, hãy gõ lệnh:
`/login` (hoặc `/loginapp` / `/loginweb`)
*   Mỗi lần quét mã QR thành công, hệ thống sẽ tự động thêm tài khoản Zalo đó vào hệ thống mà **không làm ảnh hưởng** đến các tài khoản đã kết nối trước đó.

### Quản lý tài khoản (`/accounts`)
Để xem bạn đang treo những tài khoản Zalo nào, hãy gõ:
`/accounts`
*   Bot sẽ trả về danh sách các tài khoản đang hoạt động kèm ID (UID) của từng tài khoản.

### Đăng xuất một tài khoản cụ thể (`/logout`)
Nếu bạn muốn ngắt kết nối một tài khoản Zalo cụ thể:
1. Gõ `/accounts` để xem ID (UID) của tài khoản đó.
2. Gõ `/logout <UID>` (Ví dụ: `/logout 123456789`).
*   Tài khoản đó sẽ bị đăng xuất và gỡ khỏi Telegram, các tài khoản còn lại vẫn hoạt động bình thường.

---

## 3. Hoạt Động Của Hệ Thống Tin Nhắn (Topic)

Khi có tin nhắn Zalo gửi đến, Bot sẽ tự động tạo một Topic (Luồng tin nhắn) trong nhóm Telegram của bạn. 

*   **Tên Topic Tự Động**: Để giúp bạn dễ phân biệt tin nhắn nào thuộc về tài khoản Zalo nào, tên Topic sẽ được thêm tiền tố (prefix) tự động.
    *   Ví dụ: `[Tên Zalo của bạn] Tên Khách Hàng`
*   **Trả lời tin nhắn**: Bạn chỉ cần Reply (trả lời) hoặc nhắn thẳng vào Topic đó. Bot đủ thông minh để biết Topic này thuộc về tài khoản Zalo nào và dùng đúng tài khoản đó để gửi tin nhắn đi.
*   **Sử dụng lệnh trong Topic**: Bất kỳ lệnh nào gọi bên trong Topic (vd: `/history`) sẽ tự động được thực thi trên tài khoản Zalo tương ứng của Topic đó.

---

## 4. Sao lưu và Di chuyển Bot (Migration)

Nếu bạn đang chạy bot trên một thiết bị (ví dụ: máy Mac) và muốn chuyển sang một thiết bị khác (ví dụ: VPS Linux hoặc điện thoại Android) mà không muốn phải đăng nhập lại hay mất liên kết của các Topic hiện tại, bạn chỉ cần thực hiện việc sao lưu đúng các file cốt lõi.

### Những file bắt buộc phải giữ lại
- **File `.env`**: Chứa thông tin cấu hình (Token, Group ID).
- **Thư mục `sessions/`**: Chứa các file phiên đăng nhập Zalo:
  - `credentials.json` và `app-session.json`: Giúp bạn không phải quét lại mã QR khi sang máy mới.
- **Thư mục `data/`**: Chứa toàn bộ cơ sở dữ liệu của Bot, bao gồm:
  - `topics.json`: Lưu bản đồ liên kết nhóm Zalo và Topic Telegram.
  - `msg-map.json` (hoặc `msg-map.json.gz`): Lưu liên kết 2 chiều của tất cả tin nhắn (đảm bảo tính năng Reply và Thu hồi hoạt động).
  - `user-cache.json.gz`: Lưu bộ nhớ đệm tên người dùng và UID.
  - `polls.json.gz`: Lưu liên kết các bảng bình chọn (Poll) giữa Zalo và Telegram.

### Những file tuyệt đối KHÔNG sao chép sang máy mới
- **`node_modules/`** và **`dist/`**: Mã nguồn và thư viện được biên dịch riêng cho hệ điều hành/CPU cũ. Sao chép chúng sang máy mới có kiến trúc khác (như từ Mac sang Linux) sẽ gây lỗi sập bot ngay lập tức.

### Quy trình "Chuyển nhà" an toàn
1. **Trên thiết bị mới:** Cài đặt đầy đủ môi trường (Node.js, Git, FFmpeg) và clone mã nguồn về như một lượt cài đặt mới:
   ```bash
   git clone https://github.com/williamcachamwri/zalo-tg
   cd zalo-tg
   npm install
   ```
2. **Chuyển dữ liệu:** Sao chép file `.env`, thư mục `sessions/` và thư mục `data/` từ máy cũ sang thư mục `zalo-tg/` trên máy mới.
3. **Khởi động:** Biên dịch lại mã nguồn và chạy bot:
   ```bash
   npm run build
   npm start
   ```
Ngay khi khởi động, bot trên thiết bị mới sẽ nối lại kết nối cũ và tiếp tục chạy mượt mà.
