import { Telegraf } from 'telegraf';
import fetch from 'node-fetch';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    const res = await fetch('https://photo-stal-2.zdn.vn/no/jpg/7c21a59ee49d22c37b8c/2aOboQpdBsMYOgsl3zIWcMa7AG4r2FHymO6RfYBc.jpg');
    const buffer = await res.buffer();
    console.log("Downloaded photo, sending to Telegram...");
    const msg = await bot.telegram.sendPhoto(-1003968219458, { source: buffer }, { message_thread_id: 11 });
    console.log("Success photo! Message ID:", msg.message_id);
  } catch (e) {
    console.error("Error photo:", e);
  }
}
run();
