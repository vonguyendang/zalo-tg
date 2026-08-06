import fs from 'node:fs';
import zlib from 'node:zlib';
const path = './data/msg-map.json';
const raw = fs.readFileSync(path);
try {
  let buf = raw;
  if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
  const data = JSON.parse(buf.toString('utf8'));
  const hits = [];
  const idx1 = data.s.indexOf("1019361911723446503");
  const idx2 = data.s.indexOf("1399234744969599482");
  for (const p of data.p) {
    if (p[3] === idx1 || p[3] === idx2) {
      hits.push(p);
    }
  }
  console.log("Hits:", JSON.stringify(hits.slice(-10), null, 2));
} catch (e) {
  console.log("Error:", e);
}
