import fs from 'node:fs';
import zlib from 'node:zlib';
const path = './data/msg-map.json';
const raw = fs.readFileSync(path);
try {
  let buf = raw;
  if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
  const data = JSON.parse(buf.toString('utf8'));
  let maxTgId = 0;
  for (const p of data.p) {
    if (p[1] > maxTgId) maxTgId = p[1];
  }
  console.log("Max tgId in msg-map.json:", maxTgId);
  const recent = data.p.filter(p => p[1] > 125565);
  console.log("Recent tgIds:", recent.map(p => p[1]));
} catch (e) {
  console.log("Error:", e);
}
