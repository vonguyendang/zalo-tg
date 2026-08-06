const fs = require('fs');
const logs = fs.readFileSync('/Users/dangvo/Library/Logs/zalo-bot-control/app.log', 'utf-8');
const lines = logs.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('threadId=1399234744969599482 msgType=chat.photo')) {
    let msgId = '';
    for (let j = Math.max(0, i-5); j < Math.min(lines.length, i+15); j++) {
      if (lines[j].includes('"msgId":')) {
         msgId = lines[j].trim();
         break;
      }
    }
    console.log(lines[i].split(']')[0] + ']', msgId);
  }
}
