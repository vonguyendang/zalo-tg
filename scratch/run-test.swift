import Foundation
let task = Process()
task.launchPath = "/bin/bash"
let scriptPath = "/Volumes/MacintoshHD-Data/DATA/code/zalo-tg/quick-start-script/zalo-bot-control.sh"
let args = "show_status"
task.arguments = ["-c", "\"\\(scriptPath)\" \\(args)"]
do {
    try task.run()
    task.waitUntilExit()
    print("Task finished with status: \\(task.terminationStatus)")
} catch {
    print("Error: \\(error)")
}
