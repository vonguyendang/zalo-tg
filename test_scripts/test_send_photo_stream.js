import { Telegraf } from 'telegraf';
import fs from 'node:fs';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    console.log("Sending stream to Telegram...");
    const stream = fs.createReadStream('./test.jpg');
    const msg = await bot.telegram.sendPhoto(-1003968219458, { source: stream }, { message_thread_id: 11 });
    console.log("Success photo! Message ID:", msg.message_id);
  } catch (e) {
    console.error("Error photo:", e);
  }
}
run();
