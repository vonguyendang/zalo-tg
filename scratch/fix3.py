import re

with open('quick-start-script/zalo-bot-control.sh', 'r') as f:
    code = f.read()

code = code.replace('tell application "System Events"', "tell me")

with open('quick-start-script/zalo-bot-control.sh', 'w') as f:
    f.write(code)
