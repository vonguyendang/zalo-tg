import fs from 'fs';
import zlib from 'zlib';
const raw = fs.readFileSync('./data/msg-map.json');
let buf = raw;
if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
const data = JSON.parse(buf.toString('utf8'));
const found = data.p.filter(p => p[0].includes("1786014120742") || p[0].includes("8123457347840"));
console.log("Found:", found);
