import { Telegraf } from 'telegraf';
import path from 'path';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    const localPath = 'file://' + path.resolve('./test.jpg');
    const msg = await bot.telegram.sendDocument(-1003968219458, localPath, { message_thread_id: 11 });
    console.log("Success doc!", msg.message_id);
  } catch (e) {
    console.error("Error doc:", e);
  }
}
run();
