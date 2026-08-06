import { Zalo } from 'zca-js';
async function test() {
  const zalo = new Zalo();
  console.log("Requesting QR...");
  await zalo.loginQR({}, (event) => {
    console.log("Event:", event.type);
    if (event.type === 0) {
      console.log("QR Generated. Saving...");
      event.actions.saveToFile("test-qr.png").then(() => {
        console.log("Saved!");
        process.exit(0);
      });
    }
  });
}
test().catch(console.error);
