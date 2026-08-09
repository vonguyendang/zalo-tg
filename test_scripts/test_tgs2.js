import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { stat } from 'fs/promises';

async function main() {
  console.log('Testing convertTgsToGif with sample.tgs...');
  try {
     const gifPath = await convertTgsToGif('sample.tgs');
     console.log('GIF generated:', gifPath, (await stat(gifPath)).size, 'bytes');
     const mp4Path = await convertAnimatedToMp4(gifPath);
     console.log('MP4 generated:', mp4Path, (await stat(mp4Path)).size, 'bytes');
  } catch (e) {
     console.log('Error:', e);
  }
}
main();
