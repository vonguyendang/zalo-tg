const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
  'let app = NSApplication.shared\nlet delegate = AppDelegate()\napp.delegate = delegate\napp.run()',
  'let app = NSApplication.shared\napp.setActivationPolicy(.accessory)\nlet delegate = AppDelegate()\napp.delegate = delegate\napp.run()'
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
