import { Telegraf } from 'telegraf';
import https from 'https';
import http from 'http';
import { config } from '../config.js';
import { createProxyAgent } from '../proxy.js';

// Force IPv4 to avoid ETIMEDOUT on systems where IPv6 is blocked/unreachable
const agent = new https.Agent({ family: 4 });
const localAgent = new http.Agent({ family: 4 });

export const BOT_COMMANDS = [
  { command: 'help',           description: 'Hướng dẫn sử dụng các lệnh' },
  { command: 'login',          description: 'Đăng nhập Zalo bằng QR (Web API)' },
  { command: 'loginweb',       description: 'Đăng nhập Zalo bằng QR (Web API, giống /login)' },
  { command: 'loginapp',       description: 'Đăng nhập Zalo bằng QR (PC App API)' },
  { command: 'accounts',       description: 'Xem danh sách tài khoản đang đăng nhập' },
  { command: 'logout',         description: 'Đăng xuất tài khoản khỏi hệ thống' },
  { command: 'search',         description: 'Tìm tên, nhóm hoặc số điện thoại' },
  { command: 'history',        description: 'Đồng bộ lịch sử chat cũ từ Zalo' },
  { command: 'call',           description: 'Gọi điện thoại Zalo' },
  { command: 'callgroup',      description: 'Gọi nhóm Zalo' },
  { command: 'group_info',     description: 'Xem thông tin & thành viên nhóm Zalo hiện tại' },
  { command: 'group_infoall',  description: 'Xem toàn bộ thành viên nhóm Zalo hiện tại' },
  { command: 'recall',         description: 'Thu hồi tin nhắn đã gửi sang Zalo' },
  { command: 'topic',          description: 'Quản lý topic: list | info | delete' },
  { command: 'history',        description: 'Nạp lịch sử chat nhóm vào topic hiện tại' },
  { command: 'autoreply',      description: 'Tự trả lời DM khi offline: on | off | status' },
  { command: 'addgroup',       description: 'Tạo nhóm Zalo mới từ topic hiện tại' },
  { command: 'addfriend',      description: 'Gửi lời mời kết bạn Zalo' },
  { command: 'friendrequests', description: 'Xem & duyệt lời mời kết bạn đang chờ' },
  { command: 'joingroup',      description: 'Tham gia nhóm Zalo qua link mời' },
  { command: 'leavegroup',     description: 'Rời nhóm Zalo của topic hiện tại' },
  { command: 'status',         description: 'Xem trạng thái kết nối & thống kê bridge' },
  { command: 'restart',        description: 'Khởi động lại bridge (chỉ admin)' },
  { command: 'admin',          description: 'Admin panel: trạng thái, cache, tra mapping' },
  { command: 'proxy',          description: 'Cài đặt proxy (SOCKS5/HTTP) cho tài khoản Zalo' },
  { command: 'update',         description: 'Kiểm tra bản cập nhật mới cho bridge' },
  { command: 'reconnect',      description: 'Kết nối lại Zalo bằng session cũ (khi bị ngắt)' },
  { command: 'setalias',       description: 'Đặt bí danh (alias) cho một tài khoản Zalo' },
  { command: 'whitelistbot',   description: 'Quản lý danh sách bot được phép gửi tin sang Zalo' },
  { command: 'seed',           description: 'Xem mã seed giải mã backup Zalo' },
];

