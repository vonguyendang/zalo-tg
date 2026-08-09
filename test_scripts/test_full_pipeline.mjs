import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';
import { execSync } from 'child_process';
import fs from 'fs';

async function main() {
  console.log('=== Full pipeline test with new code ===');
  
  // Step 1: TGS → GIF (with white background)
  const gifPath = await convertTgsToGif('real.tgs');
  const gifSize = (await stat(gifPath)).size;
  console.log(`GIF: ${gifPath} (${gifSize} bytes)`);
  
  // Check GIF pixel content
  execSync(`ffmpeg -y -i ${gifPath} -vf "select=eq(n\\,5),scale=10:10" -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/gif_frame.raw 2>/dev/null`);
  const gifBuf = fs.readFileSync('/tmp/gif_frame.raw');
  console.log('GIF frame 5 first pixel RGB:', gifBuf[0], gifBuf[1], gifBuf[2]);
  
  // Step 2: GIF → MP4 (new simple filter)
  const mp4Path = await convertAnimatedToMp4(gifPath);
  const mp4Size = (await stat(mp4Path)).size;
  console.log(`MP4: ${mp4Path} (${mp4Size} bytes)`);
  
  // Check MP4 pixel content
  execSync(`ffmpeg -y -i ${mp4Path} -vf "select=eq(n\\,5),scale=10:10" -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/mp4_frame.raw 2>/dev/null`);
  const mp4Buf = fs.readFileSync('/tmp/mp4_frame.raw');
  console.log('MP4 frame 5 first pixel RGB:', mp4Buf[0], mp4Buf[1], mp4Buf[2]);
  
  // Check if ALL pixels are white (which would mean blank video)
  let allWhite = true;
  for (let i = 0; i < mp4Buf.length; i += 3) {
    if (mp4Buf[i] < 240 || mp4Buf[i+1] < 240 || mp4Buf[i+2] < 240) {
      allWhite = false;
      break;
    }
  }
  console.log('MP4 frame is all white?', allWhite);
  
  // Show ffprobe info
  const probe = execSync(`ffprobe -v error -show_entries stream=width,height,nb_frames,duration -of json ${mp4Path}`).toString();
  console.log('ffprobe:', probe);
}
main().catch(e => console.error(e));
