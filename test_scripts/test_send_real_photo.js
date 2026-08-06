import { Telegraf } from 'telegraf';
import fs from 'fs';
import { execSync } from 'child_process';
const bot = new Telegraf('8208837233:AAGxQOlxYLRKOZUnxAwzHAp48pnxoyIWO8w', {
  telegram: { apiRoot: 'http://localhost:8081' }
});
execSync('curl -s https://photo-stal-24.zdn.vn/no/jpg/a7652ec625c4e39abad5/2aOboQpdd0I1X4pXncTvunHxSq7ojzOSZvMat160.jpg -o /tmp/test_real_photo.jpg');
console.log("Sending real photo...");
bot.telegram.sendPhoto(-1003968219458, 'file:///tmp/test_real_photo.jpg', { message_thread_id: 11 })
  .then(res => { console.log("Success:", res.message_id); process.exit(0); })
  .catch(err => { console.log("Error:", err.message); process.exit(1); });
