import { apiFactory } from 'zca-js';
import fs from 'fs';
import path from 'path';

// Load credentials
const creds = JSON.parse(fs.readFileSync('./data/bot-api/credentials.json', 'utf8'));
const { imei, cookie, userAgent } = creds;

// We need a logged in API instance. Actually we can just use the running bot to test if we can send a message.
