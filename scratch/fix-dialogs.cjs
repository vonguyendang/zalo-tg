const fs = require('fs');

let code = fs.readFileSync('quick-start-script/zalo-bot-control.sh', 'utf8');

code = code.replace(/osascript -e 'display dialog/g, "osascript -e 'tell application \"System Events\" to activate' -e 'tell application \"System Events\" to display dialog");
code = code.replace(/osascript <<OSA\\ndisplay dialog/g, "osascript <<OSA\\ntell application \"System Events\" to activate\\ntell application \"System Events\" to display dialog");
code = code.replace(/osascript <<'OSA'\\nset picked to choose from list/g, "osascript <<'OSA'\\ntell application \"System Events\" to activate\\ntell application \"System Events\" to set picked to choose from list");

// Also fix the other osascript blocks that have multiple lines
code = code.replace(/set retentionDays to text returned of \\(display dialog/g, 'tell application "System Events" to activate\\nset retentionDays to text returned of (tell application "System Events" to display dialog');
code = code.replace(/set branchName to text returned of \\(display dialog/g, 'tell application "System Events" to activate\\nset branchName to text returned of (tell application "System Events" to display dialog');

fs.writeFileSync('quick-start-script/zalo-bot-control.sh', code);
