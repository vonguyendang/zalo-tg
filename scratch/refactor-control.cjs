const fs = require('fs');

function refactorScript(file) {
  let code = fs.readFileSync(file, 'utf8');

  // Add argument handling
  code = code.replace(
    "# ── Các thao tác chính",
    `# ── Gọi hàm trực tiếp từ argument ─────────────────────────────────────────────
if [[ $# -gt 0 ]]; then
  case "$1" in
    start_bot_silent) start_bot silent ;;
    stop_bot_silent) stop_bot silent ;;
    restart_bot_silent) restart_bot silent ;;
  esac
  exit 0
fi

# ── Các thao tác chính`
  );

  // Update load_settings
  code = code.replace(
    "  LOG_RETENTION_DAYS=7\n  if [[ -f \"$SETTINGS_FILE\" ]]; then",
    "  LOG_RETENTION_DAYS=7\n  BOT_BRANCH=\"multi-zalo\"\n  if [[ -f \"$SETTINGS_FILE\" ]]; then"
  );

  // Update save_settings
  code = code.replace(
    "cat > \"$SETTINGS_FILE\" <<EOF\nLOG_RETENTION_DAYS=$LOG_RETENTION_DAYS\nEOF",
    "cat > \"$SETTINGS_FILE\" <<EOF\nLOG_RETENTION_DAYS=$LOG_RETENTION_DAYS\nBOT_BRANCH=\"$BOT_BRANCH\"\nEOF"
  );

  // Update write_run_script git checkout
  code = code.replace(
    "/usr/bin/git checkout multi-zalo >> \"\\$LOG_DIR/git.log\" 2>&1",
    "if [[ -f \"\\$SETTINGS_FILE\" ]]; then source \"\\$SETTINGS_FILE\"; fi\n/usr/bin/git checkout \"${BOT_BRANCH:-multi-zalo}\" >> \"\\$LOG_DIR/git.log\" 2>&1"
  );

  // Update start_bot, stop_bot, restart_bot to accept silent flag
  code = code.replace(
    "start_bot() {",
    "start_bot() {\n  local silent=\"${1:-}\""
  ).replace(
    "  osascript -e 'display dialog \"Đã bật bot thành công.\\n\\nBot sẽ tự chạy khi bạn đăng nhập.\\nLog cũ sẽ tự xóa theo lịch đã cấu hình.\" buttons {\"OK\"} default button \"OK\" with title \"Zalo Bot Control\"'",
    "  if [[ \"$silent\" != \"silent\" ]]; then\n    osascript -e 'display dialog \"Đã bật bot thành công.\\n\\nBot sẽ tự chạy khi bạn đăng nhập.\\nLog cũ sẽ tự xóa theo lịch đã cấu hình.\" buttons {\"OK\"} default button \"OK\" with title \"Zalo Bot Control\"'\n  fi"
  );

  code = code.replace(
    "stop_bot() {",
    "stop_bot() {\n  local silent=\"${1:-}\""
  ).replace(
    "  osascript -e 'display dialog \"Đã tắt bot.\" buttons {\"OK\"} default button \"OK\" with title \"Zalo Bot Control\"'",
    "  if [[ \"$silent\" != \"silent\" ]]; then\n    osascript -e 'display dialog \"Đã tắt bot.\" buttons {\"OK\"} default button \"OK\" with title \"Zalo Bot Control\"'\n  fi"
  );

  code = code.replace(
    "restart_bot() {",
    "restart_bot() {\n  local silent=\"${1:-}\""
  ).replace(
    "  osascript -e 'display dialog \"Đã khởi động lại bot thành công.\" buttons {\"OK\"} default button \"OK\" with title \"Zalo Bot Control\"'",
    "  if [[ \"$silent\" != \"silent\" ]]; then\n    osascript -e 'display dialog \"Đã khởi động lại bot thành công.\" buttons {\"OK\"} default button \"OK\" with title \"Zalo Bot Control\"'\n  fi"
  );

  // Add set_branch function
  const setBranchFn = `
set_branch() {
  local current="$BOT_BRANCH"
  local input
  input=$(osascript <<OSA
set branchName to text returned of (display dialog "Nhập tên nhánh (branch) để chạy bot:\\n\\nHiện tại: $current" default answer "$current" buttons {"Hủy", "Lưu"} default button "Lưu" cancel button "Hủy" with title "Zalo Bot Control – Đổi nhánh")
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
display dialog "Đã lưu nhánh mới: $BOT_BRANCH\\n\\nBot sẽ được khởi động lại với nhánh này." buttons {"OK"} default button "OK" with title "Zalo Bot Control"
OSA
  restart_bot
}
`;
  code = code.replace("clean_logs_now() {", setBranchFn + "\nclean_logs_now() {");

  // Add to show_help
  code = code.replace(
    "7. Chọn Xóa log ngay để dọn log cũ thủ công.\"",
    "7. Chọn Xóa log ngay để dọn log cũ thủ công.\\n8. Chọn Cấu hình nhánh để đổi branch.\""
  );

  // Add to menu
  code = code.replace(
    "{\"Bật bot\", \"Khởi động lại bot\", \"Tắt bot\", \"Xem trạng thái\", \"Mở log\", \"Cấu hình xóa log\", \"Xóa log ngay\", \"Hướng dẫn\"}",
    "{\"Bật bot\", \"Khởi động lại bot\", \"Tắt bot\", \"Xem trạng thái\", \"Mở log\", \"Cấu hình xóa log\", \"Xóa log ngay\", \"Cấu hình nhánh\", \"Hướng dẫn\"}"
  );

  code = code.replace(
    "  \"Xóa log ngay\")      clean_logs_now ;;\n  \"Hướng dẫn\")         show_help ;;",
    "  \"Xóa log ngay\")      clean_logs_now ;;\n  \"Cấu hình nhánh\")    set_branch ;;\n  \"Hướng dẫn\")         show_help ;;"
  );

  fs.writeFileSync(file, code);
}

refactorScript('quick-start-script/zalo-bot-control.sh');
refactorScript('quick-start-script/zalo-bot-onefile.command');
console.log('Refactored control scripts');
