const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/install-menu-bar.sh', 'utf8');

code = code.replace(
  'BIN_PATH="$APP_DIR/ZaloBotMenu"',
  'APP_BUNDLE="$APP_DIR/ZaloBotMenu.app"\nBIN_PATH="$APP_BUNDLE/Contents/MacOS/ZaloBotMenu"'
);

code = code.replace(
  'mkdir -p "$APP_DIR"\nswiftc "$SCRIPT_DIR/ZaloBotMenu.swift" -o "$BIN_PATH"',
  `mkdir -p "$APP_BUNDLE/Contents/MacOS"
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
</dict>
</plist>
PLISTEOF`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/install-menu-bar.sh', code);
