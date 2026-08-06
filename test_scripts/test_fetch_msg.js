import { Telegraf } from 'telegraf';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  for (let id = 125746; id >= 125740; id--) {
    try {
      const res = await bot.telegram.copyMessage(-1003968219458, -1003968219458, id, { message_thread_id: 11 });
      console.log(`Copied ${id}`);
    } catch (e) {
      console.log(`Error copying ${id}:`, e.message);
    }
  }
}
run();
