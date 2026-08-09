import { Zalo } from 'zca-js';
import fs from 'fs';
const cookie = fs.readFileSync('cookie.txt', 'utf8') || ''; // wait, how does zalo-tg authenticate?
