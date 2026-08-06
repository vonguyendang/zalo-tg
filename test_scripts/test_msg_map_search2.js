import fs from 'fs';
import zlib from 'zlib';
const raw = fs.readFileSync('./data/msg-map.json');
let buf = raw;
if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
const data = JSON.parse(buf.toString('utf8'));
const found = data.p.filter(p => p[0].includes("1786016094037") || p[0].includes("8123563342952"));
console.log("Found:", found);