export const COMMAND_DETAILS: Record<string, string> = {
  'login': 'Bắt đầu luồng đăng nhập Zalo qua Web API. Trả về mã QR để quét trên điện thoại.\n\n<b>Ví dụ:</b>\n<code>/login</code>',
  'loginweb': 'Đăng nhập Zalo bằng QR (Web API). Phiên được lưu vào credentials.json.\n\n<b>Ví dụ:</b>\n<code>/loginweb</code>',
  'loginapp': 'Đăng nhập Zalo bằng QR (PC App API). Dùng để tra cứu thành viên nhóm không bị giới hạn (rate-limit). Phiên được lưu vào app-session.json.\n\n<b>Ví dụ:</b>\n<code>/loginapp</code>',
  'accounts': 'Xem danh sách các tài khoản Zalo đang được đăng nhập và sử dụng.\n\n<b>Ví dụ:</b>\n<code>/accounts</code>',
  'logout': 'Đăng xuất tài khoản Zalo khỏi hệ thống.\n\n<b>Ví dụ:</b>\n<code>/logout</code>',
  'search': 'Tìm kiếm bạn bè, nhóm hoặc số điện thoại trên Zalo. Lệnh sẽ trả về các nút bấm để tạo topic chat tương ứng.\n\n<b>Tham số:</b> Từ khóa cần tìm\n<b>Ví dụ:</b>\n<code>/search anh tú</code>\n<code>/search 0901234567</code>',
  'history': 'Đồng bộ lịch sử chat cũ từ Zalo về topic hiện tại (chỉ hoạt động trong topic đã map với Zalo).\n\n<b>Ví dụ:</b>\n<code>/history</code>',
  'call': 'Gọi điện thoại thoại Zalo (Audio Call) cho người dùng trong topic hiện tại.\n\n<b>Ví dụ:</b>\n<code>/call</code>',
  'callgroup': 'Gọi điện thoại nhóm Zalo (Group Call) trong topic nhóm hiện tại.\n\n<b>Ví dụ:</b>\n<code>/callgroup</code>',
  'group_info': 'Xem thông tin cơ bản và thành viên của nhóm Zalo trong topic hiện tại.\n\n<b>Ví dụ:</b>\n<code>/group_info</code>',
  'group_infoall': 'Xem toàn bộ danh sách thành viên của nhóm Zalo trong topic hiện tại.\n\n<b>Ví dụ:</b>\n<code>/group_infoall</code>',
  'recall': 'Thu hồi tin nhắn do bot đã gửi sang Zalo.\n\n<b>Cách dùng:</b> Reply (trả lời) lại tin nhắn bạn muốn thu hồi và gõ lệnh:\n<code>/recall</code>',
  'topic': 'Quản lý topic Telegram hiện tại.\n\n<b>Tham số:</b> list | info | delete\n<b>Ví dụ:</b>\n<code>/topic list</code> - Liệt kê tất cả topic đang hoạt động\n<code>/topic info</code> - Xem thông tin Zalo của topic hiện tại\n<code>/topic delete</code> - Ngắt kết nối topic này khỏi Zalo',
  'addgroup': 'Tạo một nhóm Zalo mới dựa trên topic hiện tại.\n\n<b>Ví dụ:</b>\n<code>/addgroup</code>',
  'addfriend': 'Gửi lời mời kết bạn đến người dùng trong topic hiện tại.\n\n<b>Ví dụ:</b>\n<code>/addfriend</code>',
  'friendrequests': 'Xem danh sách và duyệt (chấp nhận/từ chối) các lời mời kết bạn đang chờ.\n\n<b>Ví dụ:</b>\n<code>/friendrequests</code>',
  'joingroup': 'Tham gia một nhóm Zalo thông qua đường link mời (zalo.me/g/xxxx).\n\n<b>Tham số:</b> URL nhóm\n<b>Ví dụ:</b>\n<code>/joingroup https://zalo.me/g/abcd123</code>',
  'leavegroup': 'Rời khỏi nhóm Zalo tương ứng với topic hiện tại.\n\n<b>Ví dụ:</b>\n<code>/leavegroup</code>',
  'status': 'Xem trạng thái kết nối của bridge, thông tin uptime, bộ nhớ.\n\n<b>Ví dụ:</b>\n<code>/status</code>',
  'admin': 'Mở bảng điều khiển (Admin panel) với các công cụ: xem cache, trạng thái, tra cứu mapping, quản lý whitelist bot.\n\n<b>Ví dụ:</b>\n<code>/admin</code>\n<code>/admin lookup</code> (Reply tin nhắn để tra mapping)',
  'proxy': 'Cài đặt proxy (SOCKS5/HTTP) để vượt tường lửa hoặc đổi IP cho bot.\n\n<b>Ví dụ:</b>\n<code>/proxy socks5://127.0.0.1:1080</code>',
  'update': 'Kiểm tra bản cập nhật mã nguồn mới nhất cho bot từ GitHub.\n\n<b>Ví dụ:</b>\n<code>/update</code>',
  'reconnect': 'Buộc kết nối lại (reconnect) Zalo bằng session cũ nếu chẳng may bị ngắt kết nối mà bot chưa tự khôi phục.\n\n<b>Ví dụ:</b>\n<code>/reconnect</code>',
  'setalias': 'Đặt bí danh (alias) dễ nhớ cho một tài khoản Zalo trong hệ thống multi-account.\n\n<b>Ví dụ:</b>\n<code>/setalias my_main_acc</code>',
  'whitelistbot': 'Quản lý danh sách các bot Telegram được phép gửi tin nhắn vào topic để đồng bộ sang Zalo.\n\n💡 <i>Mẹo lấy ID Bot: ID của bot chính là dãy số nằm ở phần đầu Token của bot đó (trước dấu <code>:</code>). VD Token là <code>123456789:ABC...</code> thì ID là <code>123456789</code>. Bạn cũng có thể dùng @userinfobot để xem.</i>\n\n<b>Tham số:</b> list | add &lt;id&gt; | remove &lt;id&gt;\n<b>Ví dụ:</b>\n<code>/whitelistbot list</code> - Xem danh sách bot\n<code>/whitelistbot add 123456789</code> - Thêm bot ID 123456789\n<code>/whitelistbot remove 123456789</code> - Xóa bot',
};

let agentToUse: https.Agent | http.Agent = agent;
if (config.telegram.proxy) {
  const proxyAgent = createProxyAgent(config.telegram.proxy);
  if (proxyAgent) agentToUse = proxyAgent as https.Agent;
}

/** Singleton Telegraf bot instance shared across the app. */
export const tgBot = new Telegraf(config.telegram.token, {
  telegram: config.telegram.localServer
    ? { apiRoot: config.telegram.localServer, agent: localAgent }
    : { agent: agentToUse },
});

// Keep polling alive when one update handler fails. Without an explicit catch,
// Telegraf can reject launch() and leave the process half-alive: Zalo→Telegram
// listeners still work while Telegram→Zalo silently stops consuming updates.
tgBot.catch((err, ctx) => {
  console.error(`[Telegram] Update ${ctx.update.update_id} failed:`, err);
});

export async function syncTelegramCommands(): Promise<void> {
  await tgBot.telegram.setMyCommands(BOT_COMMANDS);
}
