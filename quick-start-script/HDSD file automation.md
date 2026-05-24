# Hướng dẫn tạo app Automator (`zalo-bot-control.sh`)

Biến script `zalo-bot-control.sh` thành một **app macOS** trong `/Applications` bằng Automator, để click vào là hiện menu điều khiển bot — không cần mở Terminal.

---

## Tổng quan

| Thành phần | Mô tả |
|---|---|
| `Zalo Bot Control.app` | App Automator, lưu tại `/Applications` |
| `zalo-bot-control.sh` | Nội dung script chạy bên trong app |
| `~/.zalo-bot-control/zalo-bot-run.sh` | Script con, được tạo tự động khi "Bật bot" |
| `~/.zalo-bot-control/settings.conf` | File lưu cấu hình (số ngày giữ log, v.v.) |
| `~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist` | LaunchAgent, tự khởi động bot sau mỗi lần đăng nhập |
| `~/Library/Logs/zalo-bot-control/` | Thư mục chứa toàn bộ log |

---

## Tạo app Automator

### Bước 1 — Tạo document mới

Mở **Automator** (tìm trong Spotlight hoặc `/Applications/Automator.app`).

Trong cửa sổ đầu tiên → chọn **New Document** → chọn loại **Application** → bấm **Choose**.

### Bước 2 — Thêm action Run Shell Script

Ở ô tìm kiếm bên trái, gõ `Run Shell Script`.

Kéo action **Run Shell Script** từ cột kết quả sang vùng workflow bên phải.

### Bước 3 — Cấu hình action

Trong action vừa thêm:

- **Shell**: chọn `/bin/bash`
- **Pass input**: chọn `to stdin` (hoặc `as arguments` đều được)

### Bước 4 — Dán script

Xóa nội dung mặc định trong ô script, rồi dán **toàn bộ nội dung file `zalo-bot-control.sh`** vào.

> [!NOTE]
> Dòng `export PATH=...` ở đầu là bắt buộc. Automator chạy với `PATH` rút gọn, thiếu dòng này thì `npm`, `node`, `nc` sẽ không tìm thấy được.

### Bước 5 — Thử chạy

Bấm nút **▶ Run** trong Automator. Nếu xuất hiện hộp thoại danh sách:

```
Bật bot / Tắt bot / Xem trạng thái / Mở log / Cấu hình xóa log / Xóa log ngay / Hướng dẫn
```

là script hoạt động đúng.

### Bước 6 — Lưu thành app

Bấm **File → Save** (hoặc `⌘S`).

- **Tên file**: `Zalo Bot Control`
- **Thư mục**: `/Applications`
- **Format**: Application *(mặc định khi tạo document dạng Application)*

macOS sẽ tạo ra `Zalo Bot Control.app` trong `/Applications`.

### Bước 7 — Mở app lần đầu

1. Mở **Finder → Applications**.
2. Chuột phải vào `Zalo Bot Control.app` → chọn **Open**.
3. Bấm **Open** trong hộp thoại cảnh báo Gatekeeper *(chỉ lần đầu)*.
4. Chọn **Bật bot** để cài LaunchAgent và khởi động bot.

---

## Menu điều khiển

| Lựa chọn | Tác dụng |
|---|---|
| **Bật bot** | Dọn log cũ, build project, tạo LaunchAgent, khởi động bot |
| **Tắt bot** | Dừng bot và huỷ LaunchAgent |
| **Xem trạng thái** | Hiện trạng thái ĐANG BẬT / ĐANG TẮT và số ngày giữ log |
| **Mở log** | Mở thư mục log trong Finder |
| **Cấu hình xóa log** | Đặt số ngày tự động xóa log (0 = tắt tự xóa) |
| **Xóa log ngay** | Xóa log cũ ngay lập tức theo cấu hình hiện tại |
| **Hướng dẫn** | Hiện mô tả ngắn các lựa chọn |

---

## Luồng chạy khi chọn "Bật bot"

```
click app → hiện menu
  → "Bật bot"
      → xóa log cũ hơn N ngày (theo cấu hình)
      → git checkout dev
      → npm run build
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

1. Mở app → chọn **Cấu hình xóa log**.
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

Chọn **Mở log** trong menu app, hoặc mở thủ công:

```bash
open ~/Library/Logs/zalo-bot-control
```

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

---

## Xử lý sự cố

### App mở nhưng bot không chạy

1. Vào **System Settings → Privacy & Security**.
2. Kiểm tra quyền cho **Automator** hoặc `Zalo Bot Control.app`.
3. Xem `app.err.log` và `launchd.err.log` để tìm lỗi cụ thể.

### Lỗi `ECONNREFUSED` khi kết nối bot API

> [!IMPORTANT]
> Script chờ cổng `127.0.0.1:8081`. Nếu code Node.js vẫn gọi `http://localhost:8081`, hãy đổi thành `http://127.0.0.1:8081` để tránh lệch IPv4/IPv6.

### Reset hoàn toàn

```bash
# Gỡ LaunchAgent
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist

# Xoá file cài đặt
rm -rf ~/.zalo-bot-control
rm ~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist
```

Sau đó mở lại app và chọn **Bật bot** để cài lại từ đầu.