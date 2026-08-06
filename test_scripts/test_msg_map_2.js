import fs from 'node:fs';
import zlib from 'node:zlib';
const path = './data/msg-map.json';
const raw = fs.readFileSync(path);
try {
  let buf = raw;
  if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
  const data = JSON.parse(buf.toString('utf8'));
  const hits = [];
  const zaloIdIndex = data.s.indexOf("1019361911723446503");
  console.log("Index of Quăn:", zaloIdIndex);
  for (const p of data.p) {
    if (p[3] === zaloIdIndex) {
      hits.push(p);
    }
  }
  // Print only the last 10 hits
  console.log("Last 10 hits:", JSON.stringify(hits.slice(-10), null, 2));
} catch (e) {
  console.log("Error:", e);
}
