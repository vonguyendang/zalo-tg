import { Context } from 'telegraf';
import { getZaloApi, triggerQRLogin, clearCredentials } from '../../zalo/client.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { config } from '../../config.js';
import { tgBot } from '../bot.js';

export async function proxyCommand(ctx: Context) {
  if (!ctx.message || !('text' in ctx.message)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    await ctx.reply(
      '💡 <b>Cách dùng lệnh /proxy:</b>\n' +
      '<code>/proxy &lt;số điện thoại&gt; &lt;url&gt;</code> - Cài đặt proxy (VD: /proxy 0987654321 socks5://1.2.3.4:1080)\n' +
      '<code>/proxy &lt;số điện thoại&gt; clear</code> - Xoá proxy\n' +
      '<code>/proxy &lt;số điện thoại&gt; status</code> - Xem trạng thái proxy',
      { parse_mode: 'HTML' }
    );
    return;
  }

  const accountId = parts[1];
  const actionOrUrl = parts[2] || 'status';

  const credPath = path.join(config.zalo.credentialsDir, `credentials_${accountId}.json`);
  if (!existsSync(credPath)) {
    await ctx.reply(`⚠️ Không tìm thấy thông tin đăng nhập cho tài khoản ${accountId}. Hãy /login trước.`);
    return;
  }

  try {
    const creds = JSON.parse(readFileSync(credPath, 'utf8'));

    if (actionOrUrl.toLowerCase() === 'status') {
      const current = creds.proxy ? `<code>${creds.proxy}</code>` : 'Không có (Direct)';
      await ctx.reply(`📡 Trạng thái Proxy của ${accountId}:\n${current}`, { parse_mode: 'HTML' });
      return;
    }

    if (actionOrUrl.toLowerCase() === 'clear') {
      delete creds.proxy;
      writeFileSync(credPath, JSON.stringify(creds, null, 2), 'utf8');
      await ctx.reply(`✅ Đã xoá Proxy cho ${accountId}. Vui lòng Khởi động lại Bot để áp dụng!`);
      return;
    }

    // Set new proxy
    if (!actionOrUrl.startsWith('socks') && !actionOrUrl.startsWith('http')) {
      await ctx.reply(`⚠️ Lỗi: URL Proxy phải bắt đầu bằng socks5://, socks4:// hoặc http://`);
      return;
    }

    creds.proxy = actionOrUrl;
    writeFileSync(credPath, JSON.stringify(creds, null, 2), 'utf8');
    
    await ctx.reply(`✅ Đã lưu Proxy <code>${actionOrUrl}</code> cho ${accountId}.\n\n🔄 Vui lòng click Menu Bar -> <b>Khởi động lại bot</b> để hệ thống áp dụng IP mới!`, { parse_mode: 'HTML' });
  } catch (err) {
    await ctx.reply(`⚠️ Lỗi xử lý cấu hình: ${err}`);
  }
}
