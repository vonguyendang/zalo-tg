import { convertTgsToGif, convertAnimatedToMp4 } from './dist/utils/media.js';
import { readFile, copyFile } from 'fs/promises';

async function main() {
  console.log('Testing convertTgsToGif...');
  // Let's create a dummy tgs if we don't have one, or skip if none.
  console.log('Running ffmpeg on a dummy gif...');
  try {
     const p = await convertAnimatedToMp4('./nonexistent.gif');
     console.log('Done:', p);
  } catch (e) {
     console.log('Error as expected:', e.message);
  }
}
main();
