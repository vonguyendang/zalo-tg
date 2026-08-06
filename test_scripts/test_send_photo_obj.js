import { Telegraf } from 'telegraf';
import path from 'path';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    const localPath = 'file://' + path.resolve('./test.jpg');
    const msg = await bot.telegram.sendPhoto(-1003968219458, { url: localPath, filename: 'custom.jpg' }, { message_thread_id: 11 });
    console.log("Success photo!", msg.message_id);
  } catch (e) {
    console.error("Error photo:", e);
  }
}
run();
