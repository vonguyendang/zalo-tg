import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    static let shared = AppDelegate()
    var statusItem: NSStatusItem!
    var timer: Timer?

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        
        let menu = NSMenu()
        
        let m1 = NSMenuItem(title: "Start bot", action: #selector(startBot), keyEquivalent: ""); m1.target = self; menu.addItem(m1)
        let m2 = NSMenuItem(title: "Restart bot", action: #selector(restartBot), keyEquivalent: ""); m2.target = self; menu.addItem(m2)
        let m3 = NSMenuItem(title: "Stop bot", action: #selector(stopBot), keyEquivalent: ""); m3.target = self; menu.addItem(m3)
        menu.addItem(NSMenuItem.separator())
        let m4 = NSMenuItem(title: "Show status", action: #selector(showStatus), keyEquivalent: ""); m4.target = self; menu.addItem(m4)
        let m5 = NSMenuItem(title: "Open logs", action: #selector(openLogs), keyEquivalent: ""); m5.target = self; menu.addItem(m5)
        let m6 = NSMenuItem(title: "Log retention config", action: #selector(setLogRetention), keyEquivalent: ""); m6.target = self; menu.addItem(m6)
        let m7 = NSMenuItem(title: "Clean logs now", action: #selector(cleanLogsNow), keyEquivalent: ""); m7.target = self; menu.addItem(m7)
        let m8 = NSMenuItem(title: "Branch config", action: #selector(setBranch), keyEquivalent: ""); m8.target = self; menu.addItem(m8)
        let m9 = NSMenuItem(title: "Help / Guide", action: #selector(showHelp), keyEquivalent: ""); m9.target = self; menu.addItem(m9)
        menu.addItem(NSMenuItem.separator())
        let m10 = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"); m10.target = self; menu.addItem(m10)
        
        statusItem.menu = menu
        
        updateStatus()
        timer = Timer.scheduledTimer(timeInterval: 5.0, target: self, selector: #selector(updateStatus), userInfo: nil, repeats: true)
    }

    func createIcon(color: NSColor) -> NSImage {
        let size = NSSize(width: 16, height: 16)
        let image = NSImage(size: size)
        image.lockFocus()
        
        color.set()
        let circlePath = NSBezierPath(ovalIn: NSRect(origin: .zero, size: size))
        circlePath.fill()
        
        let text = "Z"
        let font = NSFont.boldSystemFont(ofSize: 11)
        let textAttributes: [NSAttributedString.Key: Any] = [
            .font: font,
            .foregroundColor: NSColor.white
        ]
        
        let textSize = text.size(withAttributes: textAttributes)
        let textRect = NSRect(
            x: (size.width - textSize.width) / 2.0,
            y: (size.height - textSize.height) / 2.0 - 0.5,
            width: textSize.width,
            height: textSize.height
        )
        text.draw(in: textRect, withAttributes: textAttributes)
        
        image.unlockFocus()
        image.isTemplate = false // Keep the original color
        return image
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
                statusItem.button?.title = ""
                statusItem.button?.image = createIcon(color: NSColor.systemGreen)
            } else {
                statusItem.button?.title = ""
                statusItem.button?.image = createIcon(color: NSColor.systemRed)
            }
        } catch {
            statusItem.button?.title = ""
            statusItem.button?.image = createIcon(color: NSColor.systemGray)
        }
    }

    func getProjectDir() -> String? {
        let settingsPath = NSHomeDirectory() + "/.zalo-bot-control/settings.conf"
        guard let content = try? String(contentsOfFile: settingsPath, encoding: .utf8) else { return nil }
        for line in content.components(separatedBy: .newlines) {
            if line.hasPrefix("PROJECT_DIR=") {
                return line.replacingOccurrences(of: "PROJECT_DIR=", with: "").trimmingCharacters(in: CharacterSet(charactersIn: "\"\'"))
            }
        }
        return nil
    }

    func runControlScript(action: String, silent: Bool = false) {
        DispatchQueue.global(qos: .background).async {
            guard let projectDir = self.getProjectDir() else {
                DispatchQueue.main.async {
                    let alert = NSAlert()
                    alert.messageText = "Lỗi cấu hình"
                    alert.informativeText = "Không tìm thấy thư mục dự án. Vui lòng mở Terminal và chạy file zalo-bot-control.sh hoặc nhấp đúp vào file đó một lần để hệ thống tự động ghi nhận đường dẫn."
                    alert.alertStyle = .critical
                    alert.addButton(withTitle: "OK")
                    alert.runModal()
                }
                return
            }
            let task = Process()
            let scriptPath = projectDir + "/quick-start-script/zalo-bot-control.sh"
            task.launchPath = "/bin/bash"
            
            let arg = silent ? "\(action)_silent" : action
            task.arguments = [scriptPath, arg]
            
            do {
                try task.run()
                task.waitUntilExit()
            } catch {
                print("Lỗi khi chạy lệnh: \(error)")
            }
        }
    }

    @objc func startBot() {
        runControlScript(action: "start_bot", silent: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.updateStatus() }
    }

    @objc func stopBot() {
        runControlScript(action: "stop_bot", silent: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { self.updateStatus() }
    }

    @objc func restartBot() {
        runControlScript(action: "restart_bot", silent: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { self.updateStatus() }
    }

    @objc func showStatus() {
        runControlScript(action: "show_status", silent: false)
    }

    @objc func openLogs() {
        runControlScript(action: "open_logs", silent: false)
    }

    @objc func setLogRetention() {
        runControlScript(action: "set_log_retention", silent: false)
    }

    @objc func cleanLogsNow() {
        runControlScript(action: "clean_logs_now", silent: false)
    }

    @objc func setBranch() {
        runControlScript(action: "set_branch", silent: false)
    }

    @objc func showHelp() {
        runControlScript(action: "show_help", silent: false)
    }

    @objc func quit() {
        NSApplication.shared.terminate(self)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.delegate = AppDelegate.shared
app.run()
