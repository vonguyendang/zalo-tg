const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`    @objc func showStatus() {
        runControlScript(action: "show_status", silent: false)
    }`,
`    @objc func showStatus() {
        try? "showStatus clicked\\n".write(toFile: "/tmp/swift_debug.log", atomically: true, encoding: .utf8)
        runControlScript(action: "show_status", silent: false)
    }`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
