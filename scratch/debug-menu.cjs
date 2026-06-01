const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`            let args = silent ? "\\(action)_silent" : action
            task.arguments = ["-c", "\\"\\(scriptPath)\\" \\(args)"]
            try? task.run()
            task.waitUntilExit()`,
`            let args = silent ? "\\(action)_silent" : action
            task.arguments = ["-c", "\\"\\(scriptPath)\\" \\(args) > /tmp/zalobotmenu.log 2>&1"]
            do {
                try task.run()
                task.waitUntilExit()
            } catch {
                try? String(describing: error).write(toFile: "/tmp/zalobotmenu_error.log", atomically: true, encoding: .utf8)
            }`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
