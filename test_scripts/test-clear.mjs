import qrcode from 'qrcode-terminal';
qrcode.generate('test', { small: true }, (qrStr) => {
  console.clear();
  console.log('OK');
});
