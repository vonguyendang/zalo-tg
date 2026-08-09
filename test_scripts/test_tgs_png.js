import { LottieAnimation, createCanvas } from '@napi-rs/canvas';
import fs from 'fs';

try {
  const data = fs.readFileSync('real.tgs');
  const animation = LottieAnimation.loadFromData(data);
  const canvas = createCanvas(animation.width, animation.height);
  const ctx = canvas.getContext('2d');
  animation.seekFrame(10);
  animation.render(ctx, { x: 0, y: 0, width: animation.width, height: animation.height });
  fs.writeFileSync('out.png', canvas.toBuffer('image/png'));
  console.log('Done. Size:', fs.statSync('out.png').size);
} catch(e) {
  console.log(e);
}
