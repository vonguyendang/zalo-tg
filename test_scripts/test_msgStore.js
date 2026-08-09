import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
const data = JSON.parse(gunzipSync(readFileSync('./data/msg-map.json')).toString('utf8'));
for (const msg of Object.values(data)) {
  if (msg.raw && msg.raw.includes('chat.gif')) {
    console.log(msg.raw);
    break;
  }
}
