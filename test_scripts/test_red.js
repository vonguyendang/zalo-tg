import fs from 'fs';
import { execSync } from 'child_process';
try {
  execSync('ffmpeg -i /tmp/zalo-tg/telegram_sticker-1786254093395-47698-2ihcy4x.gif -vf scale=1:1 -vframes 1 -f rawvideo -pix_fmt rgba test.raw -y');
  const buf = fs.readFileSync('test.raw');
  console.log('RGBA:', buf[0], buf[1], buf[2], buf[3]);
} catch(e) {
  console.log(e);
}
