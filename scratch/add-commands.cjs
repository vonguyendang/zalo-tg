const fs = require('fs');
let code = fs.readFileSync('src/index.ts', 'utf8');

const newCommands = `    { command: 'accounts',       description: 'Xem các tài khoản Zalo đang đăng nhập' },
    { command: 'logout',         description: 'Đăng xuất tài khoản Zalo' },
    { command: 'login',          description: 'Đăng nhập Zalo qua QR code' },`;

code = code.replace(
  "{ command: 'login',          description: 'Đăng nhập Zalo qua QR code' },",
  newCommands
);

fs.writeFileSync('src/index.ts', code);
console.log('Added commands to index.ts');
