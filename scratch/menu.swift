import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!
    var timer: Timer?

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Bật Bot", action: #selector(startBot), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Tắt Bot", action: #selector(stopBot), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Khởi động lại", action: #selector(restartBot), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Mở Log", action: #selector(openLogs), keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Thoát Menu Bar", action: #selector(quit), keyEquivalent: "q"))
        
        statusItem.menu = menu
        
        updateStatus()
        timer = Timer.scheduledTimer(timeInterval: 5.0, target: self, selector: #selector(updateStatus), userInfo: nil, repeats: true)
    }

    @objc func updateStatus() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "launchctl print gui/$(id -u)/com.edwardfranklin.zalo-bot"]
        
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe
        
        do {
            try task.run()
            task.waitUntilExit()
            if task.terminationStatus == 0 {
                statusItem.button?.title = "🟢 ZaloBot"
            } else {
                statusItem.button?.title = "🔴 ZaloBot"
            }
        } catch {
            statusItem.button?.title = "⚪️ ZaloBot"
        }
    }

    @objc func startBot() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "/Users/dangvo/Projects/zalo-tg/quick-start-script/zalo-bot-control.sh start_bot_silent"]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.updateStatus() }
    }

    @objc func stopBot() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "/Users/dangvo/Projects/zalo-tg/quick-start-script/zalo-bot-control.sh stop_bot_silent"]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.updateStatus() }
    }

    @objc func restartBot() {
        let task = Process()
        task.launchPath = "/bin/bash"
        task.arguments = ["-c", "/Users/dangvo/Projects/zalo-tg/quick-start-script/zalo-bot-control.sh restart_bot_silent"]
        try? task.run()
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { self.updateStatus() }
    }

    @objc func openLogs() {
        let task = Process()
        task.launchPath = "/usr/bin/open"
        task.arguments = [NSHomeDirectory() + "/Library/Logs/zalo-bot-control"]
        try? task.run()
    }

    @objc func quit() {
        NSApplication.shared.terminate(self)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
