# Hướng dẫn sử dụng `zalo-bot-onefile.command`

<div align="center">
  <strong>Tiếng Việt</strong> | <a href="../en/quick-start-command.md">English</a>
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

File `.command` là cách khởi chạy bot **một chạm** trên macOS — double-click là hiện menu điều khiển, không cần mở Terminal.

---

## Tổng quan

| Thành phần | Mô tả |
|---|---|
| `zalo-bot-onefile.command` | Script chính, double-click để chạy |
| `~/.zalo-bot-control/zalo-bot-run.sh` | Script con, được tạo tự động khi "Bật bot" |
| `~/.zalo-bot-control/settings.conf` | File lưu cấu hình (số ngày giữ log, v.v.) |
| `~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist` | LaunchAgent, tự khởi động bot sau mỗi lần đăng nhập |
| `~/Library/Logs/zalo-bot-control/` | Thư mục chứa toàn bộ log |

---

## Cài đặt lần đầu

### Bước 1 — Sao chép file vào Applications

```bash
cp /Users/dangvo/Projects/zalo-tg/quick-start-script/zalo-bot-onefile.command \
   /Applications/zalo-bot-onefile.command
```

### Bước 2 — Cấp quyền thực thi

```bash
chmod +x /Applications/zalo-bot-onefile.command
```

> File `.command` **bắt buộc** phải có quyền thực thi thì double-click mới mở được.

### Bước 3 — Lần đầu mở file (bỏ qua cảnh báo Gatekeeper)

1. Vào **Finder → Applications**.
2. Chuột phải vào `zalo-bot-onefile.command` → chọn **Open**.
3. Bấm **Open** trong hộp thoại cảnh báo Gatekeeper.

> Chỉ cần làm bước này **một lần**. Những lần sau double-click bình thường.

### Bước 4 — Cập nhật đường dẫn khi bị chuyển vị trí
Nếu bạn có chuyển toàn bộ thư mục dự án `zalo-tg` đi nơi khác, ứng dụng sẽ báo lỗi do không thể tìm ra đường dẫn mới.
Bạn cần cập nhật lại đường dẫn vào cấu hình bằng cách:
1. Vào thư mục mới của `zalo-tg`, mở `quick-start-script`
2. Nhấp đúp vào file `zalo-bot-control.sh` để chạy nó ít nhất 1 lần (hoặc chạy bằng Terminal).
3. File này sẽ tự động tìm thấy thư mục hiện tại của nó và lưu vào cấu hình `~/.zalo-bot-control/settings.conf`. Sau đó bạn có thể quay lại chạy file `.command` ở `Applications` như bình thường!

---

## Cách dùng hàng ngày

Double-click file `zalo-bot-onefile.command`. Một menu xuất hiện với 7 lựa chọn:

| Lựa chọn | Tác dụng |
|---|---|
| **Bật bot** | Build project, dọn log, tạo LaunchAgent, khởi động bot |
| **Tắt bot** | Dừng bot và huỷ LaunchAgent |
| **Xem trạng thái** | Hiện trạng thái ĐANG BẬT / ĐANG TẮT và số ngày giữ log |
| **Mở log** | Mở thư mục log trong Finder |
| **Cấu hình xóa log** | Đặt số ngày tự động xóa log (0 = tắt tự xóa) |
| **Xóa log ngay** | Xóa log cũ ngay lập tức theo cấu hình hiện tại |
| **Đổi nhánh** | Chọn nhánh git khác để chạy bot (Branch config) |
| **Toggle Clamshell Mode** | Bật/Tắt chế độ chống tắt máy khi gập màn hình (Yêu cầu nhập Pass) |
| **Hướng dẫn** | Hiện mô tả ngắn các lựa chọn kèm lưu ý quan trọng |

---

## Luồng chạy khi chọn "Bật bot"

```
double-click → hiện menu
  → "Bật bot"
      → xóa log cũ hơn N ngày (theo cấu hình)
      → npm run build (Chỉ build 1 lần ở bước này để tránh nóng máy khi tự động restart)
      → cấu hình daemon giữ app (launchd)
      → git checkout nhánh đã cấu hình
      → chạy run-bot-api.sh (nền)
      → chờ cổng 127.0.0.1:8081 mở (tối đa 30 giây)
      → exec node dist/index.js
```

Bot sẽ **tự chạy lại sau mỗi lần đăng nhập** nhờ LaunchAgent.

---

## Tự động xóa log

### Cách hoạt động

- Mỗi lần bot **khởi động**, script tự động xóa các file log cũ hơn số ngày đã cấu hình.
- Mặc định: **7 ngày**.
- Cấu hình được lưu tại `~/.zalo-bot-control/settings.conf`.
- Lịch sử dọn dẹp được ghi vào `cleanup.log`.

### Đặt số ngày giữ log

1. Double-click file → chọn **Cấu hình xóa log**.
2. Nhập số ngày muốn giữ (ví dụ: `14`).
3. Bấm **Lưu**.

> Nhập `0` để **tắt hoàn toàn** tính năng tự xóa log.

### Xóa log ngay lập tức

Chọn **Xóa log ngay** trong menu để dọn log cũ mà không cần khởi động lại bot.

### File cấu hình

`~/.zalo-bot-control/settings.conf` có dạng:

```
LOG_RETENTION_DAYS=7
```

Có thể sửa thủ công bằng bất kỳ text editor nào.

---

## Xem log

| File log | Nội dung |
|---|---|
| `git.log` | Output của `git checkout dev` |
| `build.log` | Output của `npm run build` |
| `bot-api.log` | Output của `telegram-bot-api` |
| `app.log` | Output chuẩn của `node dist/index.js` |
| `app.err.log` | Lỗi của `node dist/index.js` |
| `launchd.out.log` | Output chuẩn từ LaunchAgent |
| `launchd.err.log` | Lỗi từ LaunchAgent |
| `cleanup.log` | Lịch sử tự động xóa log cũ |

Mở nhanh bằng Terminal:

```bash
open ~/Library/Logs/zalo-bot-control
```

Hoặc chọn **Mở log** trong menu của app.

---

## Lưu ý quan trọng

> [!CAUTION]
> NẾU BẠN CẤT MÁY VÀO BALO MANG ĐI, **BẮT BUỘC PHẢI TẮT** tính năng `Toggle Clamshell Mode` từ menu. Nếu quên tắt máy sẽ không thể sleep, dẫn đến kẹt nhiệt trong balo gây hư hỏng phần cứng!

> [!WARNING]
> - **Cấp nguồn:** Khi sử dụng `Toggle Clamshell Mode` (gập màn không tắt) để chạy 24/7, bạn buộc phải cắm sạc cho Mac liên tục.
> - **Tự chạy khi khởi động (Boot):** Máy Mac yêu cầu người dùng phải đăng nhập thì hệ thống mới kích hoạt LaunchAgent của bot. Hãy vào `System Settings -> Users & Groups -> Automatically log in` (Đăng nhập tự động) và chọn tài khoản của bạn để phòng hờ trường hợp cúp điện tự khởi động lại máy.

> [!IMPORTANT]
> Script chờ cổng `127.0.0.1:8081` mở trước khi khởi động app. Nếu code Node.js của bạn vẫn gọi `http://localhost:8081`, hãy đổi thành `http://127.0.0.1:8081` để tránh lỗi kết nối do lệch IPv4/IPv6.

> [!NOTE]
> `choose from list` là cách chuẩn trong AppleScript để hiển thị nhiều lựa chọn. `display dialog` chỉ cho phép tối đa 3 nút nên không dùng được ở đây.