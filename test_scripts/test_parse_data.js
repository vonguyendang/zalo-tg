import fs from 'node:fs';
const raw = `H4sIAAAAAAAAAE2PQQvCMAyF/0vOFdpNUXr1IB48qScRKWsYhW0dSRVk7L+bzc15/F5e8l46QKJIjyJ6BKvVhDUyu1IUAAXeJQe2gzrS11NzyWBvdwUlxWd7+mErOwsVFTq6NoTOD0oHwV+inFwZOVo5TmI9ehF2JsvXervJcm3m2b4K81iLFPgwRI3x6d1Kj0wBFwmsEYFHVy+ZHqvwQkI/dWDE5r/reWFEli9DbAbs+w9iuXQUCgEAAA==`;
import zlib from 'node:zlib';
const buf = Buffer.from(raw, 'base64');
const unzipped = zlib.unzipSync(buf);
console.log(JSON.parse(unzipped.toString('utf8')));
