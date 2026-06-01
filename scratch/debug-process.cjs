const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`            let args = silent ? "\\(action)_silent" : action
            task.arguments = ["-c", "\\"\\(scriptPath)\\" \\(args)"]
            try? task.run()
            task.waitUntilExit()`,
`            let args = silent ? "\\(action)_silent" : action
            let logCmd = "\\"\\(scriptPath)\\" \\(args) >> /tmp/zalomenu.log 2>&1"
            task.arguments = ["-c", logCmd]
            try? task.run()
            task.waitUntilExit()`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
