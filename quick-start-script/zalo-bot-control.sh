export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
echo "Called with args: $@" >> /tmp/zalo_control_debug.log
exec >> /tmp/zalo_control_debug.log 2>&1

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
EOF
}

load_settings

send_tg_notification() {
  local raw_message="$1"
  if [[ -f "$PROJECT_DIR/.env" ]]; then
    local token chat_id
    token=$(grep -E '^TG_TOKEN=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"'\'' ' | tr -d '\r')
    chat_id=$(grep -E '^TG_GROUP_ID=' "$PROJECT_DIR/.env" | cut -d '=' -f2- | tr -d '"'\'' ' | tr -d '\r')
    if [[ -n "$token" && -n "$chat_id" ]]; then
      python3 - <<PYEOF &
import urllib.request, urllib.parse, json, sys
data = json.dumps({
  "chat_id": "$chat_id",
  "text": """$raw_message""",
  "parse_mode": "HTML"
}).encode()
req = urllib.request.Request(
  "https://api.telegram.org/bot$token/sendMessage",
  data=data,
  headers={"Content-Type": "application/json"}
)
try:
  urllib.request.urlopen(req, timeout=5)
except Exception as e:
  pass
PYEOF
    fi
  fi
}

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

if [[ -f "\$SETTINGS_FILE" ]]; then source "\$SETTINGS_FILE"; fi
/usr/bin/git checkout "${BOT_BRANCH:-multi-zalo}" >> "\$LOG_DIR/git.log" 2>&1
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
  local silent="${1:-}"
  clean_old_logs
  write_run_script
  write_plist
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  send_tg_notification "🚀 <b>Zalo Bridge đã khởi động</b>

✅ Hệ thống đang hoạt động.
🌐 Nhánh: <code>$BOT_BRANCH</code>
📂 Thư mục: <code>$PROJECT_DIR</code>"
  if [[ "$silent" != "silent" ]]; then
    osascript -e 'tell me' -e 'activate' -e 'display dialog "Bot started successfully.\n\nIt will auto-run on login.\nOld logs will be cleaned up based on your settings." buttons {"OK"} default button "OK" with title "Zalo Bot Control"' -e 'end tell'
  fi
}

stop_bot() {
  local silent="${1:-}"
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f "node dist/index.js" >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  send_tg_notification "🛑 <b>Zalo Bridge đã dừng hoạt động.</b>

❌ Bot hiện không nhận hoặc gửi bất kỳ tin nhắn nào.
💡 Để khởi động lại, chọn <b>Start bot</b> hoặc <b>Restart bot</b> từ Menu Bar."
  if [[ "$silent" != "silent" ]]; then
    osascript -e 'tell me' -e 'activate' -e 'display dialog "Bot stopped." buttons {"OK"} default button "OK" with title "Zalo Bot Control"' -e 'end tell'
  fi
}

restart_bot() {
  local silent="${1:-}"
  launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
  /usr/bin/pkill -f "node dist/index.js" >/dev/null 2>&1 || true
  /usr/bin/pkill telegram-bot-api >/dev/null 2>&1 || true
  clean_old_logs
  write_run_script
  write_plist
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  launchctl kickstart -k "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  send_tg_notification "⏳ <b>Zalo Bridge đang khởi động lại...</b>

🔄 Đang khởi tạo ứng dụng và chuẩn bị kết nối lại các tài khoản Zalo.
⏱ Vui lòng đợi khoảng <b>15–30 giây</b> để bot sẵn sàng.

<i>Bạn sẽ nhận được thông báo xác nhận khi bot hoạt động trở lại.</i>"
  if [[ "$silent" != "silent" ]]; then
    osascript -e 'tell me' -e 'activate' -e 'display dialog "Bot restarted successfully." buttons {"OK"} default button "OK" with title "Zalo Bot Control"' -e 'end tell'
  fi
}

show_status() {
  if is_loaded; then
    STATUS="RUNNING"
  else
    STATUS="STOPPED"
  fi
  send_tg_notification "ℹ️ <b>Kiểm tra:</b> Trạng thái hiện tại của hệ thống là <b>$STATUS</b>."
  osascript <<OSA
tell me
activate
display dialog "Status: $STATUS

Project: $PROJECT_DIR
Log: $LOG_DIR
Auto-clean logs after: $LOG_RETENTION_DAYS days" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
end tell
OSA
}

open_logs() {
  open -a Finder "$LOG_DIR"
}

set_log_retention() {
  local current="$LOG_RETENTION_DAYS"
  local input
  input=$(osascript <<OSA
tell me
activate
set retentionDays to text returned of (display dialog "Enter number of days to keep logs (0 = disable auto-clean):\n\nCurrent: $current days" default answer "$current" buttons {"Cancel", "Save"} default button "Save" cancel button "Cancel" with title "Zalo Bot Control – Log Config")
return retentionDays
end tell
OSA
  ) || return 0

  # Kiểm tra input là số nguyên không âm
  if ! [[ "$input" =~ ^[0-9]+$ ]]; then
    osascript -e 'tell me' -e 'activate' -e 'display dialog "Invalid value. Please enter an integer >= 0." buttons {"OK"} default button "OK" with title "Zalo Bot Control"' -e 'end tell'
    return 1
  fi

  LOG_RETENTION_DAYS="$input"
  save_settings

  send_tg_notification "⚙️ <b>Cấu hình Log:</b> Đã thiết lập tự động xóa log sau <b>$input</b> ngày."

  if [[ "$input" -eq 0 ]]; then
    osascript -e 'tell me' -e 'activate' -e 'display dialog "Auto-clean logs is disabled." buttons {"OK"} default button "OK" with title "Zalo Bot Control"' -e 'end tell'
  else
    osascript <<OSA
tell me
activate
display dialog "Saved: auto-clean logs after $input days.

Logs older than $input days will be deleted on bot startup." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
end tell
OSA
  fi
}


set_branch() {
  local current="$BOT_BRANCH"
  local input
  input=$(osascript <<OSA
tell me
activate
set branchName to text returned of (display dialog "Enter the branch name to run the bot:\n\nCurrent: $current" default answer "$current" buttons {"Cancel", "Save"} default button "Save" cancel button "Cancel" with title "Zalo Bot Control – Change Branch")
return branchName
end tell
OSA
  ) || return 0

  if [[ -z "$input" ]]; then
    osascript -e 'tell me' -e 'activate' -e 'display dialog "Branch name cannot be empty." buttons {"OK"} default button "OK" with title "Zalo Bot Control"' -e 'end tell'
    return 1
  fi

  BOT_BRANCH="$input"
  save_settings

  send_tg_notification "🌿 <b>Cấu hình Nhánh:</b> Đã đổi sang nhánh mã nguồn <b>$BOT_BRANCH</b>.\n\n<i>Hệ thống sẽ áp dụng nhánh này khi khởi động.</i>"

  osascript <<OSA
tell me
activate
display dialog "Saved new branch: $BOT_BRANCH\n\nThe bot will be restarted with this branch." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
end tell
OSA
  restart_bot
}

clean_logs_now() {
  clean_old_logs
  send_tg_notification "🧹 <b>Dọn dẹp Log:</b> Đã dọn sạch các file log cũ hơn <b>$LOG_RETENTION_DAYS</b> ngày."
  osascript <<OSA
tell me
activate
display dialog "Cleaned up logs older than $LOG_RETENTION_DAYS days.

See details in: cleanup.log" buttons {"OK"} default button "OK" with title "Zalo Bot Control"
end tell
OSA
}

show_help() {
  osascript <<OSA
tell me
activate
display dialog "Usage:\n1. Start bot: Install and run.\n2. Restart bot: Reload code/reset.\n3. Show status: Check status.\n4. Open logs: View errors.\n5. Stop bot: Stop running.\n6. Log retention config: Set days to keep logs.\n7. Clean logs now: Manually delete old logs.\n8. Branch config: Change branch." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
end tell
OSA
}

# ── Menu chính hoặc gọi qua argument ──────────────────────────────────────────

if [[ $# -gt 0 ]]; then
  case "$1" in
    start_bot)         start_bot ;;
    start_bot_silent)  start_bot silent ;;
    stop_bot)          stop_bot ;;
    stop_bot_silent)   stop_bot silent ;;
    restart_bot)       restart_bot ;;
    restart_bot_silent)restart_bot silent ;;
    show_status)       show_status ;;
    open_logs)         open_logs ;;
    set_log_retention) set_log_retention ;;
    clean_logs_now)    clean_logs_now ;;
    set_branch)        set_branch ;;
    show_help)         show_help ;;
    *)                 echo "Command not found: $1" ; exit 1 ;;
  esac
  exit 0
fi

CHOICE=$(osascript <<'OSA'
tell me
activate
set picked to choose from list {"Start bot", "Restart bot", "Stop bot", "Show status", "Open logs", "Log retention config", "Clean logs now", "Branch config", "Help"} with prompt "Select an action:" with title "Zalo Bot Control" default items {"Start bot"} OK button name "Select" cancel button name "Quit"
if picked is false then
	return "Quit"
else
	return item 1 of picked
end if
end tell
OSA
)

case "$CHOICE" in
  "Start bot")           start_bot ;;
  "Restart bot") restart_bot ;;
  "Stop bot")           stop_bot ;;
  "Show status")    show_status ;;
  "Open logs")            open_logs ;;
  "Log retention config")  set_log_retention ;;
  "Clean logs now")      clean_logs_now ;;
  "Branch config")    set_branch ;;
  "Help")         show_help ;;
  *)                   exit 0 ;;
esac