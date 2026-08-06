import fs from 'node:fs';
import zlib from 'node:zlib';
const path = './data/msg-map.json';
const raw = fs.readFileSync(path);
try {
  let buf = raw;
  if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
  const data = JSON.parse(buf.toString('utf8'));
  const recent = data.p.filter(p => p[1] > 125570);
  console.log("Recent pairs:");
  for (const p of recent) {
    console.log(`tgId: ${p[1]}, zMsgId: ${p[0]}, accId: ${data.s[p[2]]}`);
  }
} catch (e) {
  console.log("Error:", e);
}
