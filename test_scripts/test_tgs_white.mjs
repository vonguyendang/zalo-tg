import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';
import { execSync } from 'child_process';
import fs from 'fs';

async function main() {
  console.log('=== Testing convertTgsToGif with white background ===');
  const gifPath = await convertTgsToGif('real.tgs');
  console.log('GIF:', gifPath, (await stat(gifPath)).size, 'bytes');

  // Extract first frame as raw RGBA pixels to check
  execSync(`ffmpeg -y -i ${gifPath} -vf scale=1:1 -vframes 1 -f rawvideo -pix_fmt rgba /tmp/test_frame.raw`);
  const buf = fs.readFileSync('/tmp/test_frame.raw');
  console.log('GIF frame RGBA:', buf[0], buf[1], buf[2], buf[3]);

  const mp4Path = await convertAnimatedToMp4(gifPath);
  console.log('MP4:', mp4Path, (await stat(mp4Path)).size, 'bytes');

  // Check MP4 first frame
  execSync(`ffmpeg -y -i ${mp4Path} -vf scale=1:1 -vframes 1 -f rawvideo -pix_fmt rgb24 /tmp/test_mp4_frame.raw`);
  const mp4Buf = fs.readFileSync('/tmp/test_mp4_frame.raw');
  console.log('MP4 frame RGB:', mp4Buf[0], mp4Buf[1], mp4Buf[2]);
}
main().catch(e => console.error(e));
