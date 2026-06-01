const fs = require('fs');

let code = fs.readFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', 'utf8');

code = code.replace(
`            do {
                try task.run()
            } catch {
                print("Lỗi khi chạy lệnh: \\(error)")
            }`,
`            do {
                try task.run()
                task.waitUntilExit()
            } catch {
                print("Lỗi khi chạy lệnh: \\(error)")
            }`
);

fs.writeFileSync('quick-start-script/mac-menu-bar/ZaloBotMenu.swift', code);
