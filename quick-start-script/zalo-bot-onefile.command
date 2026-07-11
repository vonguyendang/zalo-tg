#!/usr/bin/env bash
set -euo pipefail

LABEL="com.edwardfranklin.zalo-bot"
APP_DIR="$HOME/.zalo-bot-control"
RUN_SCRIPT="$APP_DIR/zalo-bot-run.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/zalo-bot-control"
if [[ -L "${BASH_SOURCE[0]}" ]]; then
  SCRIPT_DIR="$(dirname "$(readlink "${BASH_SOURCE[0]}")")"
else
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

if [[ "$SCRIPT_DIR" == *"/quick-start-script"* ]]; then
  PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
else
  PROJECT_DIR=""
fi
SETTINGS_FILE="$APP_DIR/settings.conf"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$LOG_DIR"

# ── Đọc / ghi cấu hình ─────────────────────────────────────────────────────────

load_settings() {
  LOG_RETENTION_DAYS=7
  BOT_BRANCH="multi-zalo"
  if [[ -f "$SETTINGS_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$SETTINGS_FILE"
  fi
}

save_settings() {
  cat > "$SETTINGS_FILE" <<EOF
LOG_RETENTION_DAYS=$LOG_RETENTION_DAYS
BOT_BRANCH="$BOT_BRANCH"
PROJECT_DIR="$PROJECT_DIR"
EOF
}

load_settings

if [[ -z "${PROJECT_DIR:-}" || ! -d "${PROJECT_DIR:-}" ]]; then
  osascript -e 'display dialog "Không tìm thấy thư mục dự án. Vui lòng chạy file zalo-bot-control.sh trong thư mục mã nguồn 1 lần để hệ thống ghi nhận đường dẫn mới." buttons {"OK"} default button "OK" with title "Lỗi"'
  exit 1
fi

# ── Tự xóa log cũ ──────────────────────────────────────────────────────────────

clean_old_logs() {
  local days="${1:-$LOG_RETENTION_DAYS}"
  if [[ "$days" -le 0 ]]; then
    return 0
  fi
  local deleted
  deleted=$(find "$LOG_DIR" -maxdepth 1 -type f \( -name "*.log" -o -name "*.err.log" \) -mtime +"$days" -print -delete 2>/dev/null | wc -l | tr -d ' ')
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dọn log cũ hơn ${days} ngày: xóa ${deleted} file." >> "$LOG_DIR/cleanup.log"
}

# ── Script chạy bot ─────────────────────────────────────────────────────────────

write_run_script() {
cat > "$RUN_SCRIPT" <<RUNEOF
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$PROJECT_DIR"
LOG_DIR="\$HOME/Library/Logs/zalo-bot-control"
SETTINGS_FILE="\$HOME/.zalo-bot-control/settings.conf"

mkdir -p "\$LOG_DIR"
cd "\$PROJECT_DIR"

# Xóa log cũ trước khi khởi động
LOG_RETENTION_DAYS=7
if [[ -f "\$SETTINGS_FILE" ]]; then source "\$SETTINGS_FILE"; fi
if [[ "\$LOG_RETENTION_DAYS" -gt 0 ]]; then
  deleted=\$(find "\$LOG_DIR" -maxdepth 1 -type f \( -name "*.log" -o -name "*.err.log" \) -mtime +"\$LOG_RETENTION_DAYS" -print -delete 2>/dev/null | wc -l | tr -d ' ')
  echo "[\$(date '+%Y-%m-%d %H:%M:%S')] Dọn log cũ hơn \${LOG_RETENTION_DAYS} ngày: xóa \${deleted} file." >> "\$LOG_DIR/cleanup.log"
fi

if [[ -f "\$SETTINGS_FILE" ]]; then source "\$SETTINGS_FILE"; fi
/usr/bin/git checkout "${BOT_BRANCH:-multi-zalo}" >> "\$LOG_DIR/git.log" 2>&1
/usr/bin/pkill telegram-bot-api 2>/dev/null || true

./run-bot-api.sh >> "\$LOG_DIR/bot-api.log" 2>&1 &

for i in {1..30}; do
  if nc -z 127.0.0.1 8081; then
    break
  fi
  sleep 1
done

if ! nc -z 127.0.0.1 8081; then
  echo "telegram-bot-api không mở được cổng 8081" >> "\$LOG_DIR/app.err.log"
  exit 1
fi

exec node dist/index.js >> "\$LOG_DIR/app.log" 2>> "\$LOG_DIR/app.err.log"
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

# ── Gọi hàm trực tiếp từ argument ─────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  case "$1" in
    start_bot_silent) start_bot silent ;;
    stop_bot_silent) stop_bot silent ;;
    restart_bot_silent) restart_bot silent ;;
  esac
  exit 0
fi

# ── Các thao tác chính ─────────────────────────────────────────────────────────

is_loaded() {
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1
}

start_bot() {
  local silent="${1:-}"
  clean_old_logs
  cd "$PROJECT_DIR" && npm run build >> "$LOG_DIR/build.log" 2>&1
  write_run_script
  write_plist
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  if [[ "$silent" != "silent" ]]; then
    osascript -e 'display dialog "Đã bật bot thành công.\n\nBot sẽ tự chạy khi bạn đăng nhập.\nLog cũ sẽ tự xóa theo lịch đã cấu hình." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
  fi
}

stop_bot() {
  local silent="${1:-}"
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f 'node dist/index.js' >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  if [[ "$silent" != "silent" ]]; then
    osascript -e 'display dialog "Đã tắt bot." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
  fi
}

restart_bot() {
  local silent="${1:-}"
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f 'node dist/index.js' >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  clean_old_logs
  cd "$PROJECT_DIR" && npm run build >> "$LOG_DIR/build.log" 2>&1
  write_run_script
  write_plist
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  if [[ "$silent" != "silent" ]]; then
    osascript -e 'display dialog "Đã khởi động lại bot thành công." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
  fi
}

