const { API } = require('zca-js');
async function test() {
  const zalo = new API();
  console.log("Requesting QR...");
  await zalo.loginQR({}, (event) => {
    console.log("Event:", event.type);
    if (event.type === 0) {
      console.log("QR Generated. Saving...");
      event.actions.saveToFile("test-qr.png").then(() => console.log("Saved!"));
    }
  });
}
test().catch(console.error);
