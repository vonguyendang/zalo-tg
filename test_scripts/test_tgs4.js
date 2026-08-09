import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';

async function main() {
  console.log('Testing convertTgsToGif with pinjump.json...');
  try {
     const gifPath = await convertTgsToGif('pinjump.json');
     console.log('GIF generated:', gifPath, (await stat(gifPath)).size, 'bytes');
     const { execSync } = require('child_process');
     execSync(`ffmpeg -i ${gifPath} -vf scale=1:1 -vframes 1 -f rawvideo -pix_fmt rgba test.raw -y`);
     const fs = require('fs');
     const buf = fs.readFileSync('test.raw');
     console.log('RGBA:', buf[0], buf[1], buf[2], buf[3]);
  } catch (e) {
     console.log('Error:', e);
  }
}
main();
