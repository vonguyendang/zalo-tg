const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`class AppDelegate: NSObject, NSApplicationDelegate {`,
`class AppDelegate: NSObject, NSApplicationDelegate {
    static let shared = AppDelegate()`
);

code = code.replace(
`let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let strongDelegate = AppDelegate()
// Keep a strong reference to prevent deallocation
var globalRetain: Any? = strongDelegate 
app.delegate = strongDelegate
app.run()`,
`let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.delegate = AppDelegate.shared
app.run()`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
