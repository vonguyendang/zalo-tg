import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';
import { execSync } from 'child_process';
import fs from 'fs';

// Simulate a real temp path download (the file the bot would create)
const tgsFile = '/tmp/lottie_python.gif'; // We already have a valid GIF

async function main() {
  // Test convertAnimatedToMp4 on known good GIF
  console.log('=== Testing MP4 conversion on known good GIF ===');
  const mp4Path = await convertAnimatedToMp4(tgsFile);
  const mp4Size = (await stat(mp4Path)).size;
  console.log(`MP4: ${mp4Path} (${mp4Size} bytes)`);
  
  execSync(`ffmpeg -y -i ${mp4Path} -vf "select=eq(n\\,15),scale=20:20" -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/final2_frame.raw 2>/dev/null`);
  const buf = fs.readFileSync('/tmp/final2_frame.raw');
  let nonWhite = 0;
  for (let i = 0; i < buf.length; i += 3) {
    if (buf[i] < 240 || buf[i+1] < 240 || buf[i+2] < 240) nonWhite++;
  }
  console.log(`MP4 frame: ${nonWhite}/400 non-white pixels → ${nonWhite > 10 ? '✅ HAS CONTENT' : '❌ BLANK'}`);
}
main().catch(e => console.error(e));
