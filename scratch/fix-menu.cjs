const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

// Fix runControlScript
code = code.replace(
`    func runControlScript(action: String, silent: Bool = false) {
        let task = Process()
        task.launchPath = "/bin/bash"
        var scriptPath = "/Volumes/MacintoshHD-Data/DATA/code/zalo-tg/quick-start-script/zalo-bot-control.sh"
        
        let args = silent ? "\(action)_silent" : action
        task.arguments = ["-c", "\\"\\(scriptPath)\\" \\(args)"]
        try? task.run()
    }`,
`    func runControlScript(action: String, silent: Bool = false) {
        DispatchQueue.global(qos: .background).async {
            let task = Process()
            task.launchPath = "/bin/bash"
            let scriptPath = "/Volumes/MacintoshHD-Data/DATA/code/zalo-tg/quick-start-script/zalo-bot-control.sh"
            
            let args = silent ? "\\(action)_silent" : action
            task.arguments = ["-c", "\\"\\(scriptPath)\\" \\(args)"]
            try? task.run()
            task.waitUntilExit()
        }
    }`
);

// Fix showStatus
code = code.replace(
`    @objc func showStatus() {
        let task = Process()
        task.launchPath = "/usr/bin/osascript"
        task.arguments = ["-e", "tell application \\"Terminal\\" to do script \\"/Volumes/MacintoshHD-Data/DATA/code/zalo-tg/quick-start-script/zalo-bot-control.sh show_status\\""]
        // We'll just run it directly so it pops up its own dialog.
        let directTask = Process()
        directTask.launchPath = "/bin/bash"
        directTask.arguments = ["-c", "\\"\\/Volumes/MacintoshHD-Data/DATA/code/zalo-tg/quick-start-script/zalo-bot-control.sh\\" show_status"]
        try? directTask.run()
    }`,
`    @objc func showStatus() {
        runControlScript(action: "show_status", silent: false)
    }`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
