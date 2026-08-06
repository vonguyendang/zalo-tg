import { Zalo } from 'zca-js';
import { readFileSync } from 'fs';
const z = new Zalo();
const creds = JSON.parse(readFileSync('./sessions/credentials_1508995969111268915.json'));
z.cookie = creds.cookie;
z.imei = creds.imei;
z.zpw_sek = creds.zpw_sek;
z.zpwServiceMap = creds.zpwServiceMap;

async function run() {
  try {
    const groups = []; // zca-js doesn't have getAllGroups directly exposed in API? Let's check api exports.
    // wait, I can just read topics.json to see if 11405043480515562 is in there!
  } catch (e) {
    console.error(e);
  }
}
run();
