import fs from 'fs';
const log = fs.readFileSync('/Users/dangvo/Library/Logs/zalo-bot-control/app.log', 'utf8');
const lines = log.split('\n');
let found = -1;
for(let i=0; i<lines.length; i++) {
  if (lines[i].includes('msgType=chat.photo')) {
    found = i;
  }
}
if (found !== -1) {
  console.log(lines.slice(found, found+50).join('\n'));
} else {
  console.log('Not found');
}
