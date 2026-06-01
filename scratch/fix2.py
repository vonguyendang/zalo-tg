import re

with open('quick-start-script/zalo-bot-control.sh', 'r') as f:
    code = f.read()

# Fix the backslash issue in single quotes
code = code.replace(r'\"System Events\"', '"System Events"')

# Fix missed heredoc
code = re.sub(
    r"set retentionDays to text returned of \(display dialog (.*?)\)",
    r'tell application "System Events"\nactivate\nset retentionDays to text returned of (display dialog \1)\nend tell',
    code
)

code = re.sub(
    r"set branchName to text returned of \(display dialog (.*?)\)",
    r'tell application "System Events"\nactivate\nset branchName to text returned of (display dialog \1)\nend tell',
    code
)

with open('quick-start-script/zalo-bot-control.sh', 'w') as f:
    f.write(code)
