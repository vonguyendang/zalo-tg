import { Telegraf } from 'telegraf';
const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});
async function run() {
  try {
    console.log("Sending URL to Telegram...");
    const msg = await bot.telegram.sendPhoto(-1003968219458, 'https://photo-stal-2.zdn.vn/no/jpg/7c21a59ee49d22c37b8c/2aOboQpdBsMYOgsl3zIWcMa7AG4r2FHymO6RfYBc.jpg', { message_thread_id: 11 });
    console.log("Success photo! Message ID:", msg.message_id);
  } catch (e) {
    console.error("Error photo:", e);
  }
}
run();
