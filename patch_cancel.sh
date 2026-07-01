#!/bin/bash
cat src/telegram/handler.ts | sed -e 's/await tgBot.telegram.sendPhoto(/await tgBot.telegram.sendPhoto(chatId, { source: createReadStream(imagePath) }, { ...msgOpts, caption: "📱 Mở ứng dụng <b>Zalo<\/b> → Cài đặt → Quét mã QR để đăng nhập.", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "🛑 Dừng phiên đăng nhập", callback_data: `login_cancel:web:session` }]] } }); \/\//g' > temp.ts
mv temp.ts src/telegram/handler.ts