show_status() {
  if is_loaded; then
    STATUS="ĐANG BẬT"
  else
    STATUS="ĐANG TẮT"
  fi
  osascript <<OSA
display dialog "Trạng thái: $STATUS

Project: $PROJECT_DIR
Log: $LOG_DIR
Tự xóa log sau: $LOG_RETENTION_DAYS ngày" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

open_logs() {
  open "$LOG_DIR"
}

set_log_retention() {
  local current="$LOG_RETENTION_DAYS"
  local input
  input=$(osascript <<OSA
set retentionDays to text returned of (display dialog "Nhập số ngày giữ log (0 = không tự xóa):

Hiện tại: $current ngày" default answer "$current" buttons {"Hủy", "Lưu"} default button "Lưu" cancel button "Hủy" with title "Zalo Bot Control – Cấu hình Log")
return retentionDays
OSA
  ) || return 0

  if ! [[ "$input" =~ ^[0-9]+$ ]]; then
    osascript -e 'display dialog "Giá trị không hợp lệ. Vui lòng nhập số nguyên >= 0." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
    return 1
  fi

  LOG_RETENTION_DAYS="$input"
  save_settings

  if [[ "$input" -eq 0 ]]; then
    osascript -e 'display dialog "Đã tắt tự xóa log." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
  else
    osascript <<OSA
display dialog "Đã lưu: tự xóa log sau $input ngày.

Log cũ hơn $input ngày sẽ bị xóa mỗi lần bot khởi động." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
  fi
}


set_branch() {
  local current="$BOT_BRANCH"
  local input
  input=$(osascript <<OSA
set branchName to text returned of (display dialog "Nhập tên nhánh (branch) để chạy bot:\n\nHiện tại: $current" default answer "$current" buttons {"Hủy", "Lưu"} default button "Lưu" cancel button "Hủy" with title "Zalo Bot Control – Đổi nhánh")
return branchName
OSA
  ) || return 0

  if [[ -z "$input" ]]; then
    osascript -e 'display dialog "Tên nhánh không được để trống." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
    return 1
  fi

  BOT_BRANCH="$input"
  save_settings

  osascript <<OSA
display dialog "Đã lưu nhánh mới: $BOT_BRANCH\n\nBot sẽ được khởi động lại với nhánh này." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
  restart_bot
}

clean_logs_now() {
  clean_old_logs
  osascript <<OSA
display dialog "Đã dọn xong log cũ hơn $LOG_RETENTION_DAYS ngày.

Xem chi tiết tại: cleanup.log" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

toggle_clamshell() {
  local current
  current=$(pmset -g | grep -w "disablesleep" | awk '{print $2}')
  if [[ "$current" == "1" ]]; then
    osascript -e 'do shell script "pmset -a disablesleep 0" with administrator privileges'
    osascript -e 'display dialog "✅ Đã TẮT chế độ chống Sleep.\n\nMáy sẽ sleep bình thường khi gập màn hình." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
  else
    osascript -e 'do shell script "pmset -a disablesleep 1" with administrator privileges'
    osascript -e 'display dialog "✅ Đã BẬT chế độ chống Sleep 24/7.\n\nBây giờ bạn có thể gập màn hình mà máy vẫn tiếp tục chạy Bot.\n(Nhớ cắm sạc nhé!)" buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
  fi
}

show_help() {
  osascript <<OSA
display dialog "📌 HƯỚNG DẪN SỬ DỤNG:
1. Start / Restart / Stop: Bật, tắt, hoặc khởi động lại bot.
2. Show status / Open logs: Xem trạng thái và lỗi.
3. Các config khác: Quản lý nhánh và dọn log.
4. Toggle Clamshell Mode: Bật/tắt chế độ gập màn hình không tắt máy.

⚠️ LƯU Ý QUAN TRỌNG KHI CHẠY 24/7:
- Tự chạy khi bật máy: Hãy vào System Settings -> Users & Groups -> Bật 'Automatically log in' cho user này.
- Cấp nguồn: Khi BẬT chống sleep (Clamshell Mode), bắt buộc Mac phải được cắm sạc.
- Mang máy đi: NẾU BẠN CẤT MÁY VÀO BALO, BẮT BUỘC PHẢI TẮT 'Toggle Clamshell Mode' để máy được sleep bình thường. Nếu không máy sẽ bị hầm bí và quá nhiệt!" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

# ── Menu chính ──────────────────────────────────────────────────────────────────

CHOICE=$(osascript <<'OSA'
set picked to choose from list {"Bật bot", "Khởi động lại bot", "Tắt bot", "Xem trạng thái", "Mở log", "Cấu hình xóa log", "Xóa log ngay", "Cấu hình nhánh", "Toggle Clamshell Mode", "Hướng dẫn"} with prompt "Chọn thao tác:" with title "Zalo Bot Control" default items {"Bật bot"} OK button name "Chọn" cancel button name "Thoát"
if picked is false then
	return "Thoát"
else
	return item 1 of picked
end if
OSA
)

case "$CHOICE" in
  "Bật bot")           start_bot ;;
  "Khởi động lại bot") restart_bot ;;
  "Tắt bot")           stop_bot ;;
  "Xem trạng thái")    show_status ;;
  "Mở log")            open_logs ;;
  "Cấu hình xóa log")  set_log_retention ;;
  "Xóa log ngay")      clean_logs_now ;;
  "Cấu hình nhánh")    set_branch ;;
  "Toggle Clamshell Mode") toggle_clamshell ;;
  "Hướng dẫn")         show_help ;;
  *)                   exit 0 ;;
esac