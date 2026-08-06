import fs from 'node:fs';
import zlib from 'node:zlib';
const path = './data/msg-map.json';
const raw = fs.readFileSync(path);
try {
  let buf = raw;
  if (buf[0] === 0x1F && buf[1] === 0x8B) buf = zlib.gunzipSync(buf);
  const data = JSON.parse(buf.toString('utf8'));
  console.log("Loaded V2 msg-map.json");
  const hits = [];
  if (data.v === 2) {
    for (const p of data.p) {
      if (JSON.stringify(p).includes("1019361911723446503")) {
        hits.push(p);
      }
    }
    for (const q of data.q) {
      const zaloId = data.s[q[8]];
      if (zaloId === "1019361911723446503") {
        hits.push(q);
      }
    }
  }
  console.log("Hits for Quăn's threadId (1019361911723446503):", JSON.stringify(hits, null, 2));
} catch (e) {
  console.log("Error:", e);
}
