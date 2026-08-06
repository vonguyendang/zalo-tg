import { Zalo } from 'zca-js';
import { readFileSync } from 'fs';
const z = new Zalo();
const creds = JSON.parse(readFileSync('./sessions/credentials_1508995969111268915.json'));
z.cookie = creds.cookie;
z.imei = creds.imei;
z.zpw_sek = creds.zpw_sek;
z.zpwServiceMap = creds.zpwServiceMap;
console.log(z.zpwServiceMap);
