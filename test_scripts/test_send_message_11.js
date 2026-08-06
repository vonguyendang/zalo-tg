import { Telegraf } from 'telegraf';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    const res = await bot.telegram.sendMessage(-1003968219458, 'Test text', { message_thread_id: 11 });
    console.log("Success text! Message ID:", res.message_id);
  } catch (e) {
    console.error("Error text:", e.message);
  }
}
run();
