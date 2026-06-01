import Cocoa

class AppDelegate: NSObject, NSApplicationDelegate {
    static let shared = AppDelegate()
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "TEST"
        
        let menu = NSMenu()
        let item = NSMenuItem(title: "Click", action: #selector(clicked), keyEquivalent: "")
        item.target = self
        menu.addItem(item)
        
        statusItem.menu = menu
    }
    
    @objc func clicked() {
        try? "Menu clicked!".write(toFile: "/tmp/menu_test.log", atomically: true, encoding: .utf8)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
app.delegate = AppDelegate.shared
app.run()
