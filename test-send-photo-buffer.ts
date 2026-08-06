import { tgBot } from './src/telegram/bot.js';
import { config } from './src/config.js';
import { promises as fs } from 'fs';
import path from 'path';

async function test() {
  console.log("Sending photo with buffer...");
  try {
    const buffer = await fs.readFile('test-qr.png');
    await tgBot.telegram.sendPhoto(config.telegram.groupId, { source: buffer });
    console.log("Sent successfully!");
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}
test();
