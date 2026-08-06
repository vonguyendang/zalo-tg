import { tgBot } from './src/telegram/bot.js';
import { config } from './src/config.js';
import { createReadStream } from 'fs';
import path from 'path';

async function test() {
  console.log("Sending photo...");
  try {
    await tgBot.telegram.sendPhoto(config.telegram.groupId, { source: createReadStream('test-qr.png') });
    console.log("Sent successfully!");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
test();
