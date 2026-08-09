import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';

async function main() {
  console.log('Testing convertTgsToGif with real.tgs...');
  try {
     const gifPath = await convertTgsToGif('real.tgs');
     console.log('GIF generated:', gifPath, (await stat(gifPath)).size, 'bytes');
     const mp4Path = await convertAnimatedToMp4(gifPath);
     console.log('MP4 generated:', mp4Path, (await stat(mp4Path)).size, 'bytes');
     console.log('Running ffprobe...');
     const { execSync } = require('child_process');
     console.log(execSync(`ffprobe -v error -show_entries stream=width,height,r_frame_rate,nb_frames,codec_name,pix_fmt -of json ${mp4Path}`).toString());
  } catch (e) {
     console.log('Error:', e);
  }
}
main();
