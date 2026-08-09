import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';
import { execSync } from 'child_process';
import fs from 'fs';

const tgsFile = 'data/bot-api/8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w/stickers/file_0.tgs';

async function main() {
  console.log('=== FINAL TEST: Python lottie → GIF → MP4 ===');
  const t0 = Date.now();
  
  const gifPath = await convertTgsToGif(tgsFile);
  const gifSize = (await stat(gifPath)).size;
  console.log(`GIF: ${gifPath} (${gifSize} bytes) [${Date.now()-t0}ms]`);
  
  const mp4Path = await convertAnimatedToMp4(gifPath);
  const mp4Size = (await stat(mp4Path)).size;
  console.log(`MP4: ${mp4Path} (${mp4Size} bytes) [${Date.now()-t0}ms]`);
  
  // Check content
  execSync(`ffmpeg -y -i ${mp4Path} -vf "select=eq(n\\,15),scale=20:20" -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/final_frame.raw 2>/dev/null`);
  const buf = fs.readFileSync('/tmp/final_frame.raw');
  let nonWhite = 0;
  for (let i = 0; i < buf.length; i += 3) {
    if (buf[i] < 240 || buf[i+1] < 240 || buf[i+2] < 240) nonWhite++;
  }
  console.log(`MP4 frame 15: ${nonWhite}/400 non-white pixels → ${nonWhite > 10 ? '✅ HAS CONTENT' : '❌ BLANK'}`);
}
main().catch(e => console.error(e));
