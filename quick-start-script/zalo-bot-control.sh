export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

LABEL="com.edwardfranklin.zalo-bot"
APP_DIR="$HOME/.zalo-bot-control"
RUN_SCRIPT="$APP_DIR/zalo-bot-run.sh"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/zalo-bot-control"
PROJECT_DIR="/Volumes/MacintoshHD-Data/DATA/code/zalo-tg"
SETTINGS_FILE="$APP_DIR/settings.conf"

mkdir -p "$APP_DIR" "$HOME/Library/LaunchAgents" "$LOG_DIR"

# ── Đọc / ghi cấu hình ─────────────────────────────────────────────────────────

load_settings() {
  LOG_RETENTION_DAYS=7
  if [[ -f "$SETTINGS_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$SETTINGS_FILE"
  fi
}

save_settings() {
  cat > "$SETTINGS_FILE" <<EOF
LOG_RETENTION_DAYS=$LOG_RETENTION_DAYS
EOF
}

load_settings

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

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:\$PATH"

PROJECT_DIR="/Volumes/MacintoshHD-Data/DATA/code/zalo-tg"
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

/usr/bin/git checkout dev >> "\$LOG_DIR/git.log" 2>&1
/usr/bin/pkill telegram-bot-api 2>/dev/null || true
npm run build >> "\$LOG_DIR/build.log" 2>&1

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

# ── Các thao tác chính ─────────────────────────────────────────────────────────

is_loaded() {
  launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1
}

start_bot() {
  clean_old_logs
  write_run_script
  write_plist
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  osascript -e 'display dialog "Đã bật bot thành công.\n\nBot sẽ tự chạy khi bạn đăng nhập.\nLog cũ sẽ tự xóa theo lịch đã cấu hình." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
}

stop_bot() {
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f "node dist/index.js" >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  osascript -e 'display dialog "Đã tắt bot." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
}

restart_bot() {
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f "node dist/index.js" >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  clean_old_logs
  write_run_script
  write_plist
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  osascript -e 'display dialog "Đã khởi động lại bot thành công." buttons {"OK"} default button "OK" with title "Zalo Bot Control"'
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

  # Kiểm tra input là số nguyên không âm
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

clean_logs_now() {
  clean_old_logs
  osascript <<OSA
display dialog "Đã dọn xong log cũ hơn $LOG_RETENTION_DAYS ngày.

Xem chi tiết tại: cleanup.log" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

show_help() {
  osascript <<OSA
display dialog "Cách dùng:
1. Chọn Bật bot để cài và chạy.
2. Chọn Khởi động lại bot để nạp lại code mới / reset bot.
3. Chọn Xem trạng thái để kiểm tra.
4. Chọn Mở log để xem lỗi.
5. Chọn Tắt bot để dừng.
6. Chọn Cấu hình xóa log để đặt số ngày giữ log.
7. Chọn Xóa log ngay để dọn log cũ thủ công." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
}

# ── Menu chính ──────────────────────────────────────────────────────────────────

CHOICE=$(osascript <<'OSA'
set picked to choose from list {"Bật bot", "Khởi động lại bot", "Tắt bot", "Xem trạng thái", "Mở log", "Cấu hình xóa log", "Xóa log ngay", "Hướng dẫn"} with prompt "Chọn thao tác:" with title "Zalo Bot Control" default items {"Bật bot"} OK button name "Chọn" cancel button name "Thoát"
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
  "Hướng dẫn")         show_help ;;
  *)                   exit 0 ;;
esac