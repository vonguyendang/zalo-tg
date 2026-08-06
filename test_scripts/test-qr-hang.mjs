import { Zalo } from 'zca-js';
import qrcode from 'qrcode-terminal';

async function test() {
  const zalo = new Zalo();
  console.log("Requesting QR...");
  await zalo.loginQR({}, (event) => {
    console.log("Event:", event.type);
    if (event.type === 0) {
      console.log("Generating QR...");
      const { code } = event.data;
      
      qrcode.generate(code, { small: true }, (qrStr) => {
        console.log("QR STR GENERATED!");
        console.log(qrStr);
        process.exit(0);
      });
    }
  });
}
test().catch(console.error);
