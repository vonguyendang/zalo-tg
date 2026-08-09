const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`    @objc func showStatus() {
        try? "showStatus clicked\\n".write(toFile: "/tmp/swift_debug.log", atomically: true, encoding: .utf8)
        runControlScript(action: "show_status", silent: false)
    }`,
`    @objc func showStatus() {
        let alert = NSAlert()
        alert.messageText = "Test Menu"
        alert.informativeText = "Nếu bạn thấy bảng này, nghĩa là menu đã nhận được thao tác click!"
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Tuyệt vời")
        NSApplication.shared.activate(ignoringOtherApps: true)
        alert.runModal()
    }`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
