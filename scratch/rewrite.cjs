const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`        func addItem(title: String, action: Selector?) {
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
        addItem(title: "Thoát Menu Bar", action: #selector(quit))`,
`        let m1 = NSMenuItem(title: "Bật bot", action: #selector(startBot), keyEquivalent: ""); m1.target = self; menu.addItem(m1)
        let m2 = NSMenuItem(title: "Khởi động lại bot", action: #selector(restartBot), keyEquivalent: ""); m2.target = self; menu.addItem(m2)
        let m3 = NSMenuItem(title: "Tắt bot", action: #selector(stopBot), keyEquivalent: ""); m3.target = self; menu.addItem(m3)
        menu.addItem(NSMenuItem.separator())
        let m4 = NSMenuItem(title: "Xem trạng thái", action: #selector(showStatus), keyEquivalent: ""); m4.target = self; menu.addItem(m4)
        let m5 = NSMenuItem(title: "Mở log", action: #selector(openLogs), keyEquivalent: ""); m5.target = self; menu.addItem(m5)
        let m6 = NSMenuItem(title: "Cấu hình xóa log", action: #selector(setLogRetention), keyEquivalent: ""); m6.target = self; menu.addItem(m6)
        let m7 = NSMenuItem(title: "Xóa log ngay", action: #selector(cleanLogsNow), keyEquivalent: ""); m7.target = self; menu.addItem(m7)
        let m8 = NSMenuItem(title: "Cấu hình nhánh", action: #selector(setBranch), keyEquivalent: ""); m8.target = self; menu.addItem(m8)
        let m9 = NSMenuItem(title: "Hướng dẫn", action: #selector(showHelp), keyEquivalent: ""); m9.target = self; menu.addItem(m9)
        menu.addItem(NSMenuItem.separator())
        let m10 = NSMenuItem(title: "Thoát Menu Bar", action: #selector(quit), keyEquivalent: "q"); m10.target = self; menu.addItem(m10)`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
