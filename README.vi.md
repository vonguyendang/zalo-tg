# zalo-tg

*English version: [README.md](README.md)*

---

Cầu nối tin nhắn hai chiều giữa **Zalo** và **Telegram**, triển khai bằng TypeScript trên Node.js. Mỗi cuộc trò chuyện Zalo (nhắn riêng hoặc nhóm) được ánh xạ tới một Forum Topic riêng biệt trong supergroup Telegram, cung cấp đồng bộ tin nhắn đầy đủ trên cả hai nền tảng.

---

## Mục lục

- [Kiến trúc](#kiến-trúc)
- [Tính năng](#tính-năng)
- [Yêu cầu](#yêu-cầu)
- [Cài đặt](#cài-đặt)
- [Quick Start — macOS](#quick-start--macos)
- [Cấu hình](#cấu-hình)
- [Chạy ứng dụng](#chạy-ứng-dụng)
- [Xác thực](#xác-thực)
- [Chuyển tệp lớn](#chuyển-tệp-lớn--20-mb)
- [Lệnh Bot](#lệnh-bot)
- [Cấu trúc dự án](#cấu-trúc-dự-án)
- [File dữ liệu](#file-dữ-liệu)
- [Bảo mật](#bảo-mật)

---

## Kiến trúc

Bridge hoạt động như một tiến trình Node.js chạy liên tục, đồng thời duy trì:

1. **Telegram bot** (qua [Telegraf](https://github.com/telegraf/telegraf)) kết nối Bot API bằng long polling.
2. **Zalo client** (qua [zca-js](https://github.com/VolunteerSVD/zca-js)) kết nối WebSocket API nội bộ của Zalo.

Hai phía giao tiếp qua một tập hợp các store trong bộ nhớ và trên đĩa, lưu ánh xạ hai chiều giữa Telegram message ID và Zalo message ID. Điều này cho phép các tính năng như reply chain, thu hồi tin nhắn và đồng bộ reaction.

```
 Zalo WebSocket API
        |
   zalo/client.ts         (xác thực, quản lý phiên Web API)
        |
   zalo/loginApp.ts       (đăng nhập PC App QR — phiên zaloapp.com)
   zalo/appApi.ts         (gọi PC App API trực tiếp — rate-limit riêng biệt)
        |
   zalo/handler.ts        (decode sự kiện Zalo → Telegram)
        |
   store.ts               (msgStore, sentMsgStore, pollStore,
        |                  mediaGroupStore, zaloAlbumStore,
        |                  userCache, aliasCache, friendsCache, topicStore)
        |
   telegram/handler.ts    (decode cập nhật Telegram → Zalo)
        |
   Telegram Bot API (long polling)
```

**Topic mapping** (`data/topics.json`) được lưu xuống đĩa. Tất cả ánh xạ message ID được giữ trong bộ nhớ với cơ chế eviction kiểu LRU và sẽ mất khi restart tiến trình (graceful degradation: reply chain tới tin nhắn cũ đơn giản là bỏ qua `reply_parameters`).

---

## Tính năng

### Loại tin nhắn — Zalo sang Telegram

| Loại Zalo (`msgType`) | Đầu ra Telegram |
|---|---|
| `webchat` (văn bản thuần) | `sendMessage` HTML; mention được bọc trong `<b>` |
| `chat.photo` | `sendPhoto` (đơn) hoặc `sendMediaGroup` (album, buffer 600ms) |
| `chat.video.msg` | `sendVideo` |
| `chat.gif` | `sendAnimation` |
| `share.file` | `sendDocument` với tên file gốc |
| `chat.voice` | `sendVoice` |
| `chat.sticker` | `sendSticker` (WebP); fallback `sendPhoto` nếu quá lớn |
| `chat.doodle` | `sendPhoto` |
| `chat.recommended` (link) | `sendMessage` kèm link preview |
| `chat.location.new` | `sendLocation` (bản đồ native) |
| `chat.webcontent` — thẻ ngân hàng | `sendPhoto` với ảnh VietQR + thông tin tài khoản |
| `chat.webcontent` — generic | `sendMessage` với icon và nhãn |
| Danh thiếp (contactUid) | `sendPhoto` với QR + tên/ID, hoặc `sendMessage` nếu không có QR |
| `group.poll` — tạo | `sendPoll` + score message có nút khoá |
| `group.poll` — cập nhật vote | Chỉnh sửa score message với số phiếu và biểu đồ thanh |

### Loại tin nhắn — Telegram sang Zalo

| Nội dung Telegram | Lệnh Zalo API |
|---|---|
| Văn bản | `sendMessage` |
| Ảnh đơn | `sendMessage` với attachment |
| Album ảnh (media group) | `sendMessage` với nhiều attachment (buffer 500ms) |
| Video đơn | `sendMessage` với attachment |
| Album video (media group) | `sendMessage` với nhiều attachment (buffer 500ms) |
| Animation / GIF | `sendMessage` với attachment |
| Document | `sendMessage` với attachment |
| Voice note (OGG Opus) | Convert sang M4A qua ffmpeg → `uploadAttachment` → `sendVoice` |
| Sticker tĩnh (WebP) | `sendMessage` với attachment |
| Sticker động / video | Tải thumbnail JPEG → `sendMessage` với attachment |
| Vị trí | `sendLink` với Google Maps URL; fallback `sendMessage` |
| Danh thiếp | `sendMessage` với tên và số điện thoại |
| Poll | `createPoll` trên Zalo + poll clone non-anonymous trên Telegram |

### Đồng bộ tương tác

**Reply chain** — Khi Telegram message có `reply_to_message`, bridge resolve target thành Zalo `quote` object và truyền vào `sendMessage`. Reply vào tin nhắn gốc từ Telegram sang Zalo được resolve qua reverse index trong `sentMsgStore`.

**Reactions** — Cập nhật `message_reaction` của Telegram được ánh xạ qua bảng emoji tĩnh và forward qua `addReaction`. React Zalo được forward dưới dạng reply ngắn trên Telegram.

**Thu hồi tin nhắn** — Sự kiện `undo` của Zalo kích hoạt `deleteMessage` trên Telegram. Lệnh `/recall` kích hoạt `api.undo` cho tin nhắn do bot gửi.

**Mention** — Span `@mention` Zalo được bọc trong `<b>` trên Telegram. Entity `@username` và pattern `@Tên` văn bản thuần trên Telegram được resolve thành Zalo UID qua `userCache`. **Biệt danh (alias)** — tên liên lạc đặt trong sổ địa chỉ Zalo — cũng được chấp nhận làm mục tiêu mention: `@BietDanh` sẽ resolve đúng UID dù tên hiển thị khác. Caption ảnh/video cũng được xử lý mention.

### Đồng bộ Poll

- Tạo poll Zalo → Poll native Telegram + score message có nút khoá inline.
- Tạo poll Telegram → `createPoll` Zalo + poll clone non-anonymous (cần thiết cho `poll_answer`) + score message.
- Sự kiện `poll_answer` (Telegram) → `votePoll` Zalo + refresh score ngay qua `getPollDetail`.
- Vote Zalo kích hoạt `group_event` với `boardType=3` → `getPollDetail` → chỉnh sửa score message.
- Nút khoá / `stopPoll` → `lockPoll` Zalo, `stopPoll` cả 2 poll TG, score message hiển thị trạng thái đã đóng.

### Quản lý nhóm

- Nhóm Zalo mới → Forum Topic được tạo tự động khi nhận tin đầu tiên, avatar nhóm được fetch và pin làm tin nhắn đầu tiên.
- Sự kiện nhóm (vào, rời, xoá, chặn) được forward dưới dạng tin hệ thống in nghiêng trong topic.

---

## Yêu cầu

| Phụ thuộc | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | >= 18 | Cần hỗ trợ ESM |
| npm | >= 9 | |
| ffmpeg | bất kỳ | Phải có trong `PATH`; dùng convert OGG→M4A |
| Telegram Bot | — | Tạo qua [@BotFather](https://t.me/BotFather) |
| Telegram Supergroup | — | Bật chế độ Topics; bot phải là admin |
| Tài khoản Zalo | — | Đang hoạt động; session lưu trong `credentials.json` |

<!-- Upstream Additions below -->

- Node.js `>=20.11`
- npm
- Git (cần cho installer qua curl và luồng update)
- Tuỳ chọn: Go `>=1.24` để build Charmbracelet TUI sidecar
- Telegram bot token
- Telegram supergroup đã bật forum topics
- Bot phải là admin trong group Telegram đó
- Một account Zalo có thể quét QR
- Tuỳ chọn: Docker / Docker Compose nếu muốn chạy Telegram Local Bot API

**Quyền admin bot cần có trong supergroup Telegram:**
- Quản lý topic (tạo, sửa)
- Xoá tin nhắn
- Pin tin nhắn
- Quản lý nhóm (để nhận cập nhật `message_reaction`)

---

## Cài đặt

Installer một dòng khuyến nghị:

macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh | sh
```

Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh | sh
```

Windows, chạy bằng PowerShell kèm Git Bash/WSL `sh`:

```powershell
curl.exe -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh -o install.sh
sh install.sh
```

Installer qua curl mặc định clone hoặc update project vào `~/zalo-tg`, sau đó check Node/npm/Go, cài npm dependencies, build Charmbracelet TUI sidecar nếu có Go, tạo `.env` từ `.env.example` chỉ khi chưa có `.env`, và không đè config hiện tại.

Muốn chọn thư mục cài khác:

```bash
ZALO_TG_INSTALL_DIR=/opt/zalo-tg curl -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh | sh
```

Nếu đã clone repo sẵn:

```bash
sh install.sh
```

Nếu muốn chạy không hỏi:

```bash
curl -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh | sh -s -- --yes
```

Cài thủ công:

```bash
git clone https://github.com/williamcachamwri/zalo-tg
cd zalo-tg
npm install
cp .env.example .env
```

---

## Quick Start — macOS

Thư mục [`quick-start-script/`](quick-start-script/) cung cấp hai script sẵn dùng để khởi chạy bridge trên macOS mà không cần mở Terminal.

### Cách A — Double-click file `.command`

Cách đơn giản nhất. Double-click `zalo-bot-onefile.command` để hiện menu điều khiển với 5 lựa chọn: **Bật bot**, **Tắt bot**, **Xem trạng thái**, **Mở log**, **Hướng dẫn**.

```bash
# Sao chép vào Applications và cấp quyền thực thi
cp quick-start-script/zalo-bot-onefile.command /Applications/
chmod +x /Applications/zalo-bot-onefile.command
```

Lần đầu mở: chuột phải → **Open** để bỏ qua cảnh báo Gatekeeper. Những lần sau double-click bình thường.

Xem hướng dẫn chi tiết tại [`HDSD file command.md`](quick-start-script/HDSD%20file%20command.md).

### Cách B — App Automator

Biến `zalo-bot-control.sh` thành file `.app` trong `/Applications`, có thể mở từ Spotlight hoặc Dock.

1. Mở **Automator** → New Document → **Application**.
2. Thêm action **Run Shell Script** (shell: `/bin/bash`).
3. Dán toàn bộ nội dung file [`zalo-bot-control.sh`](quick-start-script/zalo-bot-control.sh).
4. Lưu với tên `Zalo Bot Control` vào `/Applications`.

Xem hướng dẫn từng bước tại [`HDSD file automation.md`](quick-start-script/HDSD%20file%20automation.md).

### Luồng chạy khi chọn "Bật bot"

Cả hai cách đều thực hiện cùng một trình tự:

| Bước | Thao tác |
|---|---|
| 1 | `git checkout dev` |
| 2 | `npm run build` |
| 3 | Khởi chạy `run-bot-api.sh` nền |
| 4 | Chờ tối đa 30 giây cho cổng `127.0.0.1:8081` mở |
| 5 | `exec node dist/index.js` |

Một **macOS LaunchAgent** (`com.edwardfranklin.zalo-bot`) được đăng ký để bot tự khởi động lại sau mỗi lần đăng nhập máy.

Log được ghi vào `~/Library/Logs/zalo-bot-control/`.

> [!IMPORTANT]
> Nếu bridge đang kết nối tới Telegram Bot API tại `http://localhost:8081`, hãy đổi trong `.env` thành `TG_LOCAL_SERVER=http://127.0.0.1:8081` để tránh lỗi `ECONNREFUSED` do lệch IPv4/IPv6.

---

## Cấu hình

Chỉnh sửa `.env`:

```env
# Token Telegram Bot từ @BotFather
TG_TOKEN=123456789:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ID supergroup Telegram (số nguyên âm, ví dụ: -1001234567890)
TG_GROUP_ID=-1001234567890

# Thư mục lưu dữ liệu (topics.json, credentials.json)
# Mặc định ./data nếu bỏ trống
DATA_DIR=./data

# Bỏ qua forward tin nhắn từ các nhóm Zalo đã tắt thông báo
# Mặc định false; đặt true/1/yes/on để bật
ZALO_SKIP_MUTED_GROUPS=false
```

---

## Chạy ứng dụng

<!-- Upstream Additions below -->

## Scripts

| Script | Công dụng |
| --- | --- |
| `sh install.sh` | Installer shell interactive có terminal UI đẹp; chuẩn bị dependencies, `.env`, TypeScript build và Go TUI sidecar tuỳ chọn. |
| `npm run dev` | Chạy app TypeScript bằng `tsx`. |
| `npm run dev:watch` | Chạy với Node watch mode. |
| `npm run build` | Compile TypeScript vào `dist/`. |
| `npm run tui:build` | Build TUI sidecar vào `bin/zalo-tg-tui` và Glow renderer kèm theo vào `bin/glow`. |
| `npm start` | Chạy app đã compile. |
| `npm test` | Chạy toàn bộ test TypeScript. |
| `npm run check` | Build và chạy full test suite. |
| `npm run test:coverage` | Chạy test kèm Node coverage. |
| `npm run security:audit` | Chạy `npm audit --omit=dev`. |

## Lệnh Telegram chính

| Lệnh | Công dụng |
| --- | --- |
| `/login` | Đăng nhập Zalo bằng QR. |
| `/loginweb` | Alias của luồng đăng nhập Web QR. |
| `/loginapp` | Đăng nhập qua PC App API QR. |
| `/search` | Tìm bạn bè/nhóm Zalo và tạo/mở topic. |
| `/addgroup` | Tạo topic cho các nhóm Zalo chưa có topic. |
| `/group_info` | Xem thông tin nhóm Zalo đang map với topic hiện tại. |
| `/group_infoall` | Xem danh sách thành viên đầy đủ khi API hỗ trợ. |
| `/history` | Nạp lịch sử nhóm Zalo gần đây vào topic hiện tại. |
| `/addfriend` | Tìm và gửi lời mời kết bạn bằng số điện thoại. |
| `/friendrequests` | Duyệt lời mời kết bạn và lời mời nhóm. |
| `/joingroup` | Vào nhóm Zalo bằng link hoặc invitation box. |
| `/leavegroup` | Rời nhóm Zalo đang map và đóng topic. |
| `/topic` | Liệt kê, xem, xoá hoặc quản lý mapping topic. |
| `/autoreply` | Cấu hình tự trả lời DM. |
| `/recall` | Thu hồi tin Zalo bằng cách reply tin đã bridge trên Telegram. |
| `/admin` | Công cụ diagnostic/cache/admin. |
| `/status` | Xem tình trạng bridge và số lượng mapping. |
| `/restart` | Yêu cầu restart nếu đang chạy dưới supervisor. |
| `/update` | Kiểm tra bản cập nhật. |

## Bản đồ codebase

| Đường dẫn | Vai trò |
| --- | --- |
| `cmd/zalo-tg-tui/` | Go TUI sidecar tuỳ chọn, dùng Bubble Tea, Lip Gloss và Glow/Glamour để render Markdown. |
| `src/index.ts` | Boot process, start Telegram polling, đăng nhập Zalo, nối reconnect và shutdown. |
| `src/config.ts` | Đọc biến môi trường và resolve path. |
| `src/telegram/bot.ts` | Tạo Telegraf bot và đồng bộ lệnh Telegram. |
| `src/telegram/handler.ts` | Xử lý command, callback, Telegram → Zalo, reaction và poll answer. |
| `src/zalo/client.ts` | Quản lý singleton login/session zca-js và Web QR login. |
| `src/zalo/loginApp.ts` | Luồng PC App API QR login và lưu app-session. |
| `src/zalo/handler.ts` | Xử lý event từ Zalo listener và forward sang Telegram. |
| `src/zalo/appApi.ts` | Gọi endpoint PC App API để bổ sung thông tin nhóm/thành viên. |
| `src/zalo/autoReply.ts` | Tự trả lời DM Zalo đủ điều kiện. |
| `src/zalo/reaction.ts` | Map reaction Telegram và icon reaction Zalo. |
| `src/store.ts` | Chứa topic mapping, message mapping, cache, media buffer, reaction và poll store. |
| `src/utils/media.ts` | Download, convert, detect và dọn media files. |
| `src/utils/format.ts` | Escape, truncate và render text/mention/markup. |
| `src/utils/privateFile.ts` | Ghi file nhạy cảm với quyền hạn chế. |
| `src/utils/terminal.ts` | Hiển thị live terminal/TUI status. |
| `src/utils/tgQueue.ts` | Queue giới hạn tốc độ gọi Telegram. |
| `src/lifecycle.ts` | Điều phối shutdown/restart tập trung. |
| `src/updater.ts` | Logic kiểm tra update và thông báo update. |
| `tests/*.test.ts` | Unit/regression test cho store, media, format, config và edge case bridge. |

## Flow toàn codebase

Diagram dưới đây thay thế các Mermaid cũ và gom toàn bộ logic runtime vào một nơi.

```mermaid
flowchart TD
  Start(["Process starts"]) --> Config["config.ts<br/>Load env, resolve DATA_DIR, Telegram, Zalo and Local Bot API settings"]
  Config --> Terminal["terminal.ts<br/>Install live console theme and startup status"]
  Terminal --> Stores["store.ts<br/>Load topics, msg-map, user cache, polls and in-memory buffers"]
  Stores --> TelegramSetup["telegram/bot.ts + telegram/handler.ts<br/>Create Telegraf bot, register commands, callbacks, message, reactions and polls"]
  TelegramSetup --> Updater["updater.ts<br/>Register update checker before callback catch-all"]
  Updater --> LaunchTG["tgBot.launch<br/>Allowed updates: message, callback_query, message_reaction, poll_answer, poll"]
  LaunchTG --> AutoLogin["zalo/client.ts:getZaloApi<br/>Read saved credentials and login with zca-js"]
  AutoLogin -->|credentials valid| StartZalo["index.ts:startZalo<br/>Attach Zalo listener, prune stale group topics, request catch-up on reconnect"]
  AutoLogin -->|missing or invalid| WaitLogin["Notify Telegram<br/>Ask operator to run /login, /loginweb or /loginapp"]
  WaitLogin --> LoginChoice{"Login command"}
  LoginChoice -->|/login or /loginweb| WebQR["zalo/client.ts:triggerQRLogin<br/>Generate QR, save image, send/print QR, save credentials"]
  LoginChoice -->|/loginapp| AppQR["zalo/loginApp.ts<br/>PC App QR, app-session.json, credentials.json, zpw_sek-capable session"]
  WebQR --> StartZalo
  AppQR --> StartZalo
  StartZalo --> Ready["Bridge ready<br/>Telegram polling + Zalo listener are both active"]

  Ready --> ZaloEvent{"Zalo listener event"}
  ZaloEvent -->|message| ZaloNormalize["zalo/handler.ts<br/>Normalize threadId, type, sender, quote, mute state and content"]
  ZaloNormalize --> AutoReplyCheck["zalo/autoReply.ts<br/>For eligible DMs, check auto-reply config and send guarded reply"]
  AutoReplyCheck --> SendZalo
  ZaloNormalize --> TopicLookup["store.getTopicByZalo<br/>Find or create Telegram forum topic for Zalo DM/group"]
  TopicLookup --> ZaloContent{"Zalo content type"}
  ZaloContent -->|text / link / card / location| ZaloText["format.ts<br/>Escape HTML, render mentions/markup, build Telegram text"]
  ZaloContent -->|photo album| ZaloAlbum["zaloAlbumStore<br/>Debounce by conversation + sender, dedupe URLs, keep fallback URLs"]
  ZaloContent -->|file / photo / video / gif| ZaloMedia["media.ts<br/>Download URL candidates, detect media type, prepare Telegram upload"]
  ZaloContent -->|sticker| ZaloSticker["Sticker handling<br/>Fetch detail, send static sticker/photo or convert sprite sheet to GIF"]
  ZaloContent -->|voice| ZaloVoice["Voice handling<br/>Download and send audio/voice-compatible payload"]
  ZaloContent -->|poll| ZaloPoll["pollStore<br/>Mirror Zalo poll to Telegram poll + score message"]
  ZaloContent -->|recall / undo| ZaloRecall["recentlyRecalledMsgIds + msgStore<br/>Suppress self recalls, notify Telegram for external recalls"]
  ZaloContent -->|reaction| ZaloReaction["reactionEventDedupeStore + reactionEchoStore + reactionSummaryStore<br/>Map target msg IDs, suppress echoes, aggregate Telegram summary"]
  ZaloContent -->|group/member event| ZaloGroupEvent["Group/member event handling<br/>Join requests, member updates, topic notices and group metadata refresh"]
  ZaloText --> SendTG["tgQueue / Telegram API<br/>Send message into mapped topic"]
  ZaloAlbum --> SendTG
  ZaloMedia --> SendTG
  ZaloSticker --> SendTG
  ZaloVoice --> SendTG
  ZaloPoll --> SendTG
  ZaloRecall --> SendTG
  ZaloReaction --> SendTG
  ZaloGroupEvent --> SendTG
  SendTG --> SaveInboundMap["msgStore.save / sentMsgStore reverse lookup<br/>Save Zalo msgId ↔ Telegram msgId and quote metadata"]
  SaveInboundMap --> Ready

  Ready --> TgUpdate{"Telegram update"}
  TgUpdate -->|command| CommandRouter["telegram/handler.ts command router<br/>Auth operator/admin, choose current topic, call Zalo API or stores"]
  CommandRouter --> CmdLogin["Login, search, topic, group info, history, friend requests, admin, status, update, restart"]
  CmdLogin --> CacheAndApi["friendsCache / groupsCache / aliasCache / userCache + zalo/appApi.ts<br/>Refresh search data, resolve mentions, enrich group info and fallback when PC App API is unavailable"]
  CacheAndApi --> Ready
  TgUpdate -->|callback_query| CallbackRouter["Callback router<br/>QR cancel, leave group confirm, friend request action, group request action, update action"]
  CallbackRouter --> Ready
  TgUpdate -->|message_reaction| TgReaction["TG reaction handler<br/>Dedupe update, map Telegram emoji to Zalo icon, lookup msgStore/sentMsgStore target"]
  TgReaction --> ZaloAddReaction["currentApi.addReaction / undo<br/>Mark reactionEchoStore before sending"]
  ZaloAddReaction --> Ready
  TgUpdate -->|poll_answer or poll| TgPollAnswer["Poll answer handler<br/>Find pollStore entry, lock/score mirrored poll when needed"]
  TgPollAnswer --> Ready
  TgUpdate -->|topic message| TopicMessage["TG→Zalo message handler<br/>Ignore bots/non-bridge chats, require message_thread_id"]
  TopicMessage --> TopicToZalo["store.getEntryByTopic<br/>Resolve Zalo conversation and thread type"]
  TopicToZalo --> TgContent{"Telegram content type"}
  TgContent -->|text / caption| TgText["Resolve reply quote, mentions, aliases and group scoped names<br/>sendMessage text"]
  TgContent -->|photo album| TgAlbum["mediaGroupStore<br/>Debounce Telegram media group, send Zalo image layout when possible"]
  TgContent -->|document / photo / animation / video| TgFile["downloadToTemp<br/>Use Local Bot API file path or HTTP download, upload/send attachment"]
  TgContent -->|voice / audio| TgVoice["convertToM4a + uploadAttachment + sendVoice/sendMessage fallback"]
  TgContent -->|sticker static| TgStaticSticker["convertStickerToPng<br/>Render Telegram WebP sticker to transparent PNG and send as image"]
  TgContent -->|sticker animated TGS| TgTgsSticker["convertTgsToGif<br/>Render Lottie frames to GIF and send as image/GIF"]
  TgContent -->|sticker video WebM| TgWebmSticker["convertWebmToGif<br/>Convert WebM sticker to GIF and send as image/GIF"]
  TgContent -->|location / contact| TgSimplePayload["Format as text and send to Zalo"]
  TgContent -->|Telegram poll| TgPollCreate["Create Zalo poll where supported, mirror Telegram poll state into pollStore"]
  TgText --> SendZalo["currentApi.sendMessage / sendVoice / uploadAttachment / addReaction"]
  TgAlbum --> SendZalo
  TgFile --> SendZalo
  TgVoice --> SendZalo
  TgStaticSticker --> SendZalo
  TgTgsSticker --> SendZalo
  TgWebmSticker --> SendZalo
  TgSimplePayload --> SendZalo
  TgPollCreate --> SendZalo
  SendZalo --> EchoGuard["sentMsgStore.markSending/unmarkSending<br/>Suppress self echo race from Zalo listener"]
  EchoGuard --> SaveOutboundMap["sentMsgStore.save + msgStore.save/updateQuoteFromEcho<br/>Keep future replies, recalls and reactions mapped"]
  SaveOutboundMap --> Ready

  Ready --> Reconnect{"Zalo disconnected"}
  Reconnect -->|manual| ManualStop["Do not reconnect"]
  Reconnect -->|duplicate or kicked| LoginRequired["Notify Telegram that login is required"]
  Reconnect -->|recoverable| ReconnectTimer["Wait 5 seconds, reset API, login from saved credentials, restart listener"]
  ReconnectTimer --> StartZalo

  Ready --> Shutdown{"Shutdown or restart requested"}
  Shutdown --> StopListeners["lifecycle.ts<br/>Stop Zalo listener and Telegram bot"]
  StopListeners --> FlushStores["Wait for debounced store persistence<br/>msg-map, user-cache, polls"]
  FlushStores --> Exit(["Process exits with requested code"])
```

## Dữ liệu và persistence

| Dữ liệu | Vị trí mặc định | Công dụng |
| --- | --- | --- |
| Zalo credentials | `credentials.json` | Cookie đăng nhập zca-js, IMEI và user agent. |
| PC App session | cạnh credentials, tên `app-session.json` | Session dùng bởi helper PC App API. |
| Topic mappings | `data/topics.json` | Mapping Telegram topic ↔ hội thoại Zalo. |
| Message mappings | `data/msg-map.json` hoặc gzip payload | Zalo message ID ↔ Telegram message ID và metadata quote. |
| User cache | `data/user-cache.json.gz` | Lookup UID/tên/alias/tên thành viên theo nhóm. |
| Poll cache | `data/polls.json.gz` | Mapping poll giữa Zalo và Telegram. |
| Media tạm | thư mục temp của OS | File đã download/convert trước khi upload. |
| Ảnh QR | `/tmp/zalo-tg/zalo-qr.png` khi bật Local Bot API, nếu không dùng temp OS | Ảnh QR gửi lên Telegram và in ra terminal. |

Credentials và session là dữ liệu nhạy cảm. Không commit các file này.

## Xử lý media

Pipeline media được viết phòng thủ vì Zalo và Telegram expose file theo hai kiểu rất khác nhau:

- Path từ Telegram Local Bot API được copy vào temp file thuộc bridge.
- Download media HTTP có retry và fallback qua nhiều URL candidate.
- Album ảnh Zalo được debounce, dedupe và gửi sang Telegram dưới dạng media group khi có thể.
- Album ảnh Telegram được debounce và gửi sang Zalo bằng layout ảnh native khi có thể.
- Sticker Telegram tĩnh được render thành PNG trong suốt để gửi sang Zalo.
- Sticker Telegram TGS được render từng frame thành GIF.
- Sticker Telegram WebM được convert thành GIF.
- Sticker động Zalo dạng sprite sheet được convert thành GIF.
- Voice/audio được convert sang format upload được khi cần.
- File tạm được dọn sau mỗi lần upload.

## Terminal UI

Dashboard live hiện hỗ trợ Charmbracelet:

- nếu có `bin/zalo-tg-tui` và stdout là terminal interactive, Node bridge tự start sidecar Go;
- sidecar dùng Bubble Tea cho event loop, keymap và mouse; Bubbles cho viewport, help, spinner và scroll progress; Lip Gloss làm layout/style; Charmbracelet `x/ansi` để copy clipboard qua OSC52; và Glow bundled để render Markdown help, fallback sang Glamour;
- nếu thiếu binary, terminal không interactive, hoặc set `ZALO_TG_TUI=0`, bridge fallback về dashboard/log ANSI cũ;
- set `ZALO_TG_TUI_ENGINE=ansi` để ép dùng dashboard TypeScript cũ dù binary Go tồn tại;
- mặc định mouse mode hỗ trợ cả wheel scroll lẫn app-level row selection/copy trong activity pane theo kiểu OpenCode;
- set `ZALO_TG_TUI_MOUSE=0` để giữ native mouse selection/scrolling của terminal, giống cách OpenCode có `mouse: false`. Keyboard scroll trong TUI vẫn hoạt động;
- set `ZALO_TG_TUI_BIN=/absolute/path/to/zalo-tg-tui` nếu muốn dùng sidecar ở path riêng.

Build sidecar local:

```bash
npm run tui:build
```

Phím hữu ích:

| Phím | Hành động |
| --- | --- |
| `↑` / `↓` hoặc mouse wheel | Scroll pane đang focus. Mouse wheel cần mouse capture, mặc định đang bật. |
| `PgUp` / `PgDn` | Scroll theo trang. |
| `g` / `G` | Nhảy tới tin cũ nhất/live activity. |
| Kéo trong activity | Select các dòng activity đang thấy mà vẫn giữ wheel scroll; thả chuột sẽ auto-copy vào clipboard. |
| `y` / `Ctrl+Y` | Copy selection activity hiện tại bằng clipboard tool local nếu có, fallback OSC52 nếu terminal hỗ trợ. |
| `Esc` | Xoá selection activity hiện tại. |
| `s` | Fallback native-select khi mouse capture đang bật: freeze frame và dùng selection native của terminal. Nhấn `s` lần nữa để quay lại live. |
| `?` hoặc `h` | Bật/tắt help pane render bằng Glow. |
| `Tab` | Chuyển focus giữa activity và help pane. |
| `F1` | Mở/thu gọn keymap ở footer. |
| `Ctrl+C` | Copy activity selection; nếu không có selection thì dừng bridge. |

Docker image sẽ tự build và đóng gói cả sidecar lẫn Glow renderer.

## Reaction, reply và thu hồi

Bridge lưu đủ metadata để hai bên hoạt động gần giống native:

- `msgStore` map Zalo message ID sang Telegram message ID và lưu Zalo quote payload.
- `sentMsgStore` theo dõi tin nhắn xuất phát từ Telegram đã gửi sang Zalo.
- `reactionEchoStore` chặn reaction echo do chính bridge tạo ra.
- `reactionEventDedupeStore` tránh duplicate reaction sau reconnect.
- `reactionSummaryStore` gom reaction Zalo thành summary dễ đọc trên Telegram.
- `recentlyRecalledMsgIds` chặn thông báo thu hồi trùng khi lệnh thu hồi xuất phát từ Telegram.

## Ghi chú vận hành

- Bot Telegram phải là admin trong bridge group.
- Telegram group phải bật forum topics.
- Chạy `npm run check` trước khi push.
- Nếu upload media lỗi khi bật Local Bot API, hãy đảm bảo Bot API server và bridge nhìn thấy cùng absolute temp path.
- Nếu Zalo báo duplicate/kicked session, đóng Zalo Web/PC session khác rồi đăng nhập lại.
- Nếu API thành viên nhóm lỗi `zpw_sek`, bridge fallback sang Web API khi có thể, nhưng nhóm ẩn thành viên vẫn có giới hạn.

## Checklist phát triển

```bash
# Development — hot reload qua tsx watch
npm run dev

# Production
npm run build
npm start
```

---

## Xác thực

Bridge hỗ trợ hai phương thức đăng nhập Zalo độc lập. Cả hai đều có thể dùng bất cứ lúc nào qua lệnh bot tương ứng.

### `/loginweb` — Web API (mặc định)

Dùng phiên Web API chuẩn của zca-js. Đây là luồng tương tự lệnh `/login` gốc.

1. Gửi `/loginweb` trong bất kỳ topic nào của group đã bridge.
2. Bot reply ảnh QR Zalo.
3. Quét bằng app Zalo tại **Cài đặt → Đăng nhập bằng QR**.
4. Phiên được lưu vào `data/credentials.json`.

**Rate limit:** Web API có giới hạn request theo endpoint (HTTP 221). Khi khởi động với nhiều nhóm, lỗi này được giảm thiểu bởi PC App API fallback mô tả bên dưới.

### `/loginapp` — PC App API

Dùng phiên Zalo PC App (`wpa.zaloapp.com` / cookie domain `zaloapp.com`). Phiên này được lưu riêng biệt và dùng cho các thao tác tra cứu thành viên nhóm với **bucket rate-limit riêng** so với Web API.

1. Gửi `/loginapp` trong bất kỳ topic nào của group đã bridge.
2. Bot reply ảnh QR (giao diện giống nhau).
3. Quét bằng app Zalo — Zalo xử lý như đăng nhập từ PC App.
4. Phiên được lưu vào `data/app-session.json` (chứa `zpw_enk`, `imei`, và cookie `zaloapp.com`).

**Tại sao nên dùng `/loginapp`:**
- `populateGroupMemberCache` lúc khởi động gọi `group-wpa.zaloapp.com` (domain PC App) thay vì Web API, tránh lỗi rate-limit (code 221) xảy ra khi nhiều nhóm được xử lý đồng thời.
- Tra cứu tên thành viên (`profile-wpa.zaloapp.com/api/social/group/members`) cũng dùng phiên này.
- Nếu không có `app-session.json`, bridge sẽ fallback về Web API một cách tự nhiên.

### Nạp cache thành viên nhóm (3 tầng)

Khi một nhóm được thấy lần đầu, `populateGroupMemberCache` resolve tên hiển thị theo thứ tự ưu tiên:

| Tầng | Nguồn | Gọi API thêm? |
|---|---|---|
| 1 | `currentMems` nhúng trong response `getGroupInfo` | Không |
| 2 | `profile-wpa.zaloapp.com/api/social/group/members` (PC App) | Có — bucket riêng |
| 3 | `getUserInfo` Web API | Có — bị rate-limit |

Tầng 2 và 3 chỉ được gọi cho các UID không có trong tầng 1 (thường không cần cho nhóm dưới ~200 thành viên).

---

## Chuyển tệp lớn (> 20 MB)

Mặc định, Telegram Bot API chính thức giới hạn tệp tải xuống ở **20 MB**. Để chuyển các tệp lớn hơn (lên đến **2 GB**), bạn có thể tùy chọn chạy một **máy chủ Telegram Bot API cục bộ** trên máy.

### Bắt đầu nhanh

1. **Xây dựng hoặc tải xuống máy chủ** (xem [Hướng dẫn thiết lập Local Bot API](LOCAL_BOT_API_SETUP.vi.md))
2. **Đăng xuất một lần** khỏi API chính thức:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/logOut"
   ```
3. **Khởi động máy chủ cục bộ**:
   ```bash
   telegram-bot-api \
     --api-id=<YOUR_API_ID> \
     --api-hash=<YOUR_API_HASH> \
     --local \
     --dir=~/zalo-tg-bot-api/data \
     --http-port=8081
   ```
4. **Cập nhật `.env`**:
   ```env
   # Bật/tắt local server (1 = dùng local server, 0 = dùng official API)
   LOCAL_BOT_API=1

   # URL của local server
   TG_LOCAL_SERVER=http://localhost:8081

   # Thông tin xác thực Telegram App (lấy tại https://my.telegram.org/apps)
   TG_API_ID=your_api_id
   TG_API_HASH=your_api_hash
   ```
5. **Khởi động lại bridge**:
   ```bash
   npm run build
   npm start
   ```

### Biến `LOCAL_BOT_API` — Giải thích chi tiết

Đây là **công tắc chính** quyết định bridge dùng local server hay official Telegram API.

| Giá trị | Hành vi |
|---|---|
| `LOCAL_BOT_API=1` | Dùng local server tại `TG_LOCAL_SERVER`. Giới hạn file: **2 GB**. |
| `LOCAL_BOT_API=0` | Dùng official `api.telegram.org`. Giới hạn: download **50 MB** / upload **20 MB**. |

**Tại sao quan trọng:**

- Khi `LOCAL_BOT_API=1`, bot kết nối đến local server (mặc định `localhost:8081`). Server này xử lý toàn bộ traffic Telegram bao gồm upload/download file với giới hạn 2 GB.
- Khi `LOCAL_BOT_API=0` (hoặc không có biến này), bot dùng Telegram API chính thức. Biến `TG_LOCAL_SERVER` sẽ **bị bỏ qua** dù có set hay không.
- **Chuyển đổi giữa hai chế độ cần logout/login lại bot.** Nếu trước đó dùng local server và muốn chuyển về `LOCAL_BOT_API=0`, cần đăng xuất bot khỏi local server trước:
  ```bash
  # Trong khi local server còn chạy, logout về official API:
  curl "http://localhost:8081/bot<YOUR_BOT_TOKEN>/logOut"
  # Sau đó dừng local server và set LOCAL_BOT_API=0
  ```
- **Tương thích file_id:** `file_id` khác nhau giữa local server và official API. File gửi ở một chế độ không thể tải ở chế độ kia. Bridge tự xử lý điều này bằng cách fallback về official API để resolve các `file_id` cũ khi đang chạy ở local mode.
- **Deploy lên VPS:** Nếu VPS không cài local Bot API server, chỉ cần set `LOCAL_BOT_API=0`. Không cần thay đổi gì thêm — các biến `TG_LOCAL_SERVER`, `TG_API_ID`, `TG_API_HASH` sẽ bị bỏ qua.
- **Timeout upload** được tính động dựa trên kích thước file (tối thiểu 30s, tốc độ tối thiểu ~1 MB/s, tối đa 10 phút) để xử lý file lớn ổn định.

### Tính năng

✅ Tệp lên đến **2 GB** (so với giới hạn 20 MB của API chính thức)  
✅ Sao chép tệp trực tiếp từ máy chủ cục bộ (không overhead tải xuống)  
✅ Bật/tắt bằng `LOCAL_BOT_API=1/0` — không cần thay đổi code  
✅ Fallback tự động: file_id cũ từ official API vẫn được resolve bình thường  
✅ Tự động xóa file sau khi gửi thành công — không để lại file rác trên disk  

### Hướng dẫn thiết lập đầy đủ

Để cài đặt chi tiết trên **macOS, Linux, Windows**, xem [**Hướng dẫn thiết lập Local Bot API**](LOCAL_BOT_API_SETUP.vi.md):
- Yêu cầu tiên quyết và phụ thuộc
- Hướng dẫn xây dựng từ nguồn
- Thiết lập dịch vụ Systemd (Linux)
- Thiết lập Windows Task Scheduler
- Khắc phục sự cố và gỡ lỗi

---

## Lệnh Bot

| Lệnh | Mô tả |
|---|---|
| `/login` | Bắt đầu đăng nhập Zalo bằng QR (Web API — giống `/loginweb`) |
| `/loginweb` | Đăng nhập Zalo bằng QR qua Web API; phiên lưu vào `credentials.json` |
| `/loginapp` | Đăng nhập Zalo bằng QR qua PC App API; phiên lưu vào `app-session.json`. Bật chức năng tra cứu thành viên nhóm không bị rate-limit |
| `/search <truy vấn>` | Tìm kiếm danh sách bạn bè Zalo; chọn kết quả để tạo topic DM |
| `/recall` | Thu hồi tin nhắn đã gửi từ Telegram sang Zalo (reply vào tin cần thu hồi) |
| `/topic list` | Liệt kê tất cả ánh xạ topic–cuộc trò chuyện đang hoạt động |
| `/topic info` | Hiển thị thông tin cuộc trò chuyện Zalo của topic hiện tại |
| `/topic delete` | Xoá ánh xạ của topic hiện tại |

---

## Cấu trúc dự án

```
src/
├── index.ts                  Entry point. Khởi tạo Telegraf, Zalo client,
│                             gắn cả 2 handler, bắt đầu polling.
├── config.ts                 Đọc và kiểm tra biến môi trường.
├── store.ts                  Toàn bộ state trong bộ nhớ và trên đĩa:
│                               - topicStore      (lưu đĩa, topics.json)
│                               - msgStore        (Zalo msgId ↔ TG message_id)
│                               - sentMsgStore    (reverse index TG→Zalo msgId)
│                               - pollStore       (ánh xạ poll ↔ TG poll message)
│                               - mediaGroupStore (buffer media group TG)
│                               - zaloAlbumStore  (buffer album Zalo)
│                               - userCache       (uid ↔ displayName + group-scoped lookup)
│                               - aliasCache      (uid ↔ alias + tra cứu ngược alias→uid)
│                               - friendsCache    (danh sách bạn, TTL 5 phút)
├── telegram/
│   ├── bot.ts                Instance Telegraf; thiết lập allowedUpdates và bot commands.
│   └── handler.ts            Xử lý tất cả cập nhật Telegram và forward sang Zalo.
│                             Xử lý: text, media, voice, sticker, poll, location,
│                             contact, reaction, callback_query, poll_answer.
│                             Resolve mention: tên hiển thị → uid, rồi alias → uid.
├── zalo/
│   ├── client.ts             Khởi tạo Zalo API và QR login flow (Web API).
│   ├── loginApp.ts           Luồng QR login PC App (phiên zaloapp.com).
│   │                         Lưu data/app-session.json sau khi đăng nhập thành công.
│   ├── appApi.ts             Helper gọi PC App API (group-wpa.zaloapp.com,
│   │                         profile-wpa.zaloapp.com). Dùng cho tra cứu thành viên
│   │                         nhóm không bị rate-limit. Tự động nhận diện AES-128/192/256.
│   ├── types.ts              Interface TypeScript và hằng số ZALO_MSG_TYPES.
│   └── handler.ts            Xử lý tất cả sự kiện Zalo listener và forward sang TG.
│                             Xử lý: message (tất cả msgType), undo, reaction,
│                             group_event (join/leave/poll/update_board).
│                             populateGroupMemberCache: chiến lược tra cứu 3 tầng.
└── utils/
    ├── format.ts             Escape HTML, áp dụng mention, helper caption.
    └── media.ts              Download file tạm, dọn dẹp, convert OGG→M4A.
```

---

## File dữ liệu

### `data/credentials.json`

Phiên **Web API** của Zalo (được thiết lập bởi `/loginweb` hoặc `/login`). Chứa session token zca-js chuẩn — bảo vệ như thông tin đăng nhập tài khoản.

### `data/app-session.json`

Phiên **PC App** của Zalo (được thiết lập bởi `/loginapp`). Chứa:
- `zpw_enk` — khóa mã hóa AES của phiên (base64; 16 byte = AES-128 tự nhận diện)
- `imei` — định danh thiết bị
- `cookies` — mảng cookie thô của `zaloapp.com`

Phiên này được dùng riêng bởi `appApi.ts` cho các cuộc gọi đến `group-wpa.zaloapp.com` và `profile-wpa.zaloapp.com`. **Đã liệt kê trong `.gitignore`**; bảo vệ tương đương `credentials.json`.

### `data/topics.json`

Plain JSON. Ánh xạ mỗi ID cuộc trò chuyện Zalo (nhóm hoặc nhắn riêng) tới Telegram Forum Topic ID kèm metadata (tên hiển thị, loại). Được ghi mỗi khi tạo topic mới; đọc một lần lúc khởi động.

### `data/msg-map.json` (nén gzip)

Lưu trữ ánh xạ hai chiều giữa Zalo message ID và Telegram message ID để reply chain không bị mất khi restart. File được **nén gzip** (tự động nhận diện qua magic bytes `0x1F 0x8B` lúc đọc) và dùng **định dạng v2** gọn nhẹ để tối thiểu hoá I/O.

#### Định dạng v2 (áp dụng từ tháng 5/2026)

```jsonc
{
  "v": 2,
  // Bảng intern chuỗi — mỗi chuỗi lặp lại (zaloId, msgType, UID…) chỉ lưu
  // một lần ở đây và được tham chiếu bằng chỉ số trong các mảng dữ liệu bên dưới.
  "s": ["850431…", "webchat", "uid123", …],
  // Cặp ánh xạ: [zaloMsgId, tgMessageId]
  // zaloMsgId là chỉ số trong "s"; tgMessageId là số nguyên thông thường.
  "p": [[0, 123456], [1, 123457], …],
  // Dữ liệu quote theo TG message (dùng cho reply chain và auto-mention):
  // [tgId, msgIdIdx, cliMsgIdIdx, uidFromIdx, ts, msgTypeIdx, content, ttl, zaloIdIdx, threadType]
  "q": [[123456, 0, 1, 2, 1746000000, 5, "hello", 0, 0, 1], …]
}
```

#### Tại sao lọc bỏ các entry `"0"`

Zalo đặt `realMsgId = 0` cho những tin nhắn không có ID phụ. Vì `String(0) === "0"`, trước đây chúng được lưu thành cặp `["0", tgId]` — chiếm tới **45 % tổng số cặp**. Nay chúng bị loại bỏ cả khi ghi (`msgStore.save`) lẫn khi đọc (`_loadMsgMap`):

- Không có lookup nào có nghĩa khi query `"0"`: Zalo message ID thực là số timestamp 13 chữ số, không bao giờ là `0`.
- Giữ chúng gây **lỗi collision ẩn**: nhiều tin nhắn khác nhau đều có `realMsgId = 0` sẽ ghi đè lên cùng một key, khiến `getTgMsgId("0")` trả về TG ID của một tin nhắn tuỳ tiện — tạo ra reply target sai.

#### Lịch sử kích thước

| Định dạng | Kích thước |
|---|---|
| v1 plain JSON | ~80 KB |
| v2 intern + positional arrays | ~46 KB (−44 %) |
| v2 + gzip level 9 + lọc zero | ~13 KB (−85 %) |

`gunzipSync` trên 13 KB nhanh hơn đáng kể so với `JSON.parse` trên 80 KB; module `node:zlib` có sẵn được dùng — không cần thêm dependency.

---

## Bảo mật

- `.env`, `credentials.json` và `app-session.json` được liệt kê trong `.gitignore` và tuyệt đối không được commit lên version control.
- `credentials.json` chứa session token Zalo Web API tương đương với mật khẩu tài khoản. Cần bảo vệ với mức độ bảo mật tương đương.
- `app-session.json` chứa phiên PC App Zalo tương đương với mật khẩu tài khoản. Áp dụng mức bảo vệ tương đương.
- Bridge vận hành theo mô hình single-user: group Telegram phải là riêng tư và chỉ giới hạn cho thành viên tin cậy, vì bất kỳ thành viên nào cũng có thể gửi tin nhắn qua bridge.
- Tất cả request HTTP tới Telegram và Zalo đều dùng TLS. Không có credential nào được ghi vào log.
- Lệnh `/recall` không bị hạn chế trong group — bất kỳ thành viên nào cũng có thể thu hồi tin nhắn do bot gửi. Hãy hạn chế quyền admin bot hoặc tư cách thành viên group nếu đây là mối lo ngại.

---

## License

MIT
