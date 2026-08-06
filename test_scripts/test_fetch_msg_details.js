import { Telegraf } from 'telegraf';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
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
// Actually let's just forward them to a dummy topic or use getUpdates or forwardMessage.
// Wait, bots can't fetch arbitrary message by ID unless they use forwardMessage.
bot.telegram.forwardMessage(-1003968219458, -1003968219458, 125746, { message_thread_id: 11 }).then(msg => console.log("125746:", JSON.stringify(msg.photo || msg.text || msg.caption))).catch(e => console.log("Err 125746:", e.message));
bot.telegram.forwardMessage(-1003968219458, -1003968219458, 125745, { message_thread_id: 11 }).then(msg => console.log("125745:", JSON.stringify(msg.photo || msg.text || msg.caption))).catch(e => console.log("Err 125745:", e.message));
