import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';
import { execSync } from 'child_process';
import fs from 'fs';

const tgsFile = 'data/bot-api/8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w/stickers/file_0.tgs';

async function main() {
  console.log('=== Testing with REAL Telegram TGS (55KB) ===');
  
  const gifPath = await convertTgsToGif(tgsFile);
  const gifSize = (await stat(gifPath)).size;
  console.log(`GIF: ${gifPath} (${gifSize} bytes)`);
  
  // Check multiple pixels across the GIF
  execSync(`ffmpeg -y -i ${gifPath} -vf "select=eq(n\\,10),scale=20:20" -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/real_gif_frame.raw 2>/dev/null`);
  const gifBuf = fs.readFileSync('/tmp/real_gif_frame.raw');
  let nonWhite = 0;
  for (let i = 0; i < gifBuf.length; i += 3) {
    if (gifBuf[i] < 240 || gifBuf[i+1] < 240 || gifBuf[i+2] < 240) nonWhite++;
  }
  console.log(`GIF frame 10 (20x20 = 400 pixels): ${nonWhite} non-white pixels`);
  console.log(`GIF corner pixel RGB: ${gifBuf[0]}, ${gifBuf[1]}, ${gifBuf[2]}`);
  console.log(`GIF center pixel RGB: ${gifBuf[600]}, ${gifBuf[601]}, ${gifBuf[602]}`);
  
  const mp4Path = await convertAnimatedToMp4(gifPath);
  const mp4Size = (await stat(mp4Path)).size;
  console.log(`MP4: ${mp4Path} (${mp4Size} bytes)`);
  
  execSync(`ffmpeg -y -i ${mp4Path} -vf "select=eq(n\\,10),scale=20:20" -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/real_mp4_frame.raw 2>/dev/null`);
  const mp4Buf = fs.readFileSync('/tmp/real_mp4_frame.raw');
  let mp4NonWhite = 0;
  for (let i = 0; i < mp4Buf.length; i += 3) {
    if (mp4Buf[i] < 240 || mp4Buf[i+1] < 240 || mp4Buf[i+2] < 240) mp4NonWhite++;
  }
  console.log(`MP4 frame 10 (20x20 = 400 pixels): ${mp4NonWhite} non-white pixels`);
  console.log(`MP4 corner pixel RGB: ${mp4Buf[0]}, ${mp4Buf[1]}, ${mp4Buf[2]}`);
  console.log(`MP4 center pixel RGB: ${mp4Buf[600]}, ${mp4Buf[601]}, ${mp4Buf[602]}`);
}
main().catch(e => console.error(e));
