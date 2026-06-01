import re

with open('quick-start-script/zalo-bot-control.sh', 'r') as f:
    code = f.read()

# Replace single-line display dialog
code = re.sub(r"osascript -e 'display dialog ([^']+)'", 
              r"osascript -e 'tell application \"System Events\"' -e 'activate' -e 'display dialog \1' -e 'end tell'", code)

# Replace multiline heredoc display dialog
def replace_heredoc_dialog(match):
    return f"osascript <<OSA\ntell application \"System Events\"\nactivate\ndisplay dialog {match.group(1)}\nend tell\nOSA"
code = re.sub(r"osascript <<OSA\ndisplay dialog (.*?)\nOSA", replace_heredoc_dialog, code, flags=re.DOTALL)

# Replace multiline heredoc display dialog with text returned
def replace_heredoc_text(match):
    return f"osascript <<OSA\ntell application \"System Events\"\nactivate\nset {match.group(1)} to text returned of (display dialog {match.group(2)})\nend tell\nOSA"
code = re.sub(r"osascript <<OSA\nset (.*?) to text returned of \(display dialog (.*?)\)\nOSA", replace_heredoc_text, code, flags=re.DOTALL)

# Replace choose from list
def replace_choose(match):
    return f"osascript <<'OSA'\ntell application \"System Events\"\nactivate\nset picked to choose from list {match.group(1)}\nend tell\nOSA"
code = re.sub(r"osascript <<'OSA'\nset picked to choose from list (.*?)\nOSA", replace_choose, code, flags=re.DOTALL)

# Fix open logs
code = code.replace('open "$LOG_DIR"', 'open -a Finder "$LOG_DIR"')

with open('quick-start-script/zalo-bot-control.sh', 'w') as f:
    f.write(code)
