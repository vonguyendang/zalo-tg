const { Telegraf } = require('telegraf');
const http = require('http');
const bot = new Telegraf('123:abc', {
  telegram: { apiRoot: 'http://localhost:8888' }
});

const server = http.createServer((req, res) => {
  console.log(req.method, req.url);
  req.on('data', d => console.log('DATA:', d.toString()));
  req.on('end', () => { res.end('{"ok":true,"result":{}}'); process.exit(0); });
});
server.listen(8888, async () => {
  await bot.telegram.sendPhoto(123, 'file:///tmp/test.jpg');
});
