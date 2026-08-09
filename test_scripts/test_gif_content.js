import fs from 'fs';
const { execSync } = require('child_process');

try {
  // We can use ffmpeg to dump the first frame as PNG
  execSync('ffmpeg -y -i /tmp/zalo-tg/telegram_sticker-1786254093395-47698-2ihcy4x.gif -vframes 1 frame.png');
  const size = fs.statSync('frame.png').size;
  console.log('PNG size:', size);
} catch (e) {
  console.log(e);
}
