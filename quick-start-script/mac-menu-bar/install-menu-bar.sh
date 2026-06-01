#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/.zalo-bot-control"
APP_BUNDLE="$APP_DIR/ZaloBotMenu.app"
BIN_PATH="$APP_BUNDLE/Contents/MacOS/ZaloBotMenu"
PLIST_PATH="$HOME/Library/LaunchAgents/com.edwardfranklin.zalobotmenu.plist"

echo "Đang biên dịch ứng dụng Status Bar..."
mkdir -p "$APP_BUNDLE/Contents/MacOS"
swiftc "$SCRIPT_DIR/ZaloBotMenu.swift" -o "$BIN_PATH"

cat > "$APP_BUNDLE/Contents/Info.plist" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>ZaloBotMenu</string>
    <key>CFBundleIdentifier</key>
    <string>com.edwardfranklin.zalobotmenu</string>
    <key>CFBundleName</key>
    <string>ZaloBotMenu</string>
    <key>LSUIElement</key>
    <true/>
    <key>NSAppleEventsUsageDescription</key>
    <string>Ứng dụng cần quyền này để hiển thị các bảng thông báo cài đặt Zalo Bot.</string>
</dict>
</plist>
PLISTEOF

echo "Tạo cấu hình LaunchAgent để tự chạy khi mở máy..."
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.edwardfranklin.zalobotmenu</string>
  <key>ProgramArguments</key>
  <array>
    <string>$BIN_PATH</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

echo "Đang khởi động ứng dụng..."
launchctl bootout gui/$(id -u) "$PLIST_PATH" 2>/dev/null || true
launchctl bootstrap gui/$(id -u) "$PLIST_PATH"
launchctl kickstart -k gui/$(id -u)/com.edwardfranklin.zalobotmenu

echo "Hoàn tất! Bạn hãy nhìn lên góc phải màn hình (thanh Menu Bar) để thấy chữ Z."
