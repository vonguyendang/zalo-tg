import { tgBot } from './src/telegram/bot.js';
import { config } from './src/config.js';
import qrcode from 'qrcode-terminal';

async function test() {
  qrcode.generate("test code", { small: true }, async (qrStr) => {
    try {
      await tgBot.telegram.sendMessage(config.telegram.groupId, `<pre>\n${qrStr}\n</pre>`, { parse_mode: 'HTML' });
      console.log("Sent ascii QR!");
    } catch (e) {
      console.error(e);
    }
    process.exit(0);
  });
}
test();
