const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const https = require('https');

const bot = new Telegraf(process.env.BOT_TOKEN, {
  telegram: { apiRoot: 'http://localhost:8081' }
});

const groupId = -1003968219458;

async function test() {
  const url = 'https://f65-zpg-r.zdn.vn/jpg/1912873688211658992/16ab4fa713389266cb29.jpg';
  const localPath = path.join(process.cwd(), 'kim_loi.jpg');
  
  console.log('Downloading...');
  await new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const w = fs.createWriteStream(localPath);
      res.pipe(w);
      w.on('finish', () => resolve());
    }).on('error', reject);
  });
  
  console.log('Downloaded. Size:', fs.statSync(localPath).size);
  
  try {
    console.log('Sending with file:// ...');
    await bot.telegram.sendPhoto(groupId, 'file://' + localPath);
    console.log('Success!');
  } catch(e) {
    console.error('Error:', e.message);
  }
}
test();
