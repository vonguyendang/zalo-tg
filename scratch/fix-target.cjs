const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Bật bot", action: #selector(startBot), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Khởi động lại bot", action: #selector(restartBot), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Tắt bot", action: #selector(stopBot), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Xem trạng thái", action: #selector(showStatus), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Mở log", action: #selector(openLogs), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Cấu hình xóa log", action: #selector(setLogRetention), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Xóa log ngay", action: #selector(cleanLogsNow), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Cấu hình nhánh", action: #selector(setBranch), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Hướng dẫn", action: #selector(showHelp), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Thoát Menu Bar", action: #selector(quit), keyEquivalent: "q"))`,
`        let menu = NSMenu()
        
        func addItem(title: String, action: Selector?) {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            menu.addItem(item)
        }
        
        addItem(title: "Bật bot", action: #selector(startBot))
        addItem(title: "Khởi động lại bot", action: #selector(restartBot))
        addItem(title: "Tắt bot", action: #selector(stopBot))
        menu.addItem(NSMenuItem.separator())
        addItem(title: "Xem trạng thái", action: #selector(showStatus))
        addItem(title: "Mở log", action: #selector(openLogs))
        addItem(title: "Cấu hình xóa log", action: #selector(setLogRetention))
        addItem(title: "Xóa log ngay", action: #selector(cleanLogsNow))
        addItem(title: "Cấu hình nhánh", action: #selector(setBranch))
        addItem(title: "Hướng dẫn", action: #selector(showHelp))
        menu.addItem(NSMenuItem.separator())
        addItem(title: "Thoát Menu Bar", action: #selector(quit))`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
