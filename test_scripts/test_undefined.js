import { Telegraf } from 'telegraf';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    const msg = await bot.telegram.sendPhoto(-1003968219458, 'file://undefined', { message_thread_id: 11 });
    console.log("Success!", msg.message_id);
  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
