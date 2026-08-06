import { Telegraf } from 'telegraf';
import path from 'path';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    const localPath = 'file://' + path.resolve('./test.jpg');
    const msg = await bot.telegram.sendMediaGroup(-1003968219458, [
      { type: 'photo', media: localPath }
    ], { message_thread_id: 11 });
    console.log("Success media group!", msg[0].message_id);
  } catch (e) {
    console.error("Error media group:", e);
  }
}
run();
