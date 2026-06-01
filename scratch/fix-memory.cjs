const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()`,
`let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let strongDelegate = AppDelegate()
// Keep a strong reference to prevent deallocation
var globalRetain: Any? = strongDelegate 
app.delegate = strongDelegate
app.run()`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
