import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    static let shared = AppDelegate()
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "M"
        
        let menu = NSMenu()
        let item = NSMenuItem(title: "ClickMe", action: #selector(doClick), keyEquivalent: "")
        item.target = self
        menu.addItem(item)
        
        statusItem.menu = menu
    }
    
    @objc func doClick() {
        let task = Process()
        task.launchPath = "/usr/bin/touch"
        task.arguments = ["/tmp/minimal_clicked.txt"]
        try? task.run()
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.delegate = AppDelegate.shared
app.run()
