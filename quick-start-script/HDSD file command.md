# Hướng dẫn sử dụng `zalo-bot-onefile.command`

File `.command` là cách khởi chạy bot **một chạm** trên macOS — double-click là hiện menu điều khiển, không cần mở Terminal.

---

## Tổng quan

| Thành phần | Mô tả |
|---|---|
| `zalo-bot-onefile.command` | Script chính, double-click để chạy |
| `~/.zalo-bot-control/zalo-bot-run.sh` | Script con, được tạo tự động khi "Bật bot" |
| `~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist` | LaunchAgent, tự khởi động bot sau mỗi lần đăng nhập |
| `~/Library/Logs/zalo-bot-control/` | Thư mục chứa toàn bộ log |

---

## Cài đặt lần đầu

### Bước 1 — Sao chép file vào Applications

```bash
cp /Volumes/MacintoshHD-Data/DATA/code/zalo-tg/quick-start-script/zalo-bot-onefile.command \
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

---

## Cách dùng hàng ngày

Double-click file `zalo-bot-onefile.command`. Một menu xuất hiện với 5 lựa chọn:

| Lựa chọn | Tác dụng |
|---|---|
| **Bật bot** | Build project, tạo LaunchAgent, khởi động bot |
| **Tắt bot** | Dừng bot và huỷ LaunchAgent |
| **Xem trạng thái** | Hiện trạng thái ĐANG BẬT / ĐANG TẮT |
| **Mở log** | Mở thư mục log trong Finder |
| **Hướng dẫn** | Hiện mô tả ngắn các lựa chọn |

---

## Luồng chạy khi chọn "Bật bot"

```
double-click → hiện menu
  → "Bật bot"
      → git checkout dev
      → npm run build
      → chạy run-bot-api.sh (nền)
      → chờ cổng 127.0.0.1:8081 mở (tối đa 30 giây)
      → exec node dist/index.js
```

Bot sẽ **tự chạy lại sau mỗi lần đăng nhập** nhờ LaunchAgent.

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

Mở nhanh bằng Terminal:

```bash
open ~/Library/Logs/zalo-bot-control
```

Hoặc chọn **Mở log** trong menu của app.

---

## Toàn bộ nội dung file

Nếu cần tạo lại file từ đầu, tạo file `zalo-bot-onefile.command` rồi dán toàn bộ đoạn dưới đây:

```bash
#!/usr/bin/env bash
set -euo pipefail

LABEL="com.edwardfranklin.zalo-bot"
APP_DIR="$HOME/.zalo-bot-control"
RUN_SCRIPT="$APP_DIR/zalo-bot-run.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/zalo-bot-control"
PROJECT_DIR="/Volumes/MacintoshHD-Data/DATA/code/zalo-tg"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$LOG_DIR"

write_run_script() {
cat > "$RUN_SCRIPT" <<'RUNEOF'
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="/Volumes/MacintoshHD-Data/DATA/code/zalo-tg"
LOG_DIR="$HOME/Library/Logs/zalo-bot-control"

mkdir -p "$LOG_DIR"
cd "$PROJECT_DIR"

/usr/bin/git checkout dev >> "$LOG_DIR/git.log" 2>&1
/usr/bin/pkill telegram-bot-api 2>/dev/null || true
npm run build >> "$LOG_DIR/build.log" 2>&1

./run-bot-api.sh >> "$LOG_DIR/bot-api.log" 2>&1 &

for i in {1..30}; do
  if nc -z 127.0.0.1 8081; then
    break
  fi
  sleep 1
done

if ! nc -z 127.0.0.1 8081; then
  echo "telegram-bot-api không mở được cổng 8081" >> "$LOG_DIR/app.err.log"
  exit 1
fi

exec node dist/index.js >> "$LOG_DIR/app.log" 2>> "$LOG_DIR/app.err.log"
RUNEOF
chmod +x "$RUN_SCRIPT"
}

write_plist() {
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>$RUN_SCRIPT</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>WorkingDirectory</key>
  <string>$PROJECT_DIR</string>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/launchd.out.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/launchd.err.log</string>

  <key>ProcessType</key>
  <string>Interactive</string>
</dict>
</plist>
PLISTEOF
}

is_loaded() {
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1
}

start_bot() {
  write_run_script
  write_plist
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  osascript -e 'display dialog "Đã bật bot thành công.\n\nBot sẽ tự chạy khi bạn đăng nhập." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
}

stop_bot() {
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f 'node dist/index.js' >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  osascript -e 'display dialog "Đã tắt bot." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
}

show_status() {
  if is_loaded; then
    STATUS="ĐANG BẬT"
  else
    STATUS="ĐANG TẮT"
  fi
  osascript <<OSA
display dialog "Trạng thái: $STATUS\n\nProject: $PROJECT_DIR\nLog: $LOG_DIR" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

open_logs() {
  open "$LOG_DIR"
}

show_help() {
  osascript <<OSA
display dialog "Cách dùng:\n1. Chọn Bật bot để cài và chạy.\n2. Chọn Xem trạng thái để kiểm tra.\n3. Chọn Mở log để xem lỗi.\n4. Chọn Tắt bot để dừng." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

CHOICE=$(osascript <<'OSA'
set picked to choose from list {"Bật bot", "Tắt bot", "Xem trạng thái", "Mở log", "Hướng dẫn"} with prompt "Chọn thao tác:" with title "Zalo Bot Control" default items {"Bật bot"} OK button name "Chọn" cancel button name "Thoát"
if picked is false then
	return "Thoát"
else
	return item 1 of picked
end if
OSA
)

case "$CHOICE" in
  "Bật bot") start_bot ;;
  "Tắt bot") stop_bot ;;
  "Xem trạng thái") show_status ;;
  "Mở log") open_logs ;;
  "Hướng dẫn") show_help ;;
  *) exit 0 ;;
esac
```

---

## Lưu ý quan trọng

> [!IMPORTANT]
> Script chờ cổng `127.0.0.1:8081` mở trước khi khởi động app. Nếu code Node.js của bạn vẫn gọi `http://localhost:8081`, hãy đổi thành `http://127.0.0.1:8081` để tránh lỗi kết nối do lệch IPv4/IPv6.

> [!NOTE]
> `choose from list` là cách chuẩn trong AppleScript để hiển thị nhiều lựa chọn. `display dialog` chỉ cho phép tối đa 3 nút nên không dùng được ở đây.