const fs = require('fs');

let code = fs.readFileSync('quick-start-script/zalo-bot-control.sh', 'utf8');

// Fix display dialogs
code = code.replace(/osascript -e 'display dialog/g, "osascript -e 'tell application \"System Events\"' -e 'activate' -e 'display dialog");
code = code.replace(/'$/gm, function(match, offset, str) {
    if (str.substring(offset - 100, offset).includes("System Events")) {
        return "' -e 'end tell'";
    }
    return match;
});

// For heredoc osascripts
code = code.replace(/osascript <<OSA\\ndisplay dialog/g, "osascript <<OSA\\ntell application \"System Events\"\\nactivate\\ndisplay dialog");
code = code.replace(/OSA$/gm, function(match, offset, str) {
    if (str.substring(offset - 50, offset).includes("display dialog")) {
        return "end tell\\nOSA";
    }
    return match;
});

// Let's just do a brute force replacement for all specific dialogs in the script
fs.writeFileSync('quick-start-script/zalo-bot-control.sh', code);
