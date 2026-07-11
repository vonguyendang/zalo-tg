import { Reactions, ThreadType, type AttachmentSource } from 'zca-js';
import type { Context } from 'telegraf';
import path from 'path';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import { execFile } from 'child_process';

const MAX_ZALO_TEXT_LENGTH = 2000;

function splitLongText(text: string): string[] {
  if (text.length <= MAX_ZALO_TEXT_LENGTH) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = start + MAX_ZALO_TEXT_LENGTH;
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }
    // Try to break at paragraph boundary
    const paraBreak = text.lastIndexOf('\n\n', end);
    if (paraBreak > start) { end = paraBreak; }
    else {
      const lineBreak = text.lastIndexOf('\n', end);
      if (lineBreak > start) { end = lineBreak; }
      else {
        const spaceBreak = text.lastIndexOf(' ', end);
        if (spaceBreak > start) { end = spaceBreak; }
      }
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
import { promisify } from 'util';
const execFileAsync = promisify(execFile);

import type { ZaloAPI } from '../zalo/types.js';
import { store, msgStore, userCache, friendsCache, groupsCache, sentMsgStore, pollStore, mediaGroupStore, reactionEchoStore, reactionSummaryStore, reactionEventDedupeStore, aliasCache, markRecalled, accountAliasStore, type ZaloQuoteData } from '../store.js';
import { tgBot, BOT_COMMANDS, COMMAND_DETAILS } from './bot.js';
import { config } from '../config.js';
import { downloadToTemp, cleanTemp, convertToM4a, extractVideoThumbnail, convertWebmToGif } from '../utils/media.js';
import { triggerQRLogin, getAllZaloApis, cancelActiveQRLogin } from '../zalo/client.js';
import { triggerAppLogin, cancelActiveAppLogin } from '../zalo/loginApp.js';
import { invalidateAppSession, appGetReceivedFriendRequests, appGetSentFriendRequests, appGetGroupInfo, appGetGroupMembersInfo, appGetFriendProfilesV2, appRequestVoiceCall, appRequestGroupVoiceCall } from '../zalo/appApi.js';
import { escapeHtml, topicName } from '../utils/format.js';

// Bridge start time (module load = process start)
const _bridgeStartTime = Date.now();

/** Lấy trạng thái chi tiết của local Bot API server */
async function getLocalApiStatus(serverUrl: string): Promise<string> {
  const lines: string[] = [];

  // 1. Ping HTTP
  let httpOk = false;
  let httpMs = -1;
  try {
    const t0 = Date.now();
    const res = await (await import('axios')).default.get(`${serverUrl}/`, {
      timeout: 4_000,
      validateStatus: () => true,
    });
    httpMs = Date.now() - t0;
    httpOk = res.status < 500;
  } catch { /* ECONNREFUSED or timeout */ }

  if (httpOk) {
    lines.push(`🟢 HTTP: <b>online</b> (${httpMs} ms)`);
  } else {
    lines.push(`🔴 HTTP: <b>offline / ECONNREFUSED</b>`);
  }

  // 2. Process info via pgrep
  try {
    const { stdout } = await execFileAsync('pgrep', ['-a', 'telegram-bot-api']);
    const pid = stdout.trim().split(/\s+/)[0];
    if (pid) {
      lines.push(`⚙️ PID: <code>${pid}</code>`);
      // Memory (macOS: ps -o rss=)
      try {
        const { stdout: mem } = await execFileAsync('ps', ['-p', pid, '-o', 'rss=']);
        const kb = parseInt(mem.trim(), 10);
        if (!isNaN(kb)) lines.push(`💾 RAM: <code>${(kb / 1024).toFixed(1)} MB</code>`);
      } catch { /* ignore */ }
    } else {
      lines.push(`⚙️ Process: <b>không tìm thấy</b>`);
    }
  } catch {
    lines.push(`⚙️ Process: <b>không tìm thấy</b>`);
  }

  // 3. Log file — tail 3 dòng cuối
  const logPath = path.join(
    process.env.DATA_DIR
      ? (path.isAbsolute(process.env.DATA_DIR) ? process.env.DATA_DIR : path.resolve(process.cwd(), process.env.DATA_DIR))
      : path.resolve(process.cwd(), 'data'),
    'bot-api', 'bot-api.log',
  );
  try {
    const logStat = await stat(logPath);
    const sizeMb = (logStat.size / 1024 / 1024).toFixed(2);
    // Đọc 4 KB cuối để lấy tail
    const buf = Buffer.alloc(Math.min(4096, logStat.size));
    const fh  = await import('fs/promises').then(m => m.open(logPath, 'r'));
    await fh.read(buf, 0, buf.length, Math.max(0, logStat.size - buf.length));
    await fh.close();
    const tail = buf.toString('utf8').trim().split('\n').slice(-3).join('\n');
    const lastLine = tail.split('\n').pop() ?? '';
    const hasError = /error|crash|fatal|signal 6|no space/i.test(lastLine);
    lines.push(`📄 Log: <code>${sizeMb} MB</code> — dòng cuối:`);
    lines.push(`<pre>${escapeHtml(lastLine.slice(0, 200))}</pre>`);
    if (hasError) lines.push(`⚠️ Phát hiện lỗi trong log!`);
  } catch {
    lines.push(`📄 Log: <i>không đọc được</i>`);
  }

  // 4. Disk space gốc
  try {
    const { stdout } = await execFileAsync('df', ['-h', '/']);
    const row = stdout.trim().split('\n')[1] ?? '';
    const cols = row.trim().split(/\s+/);
    // macOS df: Filesystem Size Used Avail Capacity ...
    if (cols.length >= 5) {
      lines.push(`💿 Disk /: ${cols[1]} total, ${cols[2]} used, ${cols[3]} avail (<b>${cols[4]}</b>)`);
    }
  } catch { /* ignore */ }

  return lines.join('\n');
}

/** 
 * Helper: Resolve the correct ZaloAPI instance for a given topic ID.
 * Falls back to the first available API if the topic is legacy (no accountId).
 */
export function resolveApiForTopic(topicId: number): ZaloAPI | undefined {
  const entry = store.getEntryByTopic(topicId);
  if (!entry) return undefined;
  
  const allApis = getAllZaloApis();
  let api = entry.accountId ? allApis.get(entry.accountId) : undefined;
  if (!api && allApis.size > 0) {
    api = Array.from(allApis.values())[0];
  }
  return api;
}


// ── Mention resolution helper ──────────────────────────────────────────────

type TgEntity = { type: string; offset: number; length: number; user?: { first_name: string; last_name?: string } };

/**
 * Resolve TG mention entities (or plain-text @Name patterns) in a string
 * to Zalo mention objects. Works for both msg.text+entities and
 * msg.caption+caption_entities.
 */
function resolveTgMentions(
  text: string,
  entities: ReadonlyArray<TgEntity> | undefined,
  forZaloGroup: boolean,
  zaloId?: string,
): Array<{ pos: number; uid: string; len: number }> {
  const result: Array<{ pos: number; uid: string; len: number }> = [];
  if (!forZaloGroup) return result;

  // 1. Named TG entities (@username or text_mention with user object)
  if (entities) {
    for (const e of entities) {
      if (e.type === 'mention') {
        const rawName = text.slice(e.offset + 1, e.offset + e.length); // strip leading @
        const uid = (zaloId
          ? userCache.resolveByNameInGroup(rawName, zaloId)
          : userCache.resolveByName(rawName))
          ?? aliasCache.resolveByAlias(rawName);
        if (uid) result.push({ pos: e.offset, uid, len: e.length });
      } else if (e.type === 'text_mention' && e.user) {
        const rawName = e.user.first_name + (e.user.last_name ? ` ${e.user.last_name}` : '');
        const uid = (zaloId
          ? userCache.resolveByNameInGroup(rawName, zaloId)
          : userCache.resolveByName(rawName))
          ?? aliasCache.resolveByAlias(rawName);
        if (uid) result.push({ pos: e.offset, uid, len: e.length });
      }
    }
  }

  // 2. Plain-text @Name patterns (only if no entity matched above)
  if (result.length === 0) {
    const atPattern = /@([\p{L}\p{N}_]+(?:\s[\p{L}\p{N}_]+){0,3})/gu;
    let m: RegExpExecArray | null;
    while ((m = atPattern.exec(text)) !== null) {
      const captured = m[1];
      if (/^(all|everyone|tất\s*cả)$/i.test(captured)) {
        result.push({ pos: m.index, uid: '-1', len: m[0].length });
        continue;
      }
      const words = captured.split(' ');
      for (let end = words.length; end >= 1; end--) {
        const candidate = words.slice(0, end).join(' ');
        const uid = (zaloId
          ? userCache.resolveByNameInGroup(candidate, zaloId)
          : userCache.resolveByName(candidate))
          ?? aliasCache.resolveByAlias(candidate);
        if (uid) {
          result.push({ pos: m.index, uid, len: ('@' + candidate).length });
          break;
        }
      }
    }
  }

  return result;
}

/**
 * When a TG user replies to a forwarded Zalo message from ANOTHER person,
 * prepend "@Name " to the message so the recipient on Zalo sees who is being
 * addressed. Returns null when:
 *  - not a group (mentions don't apply in DMs)
 *  - replying to our own sent message (TG→Zalo direction)
 *  - no quote data / display name found
 */
function buildReplyAutoMention(
  replyToMsgId: number | undefined,
  threadType: ThreadType,
): { prefix: string; mention: { pos: number; uid: string; len: number } } | null {
  if (replyToMsgId === undefined) return null;
  if (threadType !== ThreadType.Group) return null;
  // Skip if replying to a message WE sent (TG→Zalo direction)
  if (sentMsgStore.get(replyToMsgId) !== undefined) return null;
  const quote = msgStore.getQuote(replyToMsgId);
  if (!quote) return null;
  const name = userCache.getName(quote.uidFrom)?.trim();
  if (!name) return null;
  const mentionText = `@${name}`;
  return {
    prefix: `${mentionText} `,
    mention: { pos: 0, uid: quote.uidFrom, len: mentionText.length },
  };
}

function normalizePhoneSearchQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  if (!/^[+()\d.\s-]+$/.test(trimmed)) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length < 9 || digitsOnly.length > 15) return null;

  return digitsOnly;
}

function buildTopicUrl(topicId: number): string {
  const chatId = String(config.telegram.groupId);
  const internalChatId = chatId.startsWith('-100') ? chatId.slice(4) : chatId.replace(/^-/, '');
  return `https://t.me/c/${internalChatId}/${topicId}`;
}

/** Track in-progress QR login so we don't stack multiple flows. */
let qrLoginInProgress = false;
let appLoginInProgress = false;

/**
 * Start a Zalo QR login flow and forward the QR image + status messages
 * back to the Telegram chat/topic where /login was sent.
 */
async function handleLoginCommand(
  chatId: number,
  threadId: number | undefined,
  onNewApi: (api: ZaloAPI, accountId: string, accountName: string) => void,
): Promise<void> {
  if (qrLoginInProgress) {
    await tgBot.telegram.sendMessage(
      chatId,
      '⏳ Đang có phiên đăng nhập khác đang chạy. Vui lòng chờ...',
      threadId ? { message_thread_id: threadId } : {},
    );
    return;
  }

  qrLoginInProgress = true;
  const msgOpts = threadId ? { message_thread_id: threadId } : {};

  try {
    await tgBot.telegram.sendMessage(chatId, '🔄 Đang tạo mã QR Zalo...', msgOpts);

    const newApi = await triggerQRLogin({
      onQRReady: async (imagePath) => {
        await tgBot.telegram.sendPhoto(
          chatId,
          { source: createReadStream(imagePath) },
          {
            ...msgOpts,
            caption: '📱 Mở ứng dụng <b>Zalo</b> → Cài đặt → Quét mã QR để đăng nhập.',
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[{ text: '❌ Hủy đăng nhập', callback_data: `login_cancel:qr:active` }]]
            }
          },
        );
      },
      onExpired: async () => {
        await tgBot.telegram.sendMessage(chatId, '⏰ QR hết hạn, đang tạo mã mới...', msgOpts);
      },
      onScanned: async (displayName) => {
        await tgBot.telegram.sendMessage(
          chatId,
          `✅ Đã quét! Chờ xác nhận từ <b>${displayName}</b>...`,
          { ...msgOpts, parse_mode: 'HTML' },
        );
      },
      onDeclined: async () => {
        await tgBot.telegram.sendMessage(chatId, '❌ Đăng nhập bị từ chối trên điện thoại.', msgOpts);
      },
      onSuccess: async () => {
        await tgBot.telegram.sendMessage(
          chatId,
          '🎉 Đăng nhập Zalo thành công! Bridge đang hoạt động.',
          msgOpts,
        );
      },
    });

    let fetchedName = 'Zalo';
    try {
      const resp = await newApi.api.getUserInfo(newApi.uid).catch(() => undefined) as any;
      if (resp) {
        const uidKey = newApi.uid.includes('_') ? newApi.uid : `${newApi.uid}_0`;
        const profile =
          resp.changed_profiles?.[uidKey] ??
          resp.changed_profiles?.[newApi.uid] ??
          resp.unchanged_profiles?.[uidKey] ??
          resp.unchanged_profiles?.[newApi.uid];
        fetchedName = profile?.displayName?.trim() || profile?.zaloName?.trim() || 'Zalo';
        if (fetchedName !== 'Zalo') {
          accountAliasStore.set(newApi.uid, fetchedName);
        }
      }
    } catch {}

    onNewApi(newApi.api, newApi.uid, fetchedName);
  } catch (err) {
    await tgBot.telegram.sendMessage(
      chatId,
      `❌ Đăng nhập thất bại: ${String(err)}`,
      msgOpts,
    ).catch(() => undefined);
  } finally {
    qrLoginInProgress = false;
  }
}

/**
 * Wire up Telegram → Zalo forwarding.
 *
 * @param initialApi  Starting Zalo API (null if not yet logged in).
 * @param onZaloLogin Called with the new API after a successful /login so the
 *                    caller can re-attach the Zalo listener on the fresh API.
 */
export function setupTelegramHandler(initialApi: any, onLoginCb: any) {
  setupSetAlias(tgBot);
  setupSyncAliases(tgBot);

  /** Mutable reference so /login can swap in a new API instance. */
  let currentApi: ZaloAPI | null = initialApi;

  /** Exposed setter so index.ts can inject the auto-logged-in API. */
  const setCurrentApi = (api: ZaloAPI) => { currentApi = api; };

  tgBot.action(/^login_cancel:(qr|app):(.+)$/, async (ctx) => {
    const kind = ctx.match[1];
    let canceled = false;
    if (kind === 'qr') {
      canceled = cancelActiveQRLogin();
      qrLoginInProgress = false;
    } else if (kind === 'app') {
      canceled = cancelActiveAppLogin();
      appLoginInProgress = false;
    }
    
    if (canceled) {
      await ctx.editMessageCaption('❌ Đăng nhập đã bị hủy.').catch(() => undefined);
      await ctx.answerCbQuery('Đã hủy đăng nhập').catch(() => undefined);
    } else {
      await ctx.answerCbQuery('Không có phiên đăng nhập nào đang chạy').catch(() => undefined);
    }
  });

  tgBot.command('login', async (ctx) => {
    const isPrivate   = ctx.chat.type === 'private';
    const isFromGroup = ctx.chat.id === config.telegram.groupId;
    if (!isPrivate && !isFromGroup) {
      console.log(`[/login] Bỏ qua từ chat ${ctx.chat.id} (không phải group ${config.telegram.groupId} hoặc DM)`);
      return;
    }
    const threadId = isFromGroup ? ctx.message.message_thread_id : undefined;
    await handleLoginCommand(ctx.chat.id, threadId, (api, accountId, accountName) => {
      currentApi = api;
    // @ts-ignore
      void onLoginCb(api, accountId, accountName).catch((e: unknown) => console.error('[/login] onZaloLogin error:', e));
    });
  });

  // /loginweb — alias for the existing zca-js QR login (same as /login)
  tgBot.command('loginweb', async (ctx) => {
    const isPrivate   = ctx.chat.type === 'private';
    const isFromGroup = ctx.chat.id === config.telegram.groupId;
    if (!isPrivate && !isFromGroup) return;
    const threadId = isFromGroup ? ctx.message.message_thread_id : undefined;
    await handleLoginCommand(ctx.chat.id, threadId, (api, accountId, accountName) => {
      currentApi = api;
    // @ts-ignore
      void onLoginCb(api, accountId, accountName).catch((e: unknown) => console.error('[/loginweb] onZaloLogin error:', e));
    });
  });

  // /loginapp — QR login via PC App API (wpa.zaloapp.com)
  tgBot.command('loginapp', async (ctx) => {
    const isPrivate   = ctx.chat.type === 'private';
    const isFromGroup = ctx.chat.id === config.telegram.groupId;
    if (!isPrivate && !isFromGroup) return;
    const chatId   = ctx.chat.id;
    const threadId = isFromGroup ? ctx.message.message_thread_id : undefined;
    const msgOpts  = threadId ? { message_thread_id: threadId } : {};

    if (appLoginInProgress) {
      await ctx.reply('⏳ Đang có phiên đăng nhập App đang chạy. Vui lòng chờ...', msgOpts);
      return;
    }
    if (qrLoginInProgress) {
      await ctx.reply('⏳ Đang có phiên đăng nhập Web đang chạy. Vui lòng chờ...', msgOpts);
      return;
    }

    appLoginInProgress = true;
    try {
      await tgBot.telegram.sendMessage(chatId, '🔄 Đang tạo mã QR Zalo (PC App API)...', msgOpts);

      const newApi = await triggerAppLogin({
        onQRReady: async (imagePath) => {
          await tgBot.telegram.sendPhoto(
            chatId,
            { source: createReadStream(imagePath) },
            {
              ...msgOpts,
              caption: '📱 Mở ứng dụng <b>Zalo</b> → Cài đặt → Quét mã QR để đăng nhập.',
              parse_mode: 'HTML',
              reply_markup: {
                inline_keyboard: [[{ text: '❌ Hủy đăng nhập', callback_data: `login_cancel:app:active` }]]
              }
            },
          );
        },
        onScanned: async () => {
          await tgBot.telegram.sendMessage(chatId, '✅ Đã quét! Đang lấy thông tin đăng nhập...', msgOpts);
        },
        onSuccess: async () => {
          await tgBot.telegram.sendMessage(
            chatId,
            '🎉 Đăng nhập Zalo (App API) thành công! Bridge đang hoạt động.',
            msgOpts,
          );
        },
      });

      invalidateAppSession();
      let fetchedName = 'Zalo';
      try {
        const resp = await newApi.api.getUserInfo(newApi.uid).catch(() => undefined) as any;
        if (resp) {
          const uidKey = newApi.uid.includes('_') ? newApi.uid : `${newApi.uid}_0`;
          const profile =
            resp.changed_profiles?.[uidKey] ??
            resp.changed_profiles?.[newApi.uid] ??
            resp.unchanged_profiles?.[uidKey] ??
            resp.unchanged_profiles?.[newApi.uid];
          fetchedName = profile?.displayName?.trim() || profile?.zaloName?.trim() || 'Zalo';
          if (fetchedName !== 'Zalo') {
            accountAliasStore.set(newApi.uid, fetchedName);
          }
        }
      } catch {}

    // @ts-ignore
      void onLoginCb(newApi.api, newApi.uid, fetchedName).catch((e: unknown) => console.error('[/loginapp] onZaloLogin error:', e));
    } catch (err) {
      await tgBot.telegram.sendMessage(
        chatId,
        `❌ Đăng nhập App thất bại: ${String(err)}`,
        msgOpts,
      ).catch(() => undefined);
    } finally {
      appLoginInProgress = false;
    }
  });

  // /topic – manage bridge topic mappings
  // Usage inside a topic:  /topic info | /topic delete
  // Usage from General:    /topic list
  tgBot.command('topic', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const topicId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const arg = (ctx.message.text ?? '').split(/\s+/)[1]?.toLowerCase() ?? '';
    const replyOpts = topicId ? { message_thread_id: topicId } : {};

    if (arg === 'list' || !arg) {
      const all = store.all();
      if (all.length === 0) {
        await ctx.telegram.sendMessage(config.telegram.groupId, '📭 Chưa có topic nào.', replyOpts);
        return;
      }
      const lines = all.map(e =>
        `• <b>${e.name}</b> — topicId=${e.topicId}, zaloId=${e.zaloId}, type=${e.type === 1 ? 'group' : 'dm'}`,
      );
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `📋 <b>Bridge topics</b> (${all.length}):\n${lines.join('\n')}`,
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    if (!topicId) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Lệnh này phải được gửi trong một topic cụ thể.',
        replyOpts,
      );
      return;
    }

    if (arg === 'info') {
      const entry = store.getEntryByTopic(topicId);
      if (!entry) {
        await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Topic này chưa được map.', replyOpts);
        return;
      }
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `ℹ️ <b>${entry.name}</b>\nzaloId: <code>${entry.zaloId}</code>\ntype: ${entry.type === 1 ? 'group' : 'dm'}`,
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    if (arg === 'delete') {
      const removed = store.remove(topicId);
      if (!removed) {
        await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Topic này chưa được map.', replyOpts);
        return;
      }
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `🗑️ Đã xoá mapping: <b>${removed.name}</b> (zaloId=${removed.zaloId})`,
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      '❓ Dùng: <code>/topic list</code> | <code>/topic info</code> | <code>/topic delete</code>',
      { ...replyOpts, parse_mode: 'HTML' },
    );
  });

  // /history — đồng bộ lịch sử tin nhắn nhóm vào topic hiện tại.
  // Cú pháp: /history [số_tin] (ví dụ: /history 30)
  // Chỉ hoạt động trong topic nhóm Zalo (không hỗ trợ DM).
  tgBot.command('history', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const topicId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = topicId ? { message_thread_id: topicId } : {};

    if (!topicId) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Hãy gửi <code>/history</code> trong topic nhóm Zalo cần sync lịch sử.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const entry = store.getEntryByTopic(topicId);
    if (!entry || entry.type !== 1) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Lệnh này chỉ dùng được trong topic <b>nhóm</b> Zalo (không hỗ trợ chat riêng).',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    if (getAllZaloApis().size === 0) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối.', replyOpts);
      return;
    }

    // Parse count từ tham số (ví dụ /history 30)
    const rawArg = (ctx.message.text ?? '').split(/\s+/)[1];
    const requestedCount = rawArg ? parseInt(rawArg, 10) : undefined;
    const count = (requestedCount && !isNaN(requestedCount) && requestedCount > 0)
      ? Math.min(requestedCount, 200)   // tối đa 200 để tránh spam
      : config.zalo.historySyncCount;

    const delayMs = config.zalo.historySyncDelayMs;

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `🔄 Đang đồng bộ tối đa <b>${count}</b> tin nhắn lịch sử của <b>${escapeHtml(entry.name)}</b>…\n<i>(delay ${delayMs}ms/tin để tránh bị Zalo giới hạn)</i>`,
      { ...replyOpts, parse_mode: 'HTML' },
    );

    try {
      const { syncGroupHistory } = await import('../zalo/historySync.js');
      const api = resolveApiForTopic(topicId);
      if (!api) throw new Error('API not found');
      const forwarded = await syncGroupHistory(api, entry.zaloId, topicId, entry.accountId, { count, delayMs });
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `✅ Đã đồng bộ <b>${forwarded}</b> tin nhắn lịch sử.`,
        { ...replyOpts, parse_mode: 'HTML' },
      );
    } catch (err) {
      console.error('[/history] syncGroupHistory error:', err);
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `❌ Lỗi khi đồng bộ lịch sử: ${escapeHtml(String(err))}`,
        { ...replyOpts, parse_mode: 'HTML' },
      ).catch(() => undefined);
    }
  });

  // /call — trigger a personal call request for current mapped DM topic.
  // Usage in a personal topic: /call or /call video
  tgBot.command('call', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const topicId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = topicId ? { message_thread_id: topicId } : {};

    if (!topicId) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Hãy gửi <code>/call</code> trong topic cá nhân cần gọi.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const entry = store.getEntryByTopic(topicId);
    if (!entry || entry.type !== 0) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Topic này không phải chat cá nhân Zalo.',
        replyOpts,
      );
      return;
    }

    const arg = (ctx.message.text ?? '').replace(/^\/call(?:@[A-Za-z0-9_]+)?/i, '').trim().toLowerCase();
    const kind = (arg === 'video' || arg === 'cam') ? 'video' : 'audio';
    console.log(`[TG→Zalo][call] start topicId=${topicId} zaloId=${entry.zaloId} kind=${kind}`);

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `📞 Đang gửi yêu cầu cuộc gọi ${kind === 'video' ? 'video' : 'thoại'} tới <b>${escapeHtml(entry.name)}</b>...`,
      { ...replyOpts, parse_mode: 'HTML' },
    );

    const result = await appRequestVoiceCall(entry.zaloId, kind);
    if (!result) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Không có App session. Dùng <code>/loginapp</code> trước rồi thử lại.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const { request, response } = result;
    const statusNum =
      response.data && typeof response.data === 'object' && 'status' in response.data
        ? (response.data as { status?: unknown }).status
        : undefined;
    if (response.data !== undefined) {
      console.log('[TG→Zalo][call] response.data =', JSON.stringify(response.data));
    }

    if (response.errorCode === 0) {
      const reqSignalCode = result.signals?.request?.errorCode;
      const ringSignalCode = result.signals?.ringring?.errorCode;
      if (result.signals?.request) {
        console.log(
          `[TG→Zalo][call] signal request errorCode=${result.signals.request.errorCode} message=${result.signals.request.errorMessage}`,
        );
      }
      if (result.signals?.ringring) {
        console.log(
          `[TG→Zalo][call] signal ringring errorCode=${result.signals.ringring.errorCode} message=${result.signals.ringring.errorMessage}`,
        );
      }
      console.log(
        '✅ Đã gửi request gọi.\n' +
        `• calleeId: ${request.calleeId}\n` +
        `• callId: ${request.callId}\n` +
        (statusNum !== undefined ? `• status: ${String(statusNum)}` : ''),
      );
      const signalingOk = (reqSignalCode === undefined || reqSignalCode === 0)
        && (ringSignalCode === undefined || ringSignalCode === 0);
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `${signalingOk ? '✅' : '⚠️'} Đã gửi request gọi.\n` +
        `• calleeId: <code>${escapeHtml(request.calleeId)}</code>\n` +
        `• callId: <code>${request.callId}</code>\n` +
        (statusNum !== undefined ? `• status: <code>${escapeHtml(String(statusNum))}</code>\n` : '') +
        (reqSignalCode !== undefined ? `• requestSignal: <code>${reqSignalCode}</code>\n` : '') +
        (ringSignalCode !== undefined ? `• ringSignal: <code>${ringSignalCode}</code>` : ''),
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `❌ Gọi thất bại [${response.errorCode}]: ${escapeHtml(response.errorMessage)}`,
      { ...replyOpts, parse_mode: 'HTML' },
    );
    console.warn(
      `[TG→Zalo][call] failed topicId=${topicId} zaloId=${entry.zaloId} errorCode=${response.errorCode} errorMessage=${response.errorMessage}`,
    );
  });

  // /callgroup — trigger a group VIDEO call request for current mapped Zalo group topic.
  // Usage:
  // - /callgroup                 -> video call all members found from group info
  // - /callgroup video           -> video call
  // - /callgroup <uid1> <uid2>  -> video call selected partner IDs only
  tgBot.command('callgroup', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const topicId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = topicId ? { message_thread_id: topicId } : {};

    if (!topicId) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Hãy gửi <code>/callgroup</code> trong topic nhóm Zalo cần gọi.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const entry = store.getEntryByTopic(topicId);
    if (!entry || entry.type !== 1) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Topic này không phải nhóm Zalo.',
        replyOpts,
      );
      return;
    }

    const rawArgs = (ctx.message.text ?? '').replace(/^\/callgroup(?:@[A-Za-z0-9_]+)?/i, '').trim();
    const tokens = rawArgs.length > 0
      ? rawArgs.split(/[\s,]+/).map(t => t.trim()).filter(Boolean)
      : [];
    const kindToken = tokens[0]?.toLowerCase();
    const isVideoKeyword = kindToken === 'video' || kindToken === 'cam';
    const uidTokens = isVideoKeyword
      ? tokens.slice(1)
      : tokens;

    let partners = uidTokens
      .map(v => v.replace(/[^\d]/g, ''))
      .filter(v => v.length > 0);

    if (partners.length === 0) {
      let groupData = await appGetGroupInfo(entry.zaloId);
      if (groupData) {
        console.log(`[API][APP] getGroupInfo group=${entry.zaloId} source=callgroup`);
      }
      const api = resolveApiForTopic(entry.topicId);
      if (!groupData && api) {
        try {
          console.log(`[API][WEB] getGroupInfo group=${entry.zaloId} source=callgroup fallback=app_empty`);
          const info = await api.getGroupInfo(entry.zaloId) as {
            gridInfoMap?: Record<string, { memVerList?: string[] }>;
          };
          groupData = info?.gridInfoMap?.[entry.zaloId] ?? null;
        } catch {
          groupData = null;
        }
      }

      partners = Array.from(new Set(
        (groupData?.memVerList ?? [])
          .map(v => String(v).split('_')[0]?.trim())
          .filter((v): v is string => Boolean(v && v.length > 0)),
      ));
    }

    if (partners.length === 0) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Không lấy được danh sách thành viên group để gọi.',
        replyOpts,
      );
      return;
    }

    console.log(
      `[TG→Zalo][callgroup] start topicId=${topicId} groupId=${entry.zaloId} kind=video partners=${partners.length}`,
    );
    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `📞 Đang gửi yêu cầu gọi nhóm <b>video</b> tới <b>${escapeHtml(entry.name)}</b>...`,
      { ...replyOpts, parse_mode: 'HTML' },
    );

    const result = await appRequestGroupVoiceCall(entry.zaloId, partners, 'video');
    if (!result) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Không có App session. Dùng <code>/loginapp</code> trước rồi thử lại.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const statusNum =
      result.response.data && typeof result.response.data === 'object' && 'status' in result.response.data
        ? (result.response.data as { status?: unknown }).status
        : undefined;

    if (result.response.errorCode === 0) {
      const ringrings = result.ringrings ?? [];
      const failedRings = ringrings.filter(r => r.errorCode !== 0);
      const ringOk = ringrings.length > 0 && failedRings.length === 0;
      const ringStatuses = (result.diagnostics?.ringStatuses ?? [])
        .map(r => `${r.calleeId}:${r.status ?? '?'}`)
        .join(', ');
      const requestSignalCode = result.diagnostics?.requestSignal?.errorCode;
      const stateSignalCode = result.diagnostics?.state?.errorCode;
      if (result.response.data !== undefined) {
        console.log('[TG→Zalo][callgroup] response.data =', JSON.stringify(result.response.data));
      }
      for (const rr of ringrings) {
        console.log(
          `[TG→Zalo][callgroup] signal ringring calleeId=${rr.calleeId} errorCode=${rr.errorCode} message=${rr.errorMessage}`,
        );
      }
      if (requestSignalCode !== undefined) {
        console.log(
          `[TG→Zalo][callgroup] signal request errorCode=${requestSignalCode} message=${result.diagnostics?.requestSignal?.errorMessage ?? ''}`,
        );
      }
      if (stateSignalCode !== undefined) {
        console.log(
          `[TG→Zalo][callgroup] signal state errorCode=${stateSignalCode} message=${result.diagnostics?.state?.errorMessage ?? ''} hostCall=${result.diagnostics?.state?.hostCall ?? 0}`,
        );
      }
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `${ringOk ? '✅' : '⚠️'} Đã gửi request gọi nhóm.\n` +
        `• groupId: <code>${escapeHtml(result.request.groupId)}</code>\n` +
        `• callId: <code>${result.request.callId}</code>\n` +
        `• partners: <code>${result.request.partners.length}</code>\n` +
        (statusNum !== undefined ? `• status: <code>${escapeHtml(String(statusNum))}</code>\n` : '') +
        `• ringSignals: <code>${ringrings.length}</code> ok / <code>${failedRings.length}</code> fail\n` +
        (ringStatuses ? `• ringStatus: <code>${escapeHtml(ringStatuses)}</code>\n` : '') +
        (requestSignalCode !== undefined ? `• requestSignal: <code>${requestSignalCode}</code>\n` : '') +
        (stateSignalCode !== undefined ? `• stateSignal: <code>${stateSignalCode}</code>` : ''),
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `❌ Gọi nhóm thất bại [${result.response.errorCode}]: ${escapeHtml(result.response.errorMessage)}`,
      { ...replyOpts, parse_mode: 'HTML' },
    );
    console.warn(
      `[TG→Zalo][callgroup] failed topicId=${topicId} groupId=${entry.zaloId} errorCode=${result.response.errorCode} errorMessage=${result.response.errorMessage}`,
    );
  });

  // /group_info — show Zalo group metadata and member names for the current topic.
  // Usage inside a Zalo group topic: /group_info [all] or /group_infoall
  const handleGroupInfoCommand = async (ctx: Context & { message: { text?: string; message_thread_id?: number } }, forceAll = false) => {
    if (!ctx.chat || ctx.chat.id !== config.telegram.groupId) return;
    const topicId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = topicId ? { message_thread_id: topicId } : {};

    if (!topicId) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Hãy gửi <code>/group_info</code> trong topic của nhóm Zalo cần xem.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const entry = store.getEntryByTopic(topicId);
    if (!entry || entry.type !== 1) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Topic này không phải nhóm Zalo.', replyOpts);
      return;
    }
    const api = resolveApiForTopic(entry.topicId);
    if (!api) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối', replyOpts);
      return;
    }

    const showAll = forceAll || /\ball\b/i.test(ctx.message.text ?? '');
    const groupId = entry.zaloId;

    try {
      let groupData = await appGetGroupInfo(groupId);
      if (groupData) {
        console.log(`[API][APP] getGroupInfo group=${groupId} source=group_info`);
      }
      if (!groupData) {
        console.log(`[API][WEB] getGroupInfo group=${groupId} source=group_info fallback=app_empty`);
        const info = await api.getGroupInfo(groupId) as {
          gridInfoMap?: Record<string, {
            name?: string;
            avt?: string;
            memVerList?: string[];
            currentMems?: Array<{ id: string; dName?: string; zaloName?: string }>;
            totalMember?: number;
            hasMoreMember?: number;
          }>;
        } | undefined;
        groupData = info?.gridInfoMap?.[groupId] ?? null;
      }

      if (!groupData) {
        await ctx.telegram.sendMessage(
          config.telegram.groupId,
          '❌ Không lấy được thông tin nhóm từ Zalo API. Có thể session hết hạn hoặc Zalo đang giới hạn request.',
          replyOpts,
        );
        return;
      }

      const knownNames = new Map<string, string>();
      for (const m of groupData.currentMems ?? []) {
        const name = m.dName?.trim() || m.zaloName?.trim();
        if (m.id && name) knownNames.set(m.id, name);
      }

      const memberUids = Array.from(new Set(
        (groupData.memVerList ?? [])
          .map(s => String(s).split('_')[0])
          .filter(Boolean),
      ));

      const missingUids = memberUids.filter(uid => !knownNames.has(uid));
      if (missingUids.length > 0) {
        const appNames = await appGetGroupMembersInfo(missingUids).catch(() => null);
        if (appNames) {
          console.log(
            `[API][APP] getGroupMembersInfo group=${groupId} source=group_info requested=${missingUids.length} resolved=${appNames.size}`,
          );
        } else {
          console.log(`[API][APP] getGroupMembersInfo group=${groupId} source=group_info unavailable`);
        }
        for (const uid of missingUids) {
          const name = appNames?.get(uid);
          if (name) knownNames.set(uid, name);
        }
      }

      const members = memberUids
        .map(uid => {
          const profileName = knownNames.get(uid);
          return {
            uid,
            name: aliasCache.get(uid)?.trim() || profileName || uid,
            profileName,
            isAlias: Boolean(aliasCache.get(uid)?.trim()),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

      const groupName = groupData.name?.trim() || entry.name;
      const totalMember = groupData.totalMember ?? memberUids.length;
      const resolvedCount = members.filter(m => m.name !== m.uid).length;
      const displayLimit = showAll ? members.length : 120;
      const visibleMembers = members.slice(0, displayLimit);

      const headerLines = [
        `👥 <b>${escapeHtml(groupName)}</b>`,
        `Zalo ID: <code>${escapeHtml(groupId)}</code>`,
        `Thành viên: <b>${totalMember ?? '?'}</b>`,
        `Đọc được tên: <b>${resolvedCount}/${memberUids.length}</b>`,
      ];
      if (!showAll && members.length > displayLimit) {
        headerLines.push(``, `ℹ️ Đang hiện ${displayLimit}/${members.length} người. Gõ <code>/group_info all</code> để xem hết.`);
      }

      const lines = visibleMembers.map((m, idx) => {
        const suffix = m.name === m.uid
          ? ` <code>${escapeHtml(m.uid)}</code>`
          : (m.isAlias && m.profileName && m.profileName !== m.name ? ` <i>(${escapeHtml(m.profileName)})</i>` : '');
        return `${idx + 1}. ${escapeHtml(m.name)}${suffix}`;
      });

      if (lines.length === 0) {
        await ctx.telegram.sendMessage(
          config.telegram.groupId,
          `${headerLines.join('\n')}\n\n⚠️ Zalo API không trả danh sách UID thành viên cho nhóm này.`,
          { ...replyOpts, parse_mode: 'HTML' },
        );
        return;
      }

      let chunk = `${headerLines.join('\n')}\n\n<b>Danh sách:</b>`;
      for (const line of lines) {
        const next = `${chunk}\n${line}`;
        if (next.length > 3500) {
          await ctx.telegram.sendMessage(config.telegram.groupId, chunk, { ...replyOpts, parse_mode: 'HTML' });
          chunk = line;
        } else {
          chunk = next;
        }
      }
      if (chunk) {
        await ctx.telegram.sendMessage(config.telegram.groupId, chunk, { ...replyOpts, parse_mode: 'HTML' });
      }
    } catch (err) {
      console.error('[/group_info]', err);
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `❌ Lỗi lấy thông tin nhóm: ${escapeHtml(err instanceof Error ? err.message : String(err))}`,
        { ...replyOpts, parse_mode: 'HTML' },
      );
    }
  };

  tgBot.command('group_info', async (ctx) => handleGroupInfoCommand(ctx));
  tgBot.command('group_infoall', async (ctx) => handleGroupInfoCommand(ctx, true));

  tgBot.command('recall', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;

    const topicId = ctx.message.message_thread_id;
    if (!topicId) {
      await ctx.reply('ℹ️ Vui lòng dùng lệnh này trong topic.');
      return;
    }

    const api = resolveApiForTopic(topicId);
    if (!api) { await ctx.reply('❌ Zalo chưa kết nối'); return; }

    const replyTo = 'reply_to_message' in ctx.message
      ? (ctx.message as { reply_to_message?: { message_id: number } }).reply_to_message
      : undefined;

    if (!replyTo) {
      await ctx.reply('ℹ️ Reply vào tin nhắn mình đã gửi rồi gõ /recall');
      return;
    }

    // 1. Try sentMsgStore (TG→Zalo messages we sent)
    const sent = sentMsgStore.get(replyTo.message_id);
    if (sent) {
      const { ThreadType } = await import('zca-js');
      const zaloThreadType = sent.threadType === 1 ? ThreadType.Group : ThreadType.User;
      try {
        let recalled = 0;
        for (const mid of sent.msgIds) {
          await api.undo({ msgId: mid, cliMsgId: 0 }, sent.zaloId, zaloThreadType);
          markRecalled(String(mid));
          recalled++;
        }
        console.log(`[TG→Zalo] Recall ${recalled} msgIds=[${sent.msgIds}] zaloId=${sent.zaloId}`);
        await ctx.reply(`✅ Đã thu hồi ${recalled} tin nhắn trên Zalo`);
      } catch (err) {
        console.error('[TG→Zalo] Recall error:', err);
        await ctx.reply(`❌ Thu hồi thất bại: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }

    // 2. Fallback: try msgStore (Zalo→TG forwarded messages)
    const quote = msgStore.getQuote(replyTo.message_id);
    if (!quote) {
      await ctx.reply('❌ Không tìm thấy tin nhắn đã gửi (chỉ thu hồi được tin mình gửi từ Telegram hoặc tin từ Zalo đã forward)');
      return;
    }
    const { ThreadType } = await import('zca-js');
    const zaloThreadType = quote.threadType === 1 ? ThreadType.Group : ThreadType.User;
    try {
      await api.undo(
        { msgId: Number(quote.msgId), cliMsgId: quote.cliMsgId ? Number(quote.cliMsgId) : 0 },
        quote.zaloId,
        zaloThreadType,
      );
      markRecalled(quote.msgId);
      console.log(`[TG→Zalo] Recall msgId=${quote.msgId} zaloId=${quote.zaloId} (Zalo→TG)`);
      await ctx.reply(`✅ Đã thu hồi tin nhắn trên Zalo`);
    } catch (err) {
      console.error('[TG→Zalo] Recall error (Zalo→TG):', err);
      await ctx.reply(`❌ Thu hồi thất bại: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  tgBot.command('search', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const threadId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = threadId ? { message_thread_id: threadId } : {};

    const query = (ctx.message.text ?? '').replace(/^\/search(?:@[A-Za-z0-9_]+)?\s*/i, '').trim();
    if (!query) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '🔍 Cú pháp: <code>/search Tên hoặc số điện thoại</code>\nHỗ trợ cả <code>/search ...</code> lẫn <code>/search@zalo_tele_bridge_bot ...</code>.\nVí dụ số: <code>094.495.3545</code> hoặc <code>094 593 5345</code>.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    if (getAllZaloApis().size === 0) { await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối', replyOpts); return; }

    const phoneQuery = normalizePhoneSearchQuery(query);
    if (phoneQuery) {
      try {
        let user: { uid?: string; display_name?: string; zalo_name?: string } | undefined;
        let foundAccountId = '';
        for (const [accId, a] of getAllZaloApis().entries()) {
          try {
            user = await a.findUser(phoneQuery) as any;
            if (user?.uid) { foundAccountId = accId; break; }
          } catch { /* ignore */ }
        }

        if (!user?.uid) {
          await ctx.telegram.sendMessage(
            config.telegram.groupId,
            `🔍 Không tìm thấy tài khoản Zalo cho số <b>${phoneQuery}</b>.`,
            { ...replyOpts, parse_mode: 'HTML' },
          );
          return;
        }

        const displayName = user.display_name || user.zalo_name || `Zalo ${user.uid}`;
    // @ts-ignore
        const existingTopicId = store.getTopicByZalo(foundAccountId, user.uid, 0);
        const button: { text: string; callback_data: string } = existingTopicId !== undefined
    // @ts-ignore
          ? { text: `👤 ${displayName} ✅`, callback_data: `sc:${foundAccountId}:${user.uid}` }
    // @ts-ignore
          : { text: `👤 ${displayName}`, callback_data: `sc:${foundAccountId}:${user.uid}` };

        await ctx.telegram.sendMessage(
          config.telegram.groupId,
          `📱 Tìm thấy theo số <b>${phoneQuery}</b>:

✅ = đã có topic • Nhấn để mở nếu đã map, hoặc tạo nếu chưa có`,
          {
            ...replyOpts,
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [[button]],
            },
          },
        );
        return;
      } catch (err) {
        console.error('[/search] findUser failed:', err);
        await ctx.telegram.sendMessage(
          config.telegram.groupId,
          `❌ Lỗi tìm số điện thoại <b>${phoneQuery}</b>: ${err instanceof Error ? err.message : String(err)}`,
          { ...replyOpts, parse_mode: 'HTML' },
        );
        return;
      }
    }

    // Refresh friends cache if stale
    if (!friendsCache.isFresh()) {
      const allFriends: Array<{ userId: string; displayName: string; avatar: string; accountId: string; alias?: string }> = [];
      const allApis = getAllZaloApis();
      for (const [accountId, api] of allApis.entries()) {
        try {
          const raw = await api.getAllFriends() as Array<{ userId: string; displayName: string }> | undefined;
          if (raw) {
            for (const f of raw) {
              allFriends.push({
                userId: f.userId,
                displayName: f.displayName,
                alias: aliasCache.get(f.userId),
                avatar: '',
                accountId,
              });
            }
          }
        } catch (err) { console.error(`[/search] getAllFriends failed for ${accountId}:`, err); }
      }
      friendsCache.set(allFriends);
    }

    // Refresh groups cache if stale
    if (!groupsCache.isFresh()) {
      const allGroupInfo: Array<{ groupId: string; name: string; totalMember: number; accountId: string; avatar: string }> = [];
      const allApis = getAllZaloApis();
      for (const [accountId, api] of allApis.entries()) {
        try {
          const rawGroups = await api.getAllGroups() as { gridVerMap?: Record<string, string> } | undefined;
          const groupIds = Object.keys(rawGroups?.gridVerMap ?? {});
          if (groupIds.length > 0) {
            const BATCH = 50;
            for (let i = 0; i < groupIds.length; i += BATCH) {
              const batch = groupIds.slice(i, i + BATCH);
              try {
                const info = await api.getGroupInfo(batch) as {
                  gridInfoMap?: Record<string, { name: string; totalMember: number }>;
                } | undefined;
                for (const [gid, g] of Object.entries(info?.gridInfoMap ?? {})) {
                  allGroupInfo.push({ groupId: gid, name: g.name, totalMember: g.totalMember, accountId, avatar: '' });
                }
              } catch { /* skip batch on error */ }
            }
          }
        } catch (err) { console.error(`[/search] getAllGroups failed for ${accountId}:`, err); }
      }
      groupsCache.set(allGroupInfo);
    }

    const friendResults = friendsCache.search(query, 8);
    const groupResults  = groupsCache.search(query, 8);

    if (friendResults.length === 0 && groupResults.length === 0) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `🔍 Không tìm thấy bạn bè hay nhóm nào có tên chứa "<b>${query}</b>".`,
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const buttons: Array<Array<{ text: string; callback_data: string } | { text: string; url: string }>> = [];
    for (const f of friendResults) {
      if (!f.accountId) continue;
      const existingTopicId = store.getTopicByZalo(f.accountId, f.userId, 0);
      const label = f.displayName?.trim() || `Zalo ${f.userId}`;
      const alias = accountAliasStore.get(f.accountId) || f.accountId;
      buttons.push([existingTopicId !== undefined
        ? { text: `👤 [${alias}] ${label} ✅`, callback_data: `sc:${f.accountId}:${f.userId}` }
        : { text: `👤 [${alias}] ${label}`, callback_data: `sc:${f.accountId}:${f.userId}` }]);
    }
    for (const g of groupResults) {
      if (!g.accountId) continue;
      const existingTopicId = store.getTopicByZalo(g.accountId, g.groupId, 1);
      const alias = accountAliasStore.get(g.accountId) || g.accountId;
      buttons.push([existingTopicId !== undefined
        ? { text: `👥 [${alias}] ${g.name} (${g.totalMember} TV) ✅`, callback_data: `sg:${g.accountId}:${g.groupId}` }
        : { text: `👥 [${alias}] ${g.name} (${g.totalMember} TV)`, callback_data: `sg:${g.accountId}:${g.groupId}` }]);
    }

    const parts: string[] = [`🔍 Kết quả "<b>${query}</b>":`, ''];
    if (friendResults.length > 0) parts.push(`👤 <b>Bạn bè</b> (${friendResults.length}):`);
    if (groupResults.length > 0)  parts.push(`👥 <b>Nhóm</b> (${groupResults.length}):`);
    parts.push('', '✅ = đã có topic • Nhấn để mở nếu đã map, hoặc tạo nếu chưa có');

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      parts.join('\n'),
      { ...replyOpts, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } },
    );
  });

  // /addgroup — list all groups without a topic and let user pick
  tgBot.command('addgroup', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const threadId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = threadId ? { message_thread_id: threadId } : {};

    const allApis = getAllZaloApis();
    if (allApis.size === 0) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối', replyOpts);
      return;
    }

    // Refresh groups cache if stale
    if (!groupsCache.isFresh()) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '⏳ Đang tải danh sách nhóm...', replyOpts);
      const allGroupInfo: Array<{ groupId: string; name: string; totalMember: number; accountId: string; avatar: string }> = [];
      for (const [accountId, api] of allApis.entries()) {
        try {
          const rawGroups = await api.getAllGroups() as { gridVerMap?: Record<string, string> } | undefined;
          const groupIds = Object.keys(rawGroups?.gridVerMap ?? {});
          const BATCH = 50;
          for (let i = 0; i < groupIds.length; i += BATCH) {
            const batch = groupIds.slice(i, i + BATCH);
            try {
              const info = await api.getGroupInfo(batch) as {
                gridInfoMap?: Record<string, { name: string; totalMember: number }>;
              } | undefined;
              for (const [gid, g] of Object.entries(info?.gridInfoMap ?? {})) {
                allGroupInfo.push({ groupId: gid, name: g.name, totalMember: g.totalMember, accountId, avatar: '' });
              }
            } catch { /* skip */ }
          }
        } catch (err) {
          console.error(`[/addgroup] failed for ${accountId}:`, err);
        }
      }
      groupsCache.set(allGroupInfo);
    }

    // Show unmapped groups (no topic yet), sorted by name
    const unmapped = groupsCache.search('', 50)
      .filter(g => g.accountId && store.getTopicByZalo(g.accountId, g.groupId, 1) === undefined)
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    if (unmapped.length === 0) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '✅ Tất cả nhóm Zalo đã có topic rồi!',
        replyOpts,
      );
      return;
    }

    const buttons = unmapped.slice(0, 30).map(g => {
      const alias = accountAliasStore.get(g.accountId!) || g.accountId!;
      return [{
        text: `👥 [${alias}] ${g.name} (${g.totalMember} TV)`,
        callback_data: `sg:${g.accountId}:${g.groupId}`,
      }];
    });

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `📋 <b>Nhóm chưa có topic</b> (${unmapped.length}):\nNhấn để tạo topic:`,
      { ...replyOpts, parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } },
    );
  });

  // ── /addfriend <số điện thoại> ─────────────────────────────────────────────
  tgBot.command('addfriend', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const threadId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = threadId ? { message_thread_id: threadId } : {};

    const allApis = getAllZaloApis();
    if (allApis.size === 0) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối', replyOpts);
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const phone = text.split(/\s+/)[1]?.replace(/[^0-9+]/g, '');
    if (!phone) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Dùng: <code>/addfriend &lt;số điện thoại&gt;</code>\nVí dụ: <code>/addfriend 0912345678</code>',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    try {
      // Use the first API to find the user globally
      const firstApi = Array.from(allApis.values())[0];
      const user = await firstApi.findUser(phone) as {
        uid?: string; display_name?: string; zalo_name?: string; avatar?: string;
        globalId?: string;
      } | undefined;

      if (!user?.uid) {
        await ctx.telegram.sendMessage(
          config.telegram.groupId,
          `❌ Không tìm thấy người dùng với SĐT <code>${phone}</code>`,
          { ...replyOpts, parse_mode: 'HTML' },
        );
        return;
      }

      const name = user.display_name ?? user.zalo_name ?? `UID ${user.uid}`;
      const keyboard: Array<[{ text: string; callback_data: string }]> = [];

      for (const [accountId, api] of allApis.entries()) {
        const alias = accountAliasStore.get(accountId) || accountId;
        const status = await api.getFriendRequestStatus(user.uid) as {
          is_friend?: number; is_requested?: number; is_requesting?: number;
        } | undefined;

        if (status?.is_friend) {
          keyboard.push([{ text: `✅ [${alias}] Đã là bạn bè`, callback_data: 'noop' }]);
        } else if (status?.is_requesting) {
          keyboard.push([{ text: `⏳ [${alias}] Đang chờ họ chấp nhận`, callback_data: 'noop' }]);
        } else if (status?.is_requested) {
          keyboard.push([{ text: `📩 [${alias}] Họ chờ bạn chấp nhận`, callback_data: `afr:${accountId}:${user.uid}` }]);
        } else {
          keyboard.push([{ text: `➕ [${alias}] Kết bạn với ${name}`, callback_data: `af:${accountId}:${user.uid}` }]);
        }
      }

      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        `👤 <b>${name}</b>\n📱 ${phone}`,
        {
          ...replyOpts,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: keyboard },
        },
      );
    } catch (err) {
      console.error('[/addfriend]', err);
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Lỗi tìm kiếm người dùng.', replyOpts);
    }
  });

  // ── /friendrequests ────────────────────────────────────────────────────────
  async function getFriendRequestsMessage(page: number) {
    const allApis = getAllZaloApis();
    if (allApis.size === 0) throw new Error('Zalo chưa kết nối');
    
    const allItems: Array<{ type: 'recv' | 'sent' | 'group', data: any, accountId: string, alias: string }> = [];

    // Attempt to get app-level requests, though they only apply to the active app-session.
    let appSentReqs: any;
    let appRecvRecommends: any;
    try {
      appSentReqs = await appGetSentFriendRequests(500);
      appRecvRecommends = await appGetReceivedFriendRequests(500);
    } catch {}

    let hasUsedAppReqs = false;

    for (const [accountId, api] of allApis.entries()) {
      const alias = accountAliasStore.get(accountId) || accountId;
      
      let sentReqs: any;
      let recvRecommends: any;
      let groupInvites: any;
      
      try {
        groupInvites = await api.getGroupInviteBoxList({ invPerPage: 100 }) as any;
        
        // Use appReqs for the first account only, as it's a singleton session right now.
        if (!hasUsedAppReqs && appSentReqs && Object.keys(appSentReqs).length > 0) {
          sentReqs = appSentReqs;
          recvRecommends = appRecvRecommends;
          hasUsedAppReqs = true;
        } else {
          sentReqs = (await api.getSentFriendRequest()) as any;
          const webRec = await api.getFriendRecommendations() as any;
          recvRecommends = webRec?.recommItems || [];
        }
      } catch (err) {
        console.error(`[API] Error fetching friend requests for ${alias}:`, err);
        continue;
      }

      const receivedReqs = (recvRecommends ?? [])
        .filter((item: any) => item.dataInfo?.recommType === 2 || item.recommType === 2)
        .map((item: any) => item.dataInfo || item);
      const sentList = Object.values(sentReqs ?? {});
      const invites = groupInvites?.invitations ?? [];

      allItems.push(
        ...receivedReqs.map((d: any) => ({ type: 'recv' as const, data: d, accountId, alias })),
        ...sentList.map((d: any) => ({ type: 'sent' as const, data: d, accountId, alias })),
        ...invites.map((d: any) => ({ type: 'group' as const, data: d, accountId, alias }))
      );
    }

    if (allItems.length === 0) {
      return { text: '✅ Không có lời mời nào đang chờ.', reply_markup: undefined };
    }

    const PAGE_SIZE = 10;
    const totalPages = Math.ceil(allItems.length / PAGE_SIZE);
    const safePage = Math.max(0, Math.min(page, totalPages - 1));
    const pagedItems = allItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

    const parts: string[] = [`📋 <b>Danh sách lời mời (Trang ${safePage + 1}/${totalPages})</b>\n`];
    const inlineKeyboards: any[] = [];

    const pagedRecv = pagedItems.filter(i => i.type === 'recv');
    if (pagedRecv.length > 0) {
      parts.push(`📥 <b>Nhận được:</b>`);
      for (const { data: u, accountId, alias } of pagedRecv) {
        const name = escapeHtml(u.displayName || u.zaloName || u.userId);
        const msg  = u.recommInfo?.message ? ` — "${escapeHtml(u.recommInfo.message)}"` : '';
        parts.push(`• [${alias}] ${name}${msg}`);
        inlineKeyboards.push([{ text: `✅ Chấp nhận ${u.displayName || u.zaloName}`, callback_data: `afr:${accountId}:${u.userId}` }]);
      }
    }

    const pagedSent = pagedItems.filter(i => i.type === 'sent');
    if (pagedSent.length > 0) {
      parts.push(`\n📤 <b>Đã gửi:</b>`);
      for (const { data: u, accountId, alias } of pagedSent) {
        const name = escapeHtml(u.displayName || u.zaloName);
        const msg  = u.fReqInfo?.message ? ` — "${escapeHtml(u.fReqInfo.message)}"` : '';
        parts.push(`• [${alias}] ${name}${msg}`);
        inlineKeyboards.push([{ text: `❌ Thu hồi lời mời ${name}`, callback_data: `ufr:${accountId}:${u.userId}` }]);
      }
    }

    const pagedGroup = pagedItems.filter(i => i.type === 'group');
    if (pagedGroup.length > 0) {
      parts.push(`\n📬 <b>Nhóm:</b>`);
      for (const { data: inv, accountId, alias } of pagedGroup) {
        const g = inv.groupInfo;
        const exp = new Date(Number(inv.expiredTs) * 1000).toLocaleDateString('vi-VN');
        parts.push(`• 👥 [${alias}] <b>${escapeHtml(g.name)}</b> (${g.totalMember} TV)\n  Mời bởi: ${escapeHtml(inv.inviterInfo.dName)} · HH: ${exp}`);
        inlineKeyboards.push([{ text: `✅ Tham gia ${g.name}`, callback_data: `jgi:${accountId}:${g.groupId}` }]);
      }
    }

    // Pagination buttons
    const navButtons: any[] = [];
    if (safePage > 0) {
      navButtons.push({ text: '⬅️ Trang trước', callback_data: `frq_pg:${safePage - 1}` });
    }
    if (safePage < totalPages - 1) {
      navButtons.push({ text: 'Trang sau ➡️', callback_data: `frq_pg:${safePage + 1}` });
    }
    if (navButtons.length > 0) {
      inlineKeyboards.push(navButtons);
    }

    return {
      text: parts.join('\n'),
      reply_markup: inlineKeyboards.length > 0 ? { inline_keyboard: inlineKeyboards } : undefined,
    };
  }

  tgBot.command('friendrequests', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const threadId = 'message_thread_id' in ctx.message ? (ctx.message.message_thread_id as number | undefined) : undefined;
    const replyOpts = threadId ? { message_thread_id: threadId } : {};

    try {
      const { text, reply_markup } = await getFriendRequestsMessage(0);
      await ctx.telegram.sendMessage(config.telegram.groupId, text, {
        ...replyOpts,
        parse_mode: 'HTML',
        ...(reply_markup ? { reply_markup } : {}),
      });
    } catch (err) {
      console.error('[/friendrequests]', err);
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Lỗi lấy danh sách lời mời.', replyOpts);
    }
  });

  // ── /joingroup <link> ──────────────────────────────────────────────────────
  tgBot.command('joingroup', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const threadId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = threadId ? { message_thread_id: threadId } : {};

    const allApis = getAllZaloApis();
    if (allApis.size === 0) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối', replyOpts);
      return;
    }

    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    const link = text.split(/\s+/)[1]?.trim();
    if (!link) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Dùng: <code>/joingroup &lt;link nhóm Zalo&gt;</code>',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const results: string[] = [];
    for (const [accountId, api] of allApis.entries()) {
      const alias = accountAliasStore.get(accountId) || accountId;
      try {
        let groupName: string | undefined;
        let totalMember: number | undefined;
        try {
          const linkInfo = await api.getGroupLinkInfo({ link }) as {
            name?: string; totalMember?: number;
          } | undefined;
          groupName   = linkInfo?.name;
          totalMember = linkInfo?.totalMember;
        } catch { /* ignore */ }

        await api.joinGroupLink(link);
        const memberText = totalMember ? ` (${totalMember} TV)` : '';
        results.push(`✅ [${alias}] Đã tham gia <b>${escapeHtml(groupName || 'nhóm')}</b>${memberText}`);
      } catch (err) {
        const errCode = (err as { code?: number })?.code;
        const errMsg  = err instanceof Error ? err.message : String(err);
        if (errCode === 178 || errMsg.includes('178')) {
          results.push(`⚠️ [${alias}] Đã là thành viên nhóm này`);
        } else if (errCode === 240 || errMsg.toLowerCase().includes('waiting') || errMsg.includes('240')) {
          results.push(`⏳ [${alias}] Đã gửi yêu cầu — chờ duyệt`);
        } else {
          results.push(`❌ [${alias}] Lỗi (link hỏng hoặc tài khoản bị chặn)`);
        }
      }
    }
    
    groupsCache.set([]);
    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      results.join('\n'),
      { ...replyOpts, parse_mode: 'HTML' },
    );
  });

  // ── /leavegroup ─────────────────────────────────────────────────────────────
  // Phải gửi trong topic của nhóm muốn rời. Hiển thị confirm button.
  tgBot.command('leavegroup', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const threadId = 'message_thread_id' in ctx.message
      ? (ctx.message.message_thread_id as number | undefined)
      : undefined;
    const replyOpts = threadId ? { message_thread_id: threadId } : {};

    if (!threadId) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '⚠️ Hãy gửi lệnh này <b>trong topic của nhóm</b> muốn rời.',
        { ...replyOpts, parse_mode: 'HTML' },
      );
      return;
    }

    const entry = store.getEntryByTopic(threadId);
    if (!entry || entry.type !== 1) {
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        '❌ Topic này không phải nhóm Zalo.',
        replyOpts,
      );
      return;
    }

    const api = resolveApiForTopic(entry.topicId);
    if (!api) {
      await ctx.telegram.sendMessage(config.telegram.groupId, '❌ Zalo chưa kết nối', replyOpts);
      return;
    }

    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `⚠️ Bạn chắc muốn rời nhóm <b>${entry.name}</b>?\nBot sẽ rời nhóm Zalo và xoá topic này.`,
      {
        ...replyOpts,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Rời nhóm', callback_data: `lg:${threadId}` },
            { text: '❌ Huỷ',      callback_data: 'lg:cancel'       },
          ]],
        },
      },
    );
  });

  // /status — bridge uptime, topic count, all Zalo accounts
  tgBot.command('status', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const replyOpts = ctx.message.message_thread_id
      ? { message_thread_id: ctx.message.message_thread_id }
      : {};
    const uptimeSec = Math.floor((Date.now() - _bridgeStartTime) / 1000);
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;
    const uptimeStr = `${h}g ${m}p ${s}s`;
    const all = store.all();
    const groupCount = all.filter(e => e.type === 1).length;
    const dmCount    = all.length - groupCount;

    const accountTopics = new Map<string, { group: number; dm: number }>();
    for (const e of all) {
      const aid = e.accountId || 'legacy';
      if (!accountTopics.has(aid)) accountTopics.set(aid, { group: 0, dm: 0 });
      if (e.type === 1) accountTopics.get(aid)!.group++;
      else accountTopics.get(aid)!.dm++;
    }

    let topicBreakdown = '';
    if (accountTopics.size > 0) {
      const parts: string[] = [];
      for (const [aid, counts] of accountTopics.entries()) {
         const alias = aid === 'legacy' ? 'Chưa gán account' : accountAliasStore.get(aid) || aid;
         parts.push(`  ├ <i>${escapeHtml(alias)}</i>: ${counts.group + counts.dm} (${counts.group} nhóm, ${counts.dm} DM)`);
      }
      topicBreakdown = '\n' + parts.join('\n');
    }

    // Multi-account: show all connected accounts
    const allApis = getAllZaloApis();
    let accountLines = '';
    if (allApis.size === 0) {
      accountLines = '\n👤 Zalo: <b>chưa kết nối</b>';
    } else {
      const lines: string[] = [];
      for (const [accountId, api] of allApis.entries()) {
        try {
          const info = await api.fetchAccountInfo() as {
            profile?: { displayName?: string; zaloName?: string };
          };
          const name = info?.profile?.displayName ?? info?.profile?.zaloName ?? accountId;
          lines.push(`  🟢 <b>${escapeHtml(name)}</b> (ID: <code>${accountId}</code>)`);
        } catch {
          const alias = accountAliasStore.get(accountId) || accountId;
          lines.push(`  🟡 <b>${escapeHtml(alias)}</b> (ID: <code>${accountId}</code>, không lấy được info)`);
        }
      }
      accountLines = `\n👥 Zalo (${allApis.size}):\n${lines.join('\n')}`;
    }

    let localApiSection = '';
    if (config.telegram.localServer) {
      const apiDetail = await getLocalApiStatus(config.telegram.localServer).catch(() => '❓ Không kiểm tra được');
      localApiSection = `\n\n🤖 <b>Local Bot API</b> (<code>${config.telegram.localServer}</code>)\n${apiDetail}`;
    } else {
      localApiSection = `\n\n🌐 <b>Bot API</b>: official <code>api.telegram.org</code> (50 MB limit)`;
    }
    await ctx.telegram.sendMessage(
      config.telegram.groupId,
      `📊 <b>Trạng thái Bridge</b>${accountLines}\n` +
      `⏱ Uptime: <code>${uptimeStr}</code>\n` +
      `📌 Topics: <b>${all.length}</b> (${groupCount} nhóm, ${dmCount} DM)${topicBreakdown}` +
      localApiSection,
      { parse_mode: 'HTML' },
    );
  });


  // ── Admin panel ──────────────────────────────────────────────────────────

  // ── /update — manual update check ────────────────────────────────────────
  tgBot.command('update', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const { triggerUpdateCheck } = await import('../updater.js');
    const found = await triggerUpdateCheck(ctx.telegram);
    if (!found) {
      await ctx.reply('✅ Bridge đã ở phiên bản mới nhất.', { parse_mode: 'HTML' });
    }
  });

  /** Reusable back-to-menu markup */
  const adminBackMarkup = () => ({
    inline_keyboard: [[{ text: '◀️ Quay lại', callback_data: 'admin:menu' }]],
  });

  tgBot.command('help', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const args = ctx.message.text.split(/\s+/).slice(1);
    
    if (args.length > 0) {
      const cmdStr = args[0]!.replace('/', '').toLowerCase();
      const details = COMMAND_DETAILS[cmdStr];
      if (details) {
        await ctx.reply(`📚 <b>Hướng dẫn lệnh /${cmdStr}:</b>\n\n${details}`, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`❌ Không tìm thấy hướng dẫn chi tiết cho lệnh <code>/${cmdStr}</code>.\nGõ <code>/help</code> để xem toàn bộ lệnh.`, { parse_mode: 'HTML' });
      }
      return;
    }

    const lines = BOT_COMMANDS.map(cmd => `/${cmd.command} - ${cmd.description}`);
    await ctx.reply(`📚 <b>Danh sách các lệnh hiện có:</b>\n\n${lines.join('\n')}\n\n💡 <i>Mẹo: Để xem hướng dẫn chi tiết và ví dụ của một lệnh cụ thể, hãy gõ <code>/help &lt;tên_lệnh&gt;</code> (VD: <code>/help search</code>)</i>`, { parse_mode: 'HTML' });
  });

  tgBot.command('backup', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    
    const waitMsg = await ctx.reply('⏳ Đang nén dữ liệu, vui lòng chờ...');
    
    try {
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip();
      
      const fs = await import('fs');
      const path = await import('path');
      const projectRoot = path.resolve(config.dataDir, '..');

      if (fs.existsSync(config.dataDir)) {
        zip.addLocalFolder(config.dataDir, 'data');
      }
      if (fs.existsSync(config.zalo.credentialsDir)) {
        zip.addLocalFolder(config.zalo.credentialsDir, 'sessions');
      }
      
      const aliasesPath = path.resolve(projectRoot, 'aliases.json');
      if (fs.existsSync(aliasesPath)) {
        zip.addLocalFile(aliasesPath);
      }
      
      const envPath = path.resolve(projectRoot, '.env');
      if (fs.existsSync(envPath)) {
        zip.addLocalFile(envPath);
      }
      
      const zipBuffer = zip.toBuffer();
      const filename = `zalo_tg_backup_${Date.now()}.zip`;
      
      await ctx.replyWithDocument({ source: zipBuffer, filename }, {
        caption: '✅ <b>Backup thành công!</b>\n\n⚠️ <b>CẢNH BÁO:</b> File này chứa toàn bộ token truy cập vào Zalo của bạn. Tuyệt đối không chia sẻ hoặc forward file này cho bất kỳ ai!',
        parse_mode: 'HTML'
      });
      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    } catch (err) {
      await ctx.reply(`❌ Lỗi khi backup: ${String(err)}`);
      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    }
  });

  tgBot.command('restore', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    
    const reply = 'reply_to_message' in ctx.message ? ctx.message.reply_to_message : undefined;
    if (!reply || !('document' in reply) || !reply.document) {
      await ctx.reply('❌ Vui lòng Reply (trả lời) lại tin nhắn chứa file backup (.zip) do bot gửi và gõ /restore');
      return;
    }
    
    const doc = reply.document;
    if (!doc.file_name?.endsWith('.zip')) {
      await ctx.reply('❌ File backup không hợp lệ (phải là file .zip)');
      return;
    }
    
    const waitMsg = await ctx.reply('⏳ Đang tải và khôi phục dữ liệu, bot sẽ tự khởi động lại sau khi hoàn tất...');
    
    try {
      const fileUrl = await ctx.telegram.getFileLink(doc.file_id);
      
      const axios = (await import('axios')).default;
      const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(buffer);
      
      // Lấy đường dẫn an toàn bằng cách tham chiếu thư mục cha của dataDir
      const path = await import('path');
      const projectRoot = path.resolve(config.dataDir, '..');
      
      // Trích xuất toàn bộ đè lên thư mục hiện tại
      zip.extractAllTo(projectRoot, true);
      
      await ctx.reply('✅ Đã khôi phục thành công! Đang khởi động lại Bot để nhận diện dữ liệu mới...');
      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
      
      // Delay một chút để tin nhắn chắc chắn được gửi đi trước khi tắt
      setTimeout(() => process.exit(0), 2000);
      
    } catch (err) {
      await ctx.reply(`❌ Lỗi khi khôi phục: ${String(err)}`);
      await ctx.deleteMessage(waitMsg.message_id).catch(() => {});
    }
  });

  tgBot.command('whitelistbot', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;
    const text = ctx.message.text ?? '';
    const parts = text.split(/\s+/);
    const cmd = parts[1];
    const targetId = Number(parts[2]);

    if (!cmd || cmd === 'list') {
      const bots = store.getWhitelistedBots();
      if (bots.length === 0) {
        await ctx.reply('🤖 Whitelist Bot đang trống.');
        return;
      }
      await ctx.reply(`🤖 <b>Danh sách Whitelist Bot:</b>\n` + bots.map(id => `- <code>${id}</code>`).join('\n'), { parse_mode: 'HTML' });
    } else if (cmd === 'add') {
      if (!targetId || isNaN(targetId)) {
        await ctx.reply('❌ Vui lòng cung cấp ID hợp lệ. Ví dụ: /whitelistbot add 123456789');
        return;
      }
      const added = store.addWhitelistedBot(targetId);
      if (added) {
        await ctx.reply(`✅ Đã thêm bot <code>${targetId}</code> vào Whitelist.`, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`ℹ️ Bot <code>${targetId}</code> đã có trong Whitelist từ trước.`, { parse_mode: 'HTML' });
      }
    } else if (cmd === 'remove') {
      if (!targetId || isNaN(targetId)) {
        await ctx.reply('❌ Vui lòng cung cấp ID hợp lệ. Ví dụ: /whitelistbot remove 123456789');
        return;
      }
      const removed = store.removeWhitelistedBot(targetId);
      if (removed) {
        await ctx.reply(`✅ Đã xóa bot <code>${targetId}</code> khỏi Whitelist.`, { parse_mode: 'HTML' });
      } else {
        await ctx.reply(`ℹ️ Bot <code>${targetId}</code> không có trong Whitelist.`, { parse_mode: 'HTML' });
      }
    } else {
      await ctx.reply('ℹ️ Cú pháp: /whitelistbot [list | add <id> | remove <id>]');
    }
  });

  tgBot.command('admin', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId) return;

    // /admin lookup — reply to a message to see its mapping
    const text = 'text' in ctx.message ? ctx.message.text ?? '' : '';
    const parts = text.split(/\s+/);
    if (parts.length >= 2 && parts[1] === 'lookup') {
      const reply = 'reply_to_message' in ctx.message
        ? (ctx.message as { reply_to_message?: { message_id: number } }).reply_to_message
        : undefined;
      if (!reply) {
        await ctx.reply('ℹ️ Reply vào tin nhắn muốn tra mapping rồi gõ /admin lookup');
        return;
      }
      const sent = sentMsgStore.get(reply.message_id);
      const quote = msgStore.getQuote(reply.message_id);
      const lines: string[] = [
        `🔍 <b>Mapping tgMsgId=${reply.message_id}</b>`,
        `━━━━━━━━━━━━━━━━`,
      ];
      if (sent) {
        lines.push(`📤 <b>sentMsgStore</b>`);
        lines.push(`   MsgIds: <code>[${sent.msgIds.join(', ')}]</code>`);
        lines.push(`   ZaloId: <code>${sent.zaloId}</code>`);
        lines.push(`   Type:   <code>${sent.threadType === 1 ? 'Group' : 'User'}</code>`);
      } else {
        lines.push(`📤 sentMsgStore: <i>không tìm thấy</i>`);
      }
      if (quote) {
        lines.push(`💬 <b>msgStore quote</b>`);
        lines.push(`   MsgId:    <code>${quote.msgId}</code>`);
        lines.push(`   CliMsgId: <code>${quote.cliMsgId}</code>`);
        lines.push(`   UidFrom:  <code>${quote.uidFrom}</code>`);
      } else {
        lines.push(`💬 msgStore quote: <i>không tìm thấy</i>`);
      }
      await ctx.reply(lines.join('\n'), {
        parse_mode: 'HTML',
        reply_markup: adminBackMarkup(),
      });
      return;
    } else if (parts.length >= 2 && parts[1] === 'migrate_names') {
      const all = store.all();
      let migrated = 0;
      const toMigrate: { topicId: number; oldName: string; newName: string }[] = [];

      // Collect topics that need renaming
      for (const entry of all) {
        if (!entry.accountId) continue;
        const alias = accountAliasStore.get(entry.accountId) || entry.accountId;
        const cleanName = entry.name.replace(/^\[.*?\]\s*/, '').replace(/^[👤👥]\s*/, '');
        const newName = `[${alias}] ` + topicName(cleanName, entry.type as 0 | 1);
        if (entry.name !== newName) {
          toMigrate.push({ topicId: entry.topicId, oldName: entry.name, newName });
        }
      }

      if (toMigrate.length === 0) {
        await ctx.reply('✅ Tất cả topics đều đã được cập nhật tên.');
        return;
      }

      const statusMsg = await ctx.reply(`🔄 Đang cập nhật tên cho ${toMigrate.length} topics. Vui lòng chờ...`);
      for (let i = 0; i < toMigrate.length; i++) {
        const item = toMigrate[i];
        try {
          await ctx.telegram.editForumTopic(config.telegram.groupId, item.topicId, { name: item.newName });
          store.updateName(item.topicId, item.newName);
          migrated++;
        } catch (err) {
          console.error(`[Admin] Migrate topic ${item.topicId} failed:`, err);
        }
        // Rate limit: 2 seconds per edit
        if (i < toMigrate.length - 1) await new Promise(r => setTimeout(r, 2000));
      }

      await ctx.telegram.editMessageText(
        config.telegram.groupId,
        statusMsg.message_id,
        undefined,
        `✅ Hoàn tất đổi tên ${migrated}/${toMigrate.length} topics.`
      );
      return;
    }

    const markup = {
      inline_keyboard: [
        [{ text: '📊 Trạng thái', callback_data: 'admin:status' }],
        [{ text: '🤖 Quản lý Whitelist Bot', callback_data: 'admin:whitelist:menu' }],
        [{ text: '🗄 Dung lượng cache', callback_data: 'admin:cache' }],
        [{ text: '🔍 Tra mapping', callback_data: 'admin:lookup' }],
        [{ text: '🔄 Cập nhật tiền tố tên topics', callback_data: 'admin:migrate_names' }],
        [{ text: '↩️ Đóng', callback_data: 'admin:close' }],
      ],
    };
    await ctx.reply(
      '🛠 <b>ADMIN PANEL</b>\nChọn một mục bên dưới:',
      { parse_mode: 'HTML', reply_markup: markup },
    );
  });

  tgBot.on('callback_query', async (ctx) => {
    const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined;

    if (data?.startsWith('lock_poll:')) {
      const pollId = Number(data.slice('lock_poll:'.length));
      const entry = pollStore.getByPollId(pollId);
      if (!entry) {
        await ctx.answerCbQuery('❌ Không tìm thấy bình chọn.');
        return;
      }
      const api = resolveApiForTopic(entry.tgThreadId);
      if (!api) {
        await ctx.answerCbQuery('❌ Không tìm thấy API cho bình chọn này.');
        return;
      }
      try {
        await doLockPoll(entry, api);
        await ctx.answerCbQuery('✅ Đã khoá bình chọn');
      } catch (err) {
        console.error('[TG→Zalo] lock_poll callback error:', err);
        try { await ctx.answerCbQuery('❌ Lỗi khoá bình chọn'); } catch { /* ignore */ }
      }
      return;
    }

    // ── lg: leave group confirm ──────────────────────────────────────────────
    if (data?.startsWith('lg:')) {
      if (data === 'lg:cancel') {
        await ctx.answerCbQuery('❌ Đã huỷ');
        await ctx.editMessageReplyMarkup(undefined);
        return;
      }
      const topicId = Number(data.slice(3));
      const entry = store.getEntryByTopic(topicId);
      const api = resolveApiForTopic(topicId);
      if (!entry || !api) {
        await ctx.answerCbQuery('❌ Không tìm thấy topic hoặc API');
        return;
      }
      try {
        await api.leaveGroup(entry.zaloId);
        store.remove(topicId);
        groupsCache.set([]);
        await ctx.answerCbQuery('✅ Đã rời nhóm');
        await ctx.editMessageReplyMarkup(undefined);
        // Đóng topic (close = archive, không xoá hẳn để còn lịch sử)
        await ctx.telegram.closeForumTopic(config.telegram.groupId, topicId)
          .catch(() => undefined);
        await ctx.telegram.sendMessage(
          config.telegram.groupId,
          `🚪 Đã rời nhóm <b>${entry.name}</b> và đóng topic.`,
          { message_thread_id: topicId, parse_mode: 'HTML' },
        ).catch(() => undefined);
      } catch (err) {
        console.error('[cb/lg]', err);
        await ctx.answerCbQuery('❌ Rời nhóm thất bại');
      }
      return;
    }

    // ── fr: accept/reject incoming friend request from Zalo ─────────────────
    if (data?.startsWith('fr:')) {
      const parts = data.split(':');
      const action = parts[1]; // 'accept' or 'reject'
      const accountId = parts[2];
      const fromUid = parts[3];
      const api = getAllZaloApis().get(accountId);
      
      if (!fromUid || !api) { await ctx.answerCbQuery('❌ Zalo chưa kết nối'); return; }
      try {
        if (action === 'accept') {
          await api.acceptFriendRequest(fromUid);
          await ctx.answerCbQuery('✅ Đã chấp nhận kết bạn!');
          await ctx.editMessageReplyMarkup(undefined);
          await ctx.editMessageText(
            (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
              ? ctx.callbackQuery.message.text ?? ''
              : '') + '\n\n✅ Đã chấp nhận',
            { parse_mode: 'HTML' },
          ).catch(() => undefined);
        } else {
          await api.rejectFriendRequest(fromUid);
          await ctx.answerCbQuery('✅ Đã từ chối');
          await ctx.editMessageReplyMarkup(undefined);
          await ctx.editMessageText(
            (ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
              ? ctx.callbackQuery.message.text ?? ''
              : '') + '\n\n❌ Đã từ chối',
            { parse_mode: 'HTML' },
          ).catch(() => undefined);
        }
      } catch (err) {
        console.error('[cb/fr]', err);
        await ctx.answerCbQuery('❌ Thao tác thất bại');
      }
      return;
    }

    // ── af: send friend request ──────────────────────────────────────────────
    if (data?.startsWith('af:')) {
      const parts = data.split(':');
      const accountId = parts[1];
      const userId = parts[2];
      const api = getAllZaloApis().get(accountId);
      
      if (!api) { await ctx.answerCbQuery('❌ Zalo chưa kết nối'); return; }
      try {
        await api.sendFriendRequest('Xin chào! Mình muốn kết bạn với bạn 😊', userId);
        await ctx.answerCbQuery('✅ Đã gửi lời mời kết bạn!');
        await ctx.editMessageReplyMarkup(undefined);
      } catch (err) {
        console.error('[cb/af]', err);
        await ctx.answerCbQuery('❌ Gửi lời mời thất bại');
      }
      return;
    }

    // ── frq_pg: friend requests pagination ────────────────────────────────────
    if (data?.startsWith('frq_pg:')) {
      const page = Number(data.slice(7));
      try {
        const { text, reply_markup } = await getFriendRequestsMessage(page);
        await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup,
        });
        await ctx.answerCbQuery();
      } catch (err) {
        console.error('[cb/frq_pg]', err);
        await ctx.answerCbQuery('❌ Lỗi tải trang');
      }
      return;
    }

    // ── afr: accept friend request ────────────────────────────────────────────
    if (data?.startsWith('afr:')) {
      const parts = data.split(':');
      const accountId = parts[1];
      const userId = parts[2];
      const api = getAllZaloApis().get(accountId);
      
      if (!api) { await ctx.answerCbQuery('❌ Zalo chưa kết nối'); return; }
      try {
        await api.acceptFriendRequest(userId);
        await ctx.answerCbQuery('✅ Đã chấp nhận lời mời kết bạn!');
        await ctx.editMessageReplyMarkup(undefined);
      } catch (err) {
        console.error('[cb/afr]', err);
        await ctx.answerCbQuery('❌ Không thể chấp nhận lời mời');
      }
      return;
    }

    // ── ufr: undo friend request ──────────────────────────────────────────────
    if (data?.startsWith('ufr:')) {
      const parts = data.split(':');
      const accountId = parts[1];
      const userId = parts[2];
      const api = getAllZaloApis().get(accountId);

      if (!api) { await ctx.answerCbQuery('❌ Zalo chưa kết nối'); return; }
      try {
        await api.undoFriendRequest(userId);
        await ctx.answerCbQuery('✅ Đã thu hồi lời mời kết bạn!');
      } catch (err) {
        console.error('[cb/ufr]', err);
        await ctx.answerCbQuery('❌ Không thể thu hồi lời mời');
      }
      return;
    }

    // ── gm: approve / reject group join request ──────────────────────────────
    if (data?.startsWith('gm:')) {
      const parts = data.split(':'); // gm:<action>:<accountId>:<groupId>:<uid>
      const action    = parts[1]; // 'approve' or 'reject'
      const accountId = parts[2];
      const groupId   = parts[3];
      const uid       = parts[4];
      const api = getAllZaloApis().get(accountId);
      
      if (!uid || !groupId || !api) { await ctx.answerCbQuery('❌ Zalo chưa kết nối'); return; }
      try {
        await api.reviewPendingMemberRequest(
          { members: [uid], isApprove: action === 'approve' },
          groupId,
        );
        const label = action === 'approve' ? '✅ Đã duyệt' : '❌ Đã từ chối';
        await ctx.answerCbQuery(label);
        await ctx.editMessageReplyMarkup(undefined);
        const prevText = ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message
          ? ctx.callbackQuery.message.text ?? ''
          : '';
        await ctx.editMessageText(
          prevText + `\n\n${label}`,
          { parse_mode: 'HTML' },
        ).catch(() => undefined);
      } catch (err) {
        console.error('[cb/gm]', err);
        await ctx.answerCbQuery('❌ Thao tác thất bại');
      }
      return;
    }

    // ── jgi: join group from invite box ─────────────────────────────────────
    if (data?.startsWith('jgi:')) {
      const parts = data.split(':');
      const accountId = parts[1];
      const groupId = parts[2];
      const api = getAllZaloApis().get(accountId);

      if (!api) { await ctx.answerCbQuery('❌ Zalo chưa kết nối'); return; }
      try {
        await api.joinGroupInviteBox(groupId);
        await ctx.answerCbQuery('✅ Đã tham gia nhóm!');
        await ctx.editMessageReplyMarkup(undefined);
        groupsCache.set([]);
      } catch (err) {
        const errCode = (err as { code?: number })?.code;
        console.error('[cb/jgi]', err);
        if (errCode === 240) {
          await ctx.answerCbQuery('⏳ Yêu cầu đã gửi — chờ admin duyệt');
        } else {
          await ctx.answerCbQuery('❌ Không thể tham gia nhóm');
        }
      }
      return;
    }

    // ── admin: admin panel callbacks ───────────────────────────────────────
    if (data?.startsWith('admin:')) {
      const action = data.slice(6);
      if (action === 'close') {
        await ctx.deleteMessage().catch(() => undefined);
        return;
      }
      if (action === 'migrate_names') {
        await ctx.answerCbQuery('ℹ️ Vui lòng gõ lệnh: /admin migrate_names', { show_alert: true });
        return;
      }
      if (action === 'menu') {
        const markup = {
          inline_keyboard: [
            [{ text: '📊 Trạng thái', callback_data: 'admin:status' }],
            [{ text: '🤖 Quản lý Whitelist Bot', callback_data: 'admin:whitelist:menu' }],
            [{ text: '🗄 Dung lượng cache', callback_data: 'admin:cache' }],
            [{ text: '🔍 Tra mapping', callback_data: 'admin:lookup' }],
            [{ text: '🔄 Cập nhật tiền tố tên topics', callback_data: 'admin:migrate_names' }],
            [{ text: '↩️ Đóng', callback_data: 'admin:close' }],
          ],
        };
        await ctx.editMessageText(
          '🛠 <b>ADMIN PANEL</b>\nChọn một mục bên dưới:',
          { parse_mode: 'HTML', reply_markup: markup },
        );
        return;
      }
      if (action === 'status') {
        const uptimeSec = Math.floor((Date.now() - _bridgeStartTime) / 1000);
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;
        const all = store.all();
        const topicStats = store.stats();
        const uptimeBar = '█'.repeat(Math.min(h, 24)) + '░'.repeat(Math.max(0, 24 - h));
        
        const allApis = getAllZaloApis();
        let zaloStatus = '';
        if (allApis.size === 0) {
          zaloStatus = '🔴 Chưa kết nối';
        } else {
          const lines: string[] = [];
          for (const [accId, api] of allApis.entries()) {
            try {
              const info = await api.fetchAccountInfo() as { profile?: { displayName?: string } };
              lines.push(`   🟢 ${escapeHtml(info?.profile?.displayName ?? accId)}`);
            } catch {
              const alias = accountAliasStore.get(accId) || accId;
              lines.push(`   🟡 ${escapeHtml(alias)} (không lấy được info)`);
            }
          }
          zaloStatus = lines.join('\n');
        }

        const text =
          `📊 <b>TRẠNG THÁI</b>\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `⏱ <b>Uptime</b>\n` +
          `   ${uptimeBar} <code>${h}g ${m}p ${s}s</code>\n` +
          `👥 <b>Zalo (${allApis.size})</b>\n` +
          `${zaloStatus}\n` +
          `📌 <b>Topics</b>\n` +
          `   Tổng: <b>${all.length}</b> | Nhóm: <code>${all.filter(e => e.type === 1).length}</code> | DM: <code>${all.filter(e => e.type === 0).length}</code>\n` +
          `💾 <b>Topic file</b>\n` +
          `   ${(topicStats.sizeBytes / 1024).toFixed(1)} KB`;
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: adminBackMarkup() });
        return;
      }
      if (action === 'cache') {
        const m = msgStore.stats();
        const uc = userCache.stats();
        const fc = friendsCache.stats();
        const gc = groupsCache.stats();
        const sm = sentMsgStore.stats();
        const rs = reactionSummaryStore.stats();
        const mPct = Math.round((m.cacheSize / 2000) * 100);
        const smPct = Math.round((sm.entries / 5000) * 100);
        const ucPct = Math.round((uc.users / 5000) * 100);
        const mBar = '█'.repeat(Math.min(Math.round(mPct / 5), 20)) + '░'.repeat(Math.max(0, 20 - Math.round(mPct / 5)));
        const text =
          `🗄 <b>DUNG LƯỢNG CACHE</b>\n` +
          `━━━━━━━━━━━━━━━━\n` +
          `📨 <b>msgStore</b>\n` +
          `   ${mBar} <code>${m.cacheSize}/2000</code> (${mPct}%)\n` +
          `   Keys: <code>${m.cacheSize}</code> | Order: <code>${m.keyOrderLen}</code> | Quotes: <code>${m.quoteCount}</code>\n` +
          `📤 <b>sentMsgStore</b>\n` +
          `   <code>${sm.entries}/5000</code> (${smPct}%)\n` +
          `👥 <b>userCache</b>\n` +
          `   <code>${uc.users}/5000</code> (${ucPct}%) | Groups: <code>${uc.groups}</code>\n` +
          `👫 <b>friendsCache</b>: <code>${fc.count}</code>\n` +
          `🏘 <b>groupsCache</b>: <code>${gc.count}</code>\n` +
          `❤️ <b>reactionSummaries</b>: <code>${rs.entries}</code>`;
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: adminBackMarkup() });
        return;
      }
      if (action === 'lookup') {
        await ctx.editMessageText(
          '🔍 <b>TRA MAPPING</b>\n' +
          '━━━━━━━━━━━━━━━━\n' +
          'Reply vào tin nhắn cần tra rồi gõ:\n' +
          '<code>/admin lookup</code>',
          { parse_mode: 'HTML', reply_markup: adminBackMarkup() },
        );
        return;
      }
      if (action === 'whitelist:menu') {
        const bots = store.getWhitelistedBots();
        const kb: import('telegraf/types').InlineKeyboardButton[][] = [];
        if (bots.length > 0) {
          for (const botId of bots) {
            kb.push([{ text: `❌ Xóa bot ${botId}`, callback_data: `admin:whitelist:remove:${botId}` }]);
          }
        }
        kb.push([{ text: '➕ Thêm Bot', callback_data: 'admin:whitelist:add' }]);
        kb.push([{ text: '◀️ Quay lại', callback_data: 'admin:menu' }]);
        
        const text = `🤖 <b>QUẢN LÝ WHITELIST BOT</b>\n━━━━━━━━━━━━━━━━\n` +
          `Các bot có trong danh sách này sẽ được phép gửi tin nhắn vào topic và đồng bộ sang Zalo.\n\n` +
          `Hiện có: <b>${bots.length}</b> bot.`;
        
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        return;
      }
      if (action === 'whitelist:add') {
        await ctx.editMessageText(
          '➕ <b>THÊM BOT VÀO WHITELIST</b>\n' +
          '━━━━━━━━━━━━━━━━\n' +
          'Để thêm bot, vui lòng dùng lệnh sau trong nhóm:\n' +
          '<code>/whitelistbot add <bot_id></code>',
          { parse_mode: 'HTML', reply_markup: adminBackMarkup() },
        );
        return;
      }
      if (action.startsWith('whitelist:remove:')) {
        const targetId = Number(action.split(':')[2]);
        store.removeWhitelistedBot(targetId);
        await ctx.answerCbQuery(`Đã xóa bot ${targetId}`);
        // Go back to whitelist menu
        const bots = store.getWhitelistedBots();
        const kb: import('telegraf/types').InlineKeyboardButton[][] = [];
        if (bots.length > 0) {
          for (const botId of bots) {
            kb.push([{ text: `❌ Xóa bot ${botId}`, callback_data: `admin:whitelist:remove:${botId}` }]);
          }
        }
        kb.push([{ text: '➕ Thêm Bot', callback_data: 'admin:whitelist:add' }]);
        kb.push([{ text: '◀️ Quay lại', callback_data: 'admin:menu' }]);
        
        const text = `🤖 <b>QUẢN LÝ WHITELIST BOT</b>\n━━━━━━━━━━━━━━━━\n` +
          `Các bot có trong danh sách này sẽ được phép gửi tin nhắn vào topic và đồng bộ sang Zalo.\n\n` +
          `Hiện có: <b>${bots.length}</b> bot.`;
        
        await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: { inline_keyboard: kb } });
        return;
      }
      return;
    }

    if (!data?.startsWith('sc:') && !data?.startsWith('sg:')) return;

    const isGroup = data.startsWith('sg:');
    const parts = data.split(':');
    if (parts.length < 3) {
      // Legacy callback without accountId, not supported anymore because we need accountId to create topic
      await ctx.answerCbQuery('❌ Nút bấm đã cũ, vui lòng dùng lệnh /search lại');
      return;
    }
    const accountId = parts[1];
    const entityId = parts.slice(2).join(':'); // handle possible colons in entityId, though unlikely
    
    if (!entityId || !accountId) { await ctx.answerCbQuery('❌ Dữ liệu không hợp lệ'); return; }
    const threadType: 0 | 1 = isGroup ? 1 : 0;

    // Check if topic already exists and is still alive on Telegram
    const existing = store.getTopicByZalo(accountId, entityId, threadType);
    if (existing !== undefined) {
      // Verify the topic still exists by sending a test (or use getForumTopicIconStickers as a proxy)
      // Verify the topic is still alive by actually sending a message to it.
      // sendChatAction doesn't validate thread existence — sendMessage does.
      let topicAlive = false;
      let probeMsg: { message_id: number } | undefined;
      try {
        probeMsg = await ctx.telegram.sendMessage(
          config.telegram.groupId,
          '💬 Topic đang hoạt động. Nhấn để xem.',
          {
            message_thread_id: existing,
            reply_markup: { inline_keyboard: [[{ text: 'Mở topic ↗', url: buildTopicUrl(existing) }]] },
          },
        );
        topicAlive = true;
      } catch (checkErr) {
        const checkMsg = checkErr instanceof Error ? checkErr.message : String(checkErr);
        if (
          checkMsg.includes('thread not found') ||
          checkMsg.includes('message thread not found') ||
          checkMsg.includes('TOPIC_CLOSED') ||
          checkMsg.includes('the message thread is closed')
        ) {
          console.warn(`[sc/sg] Topic ${existing} is gone — removing stale mapping for ${entityId}`);
          store.remove(existing);
        } else {
          // Unknown error (e.g. rate limit) — assume alive, don't recreate
          topicAlive = true;
        }
      }
      if (topicAlive) {
        await ctx.answerCbQuery('ℹ️ Topic đã tồn tại');
        return;
      }
      // Topic gone — fall through to recreate
    }

    // Resolve display name — for DMs: alias (tên danh bạ) takes priority
    let displayName: string | undefined;
    let displayNameSource = '';
    if (!isGroup) {
      // Check alias first
      displayName = aliasCache.get(entityId);
      if (displayName) displayNameSource = 'aliasCache';
      if (!displayName) {
        // Fallback: friendsCache, then getUserInfo
        displayName = friendsCache.get(entityId)?.displayName;
        if (displayName) displayNameSource = 'friendsCache';
      }
      if (!displayName) {
        try {
          const names = await appGetGroupMembersInfo([entityId]);
          displayName = names?.get(entityId)?.trim();
          if (displayName) {
            displayNameSource = 'app.getGroupMembersInfo';
            console.log(`[API][APP] getGroupMembersInfo uid=${entityId} source=search_cb_dm`);
          }
        } catch { /* ignore */ }
      }
      if (!displayName) {
        try {
          const profiles = await appGetFriendProfilesV2([entityId], {
            phonebookVersion: 0,
            language: 'vi',
            showOnlineStatus: false,
          });
          const p = profiles?.get(entityId);
          displayName = p?.displayName?.trim() || p?.zaloName?.trim();
          if (displayName) {
            displayNameSource = 'app.getFriendProfilesV2';
            console.log(`[API][APP] getFriendProfilesV2 uid=${entityId} source=search_cb_dm`);
          }
        } catch { /* ignore */ }
      }
      if (!displayName) {
        try {
          console.log(`[API][WEB] getUserInfo uid=${entityId} source=search_cb_dm fallback=app_empty`);
          const resp = await (existing ? resolveApiForTopic(existing)?.getUserInfo(entityId) : undefined) as {
            changed_profiles?: Record<string, { displayName?: string; zaloName?: string }>;
            unchanged_profiles?: Record<string, { displayName?: string; zaloName?: string }>;
          } | undefined;
          const uidKey = entityId.includes('_') ? entityId : `${entityId}_0`;
          const profile =
            resp?.changed_profiles?.[uidKey] ??
            resp?.changed_profiles?.[entityId] ??
            resp?.unchanged_profiles?.[uidKey] ??
            resp?.unchanged_profiles?.[entityId];
          displayName = profile?.displayName?.trim() || profile?.zaloName?.trim();
          if (displayName) {
            displayNameSource = 'web.getUserInfo';
            console.log(`[API][WEB] getUserInfo uid=${entityId} source=search_cb_dm resolved`);
          }
        } catch { /* ignore */ }
      }
      if (!displayName) {
        displayName = `Zalo ${entityId}`;
        displayNameSource = 'fallback.uid';
      }
      console.log(`[NameResolve][TG] uid=${entityId} source=${displayNameSource} name="${displayName}" context=search_cb_dm`);
    } else {
      displayName = groupsCache.search('', Number.MAX_SAFE_INTEGER).find(g => g.groupId === entityId)?.name;
      if (displayName) displayNameSource = 'groupsCache';
      if (!displayName) {
        try {
          const api = getAllZaloApis().get(accountId);
          const info = await api?.getGroupInfo(entityId) as {
            gridInfoMap?: Record<string, { name: string }>;
          } | undefined;
          displayName = info?.gridInfoMap?.[entityId]?.name;
          if (displayName) displayNameSource = 'web.getGroupInfo';
        } catch { /* ignore */ }
      }
      if (!displayName) {
        displayName = `Nhóm ${entityId}`;
        displayNameSource = 'fallback.groupId';
      }
      console.log(`[NameResolve][TG] groupId=${entityId} source=${displayNameSource} name="${displayName}" context=search_cb_group`);
    }

    // Create TG forum topic
    try {
      const alias = accountAliasStore.get(accountId) || accountId;
      const topicTitle = `[${alias}] ` + topicName(displayName, threadType);

      const topic = await ctx.telegram.createForumTopic(
        config.telegram.groupId,
        topicTitle.slice(0, 128),
        { icon_color: isGroup ? 0x6FB9F0 : 0xFF93B2 },
      );
      const topicId = topic.message_thread_id;
      store.set({ topicId, zaloId: entityId, type: threadType, name: topicTitle, accountId });
      console.log(`[search/cb] Created ${isGroup ? 'group' : 'DM'} topic "${topicTitle}" (topicId=${topicId})`);

      await ctx.answerCbQuery('✅ Đã tạo topic!');
      await ctx.telegram.sendMessage(
        config.telegram.groupId,
        isGroup
          ? `✅ Đã tạo topic cho nhóm <b>${displayName}</b>.\nTin nhắn từ nhóm sẽ xuất hiện tại đây.`
          : `✅ Đã tạo topic cho <b>${displayName}</b>.\nNhắn tin tại đây để chat với họ qua Zalo.`,
        { message_thread_id: topicId, parse_mode: 'HTML' },
      );
    } catch (err) {
      console.error('[search/cb] createForumTopic failed:', err);
      await ctx.answerCbQuery('❌ Tạo topic thất bại');
    }
  });

  // Bot phải là admin và allowed_updates phải có "message_reaction"
  tgBot.on('message_reaction', async (ctx) => {
    try {
      // Removed currentApi check because we resolve it later
      const update = ctx.messageReaction;
      if (!update) return;

      // Determine which reaction was added (new_reaction - old_reaction)
      type EmojiReaction = { type: 'emoji'; emoji: string };
      const isEmoji = (r: { type: string }): r is EmojiReaction => r.type === 'emoji';
      const oldEmojis = new Set(
        update.old_reaction
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter(r => isEmoji(r as any))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map(r => (r as any).emoji as string),
      );
      const added = update.new_reaction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter(r => isEmoji(r as any) && !oldEmojis.has((r as any).emoji as string));

      // If nothing was added (only removed), skip
      if (added.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tgEmoji = (added[0] as any).emoji as string;
      const tgMsgId = update.message_id;
      const actorId = String(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (update as any).user?.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ?? (update as any).actor_chat?.id
        ?? 'unknown',
      );
      const chatId = Number(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (update as any).chat?.id
        ?? ctx.chat?.id
        ?? 0,
      );

      if (reactionEventDedupeStore.isDuplicateTgOutbound({ chatId, messageId: tgMsgId, actorId, emoji: tgEmoji })) {
        console.log(`[TG→Zalo] Reaction: skip duplicate update chat=${chatId} msg=${tgMsgId} actor=${actorId} emoji=${tgEmoji}`);
        return;
      }

      // Map TG emoji → Zalo Reactions icon
      // Zalo Reactions enum values are the icon strings used in addReaction
      const TG_TO_ZALO: Record<string, string> = {
        '❤':  '/-heart',
        '❤️': '/-heart',
        '👍':  '/-strong',
        '👎':  '/-weak',
        '😄':  ':>',
        '😁':  ':>',
        '😢':  ':-((',
        '😭':  ':((',
        '😮':  ':o',
        '😱':  ':o',
        '😡':  ':-h',
        '🤬':  ':-h',
        '😘':  ':-*',
        '🥰':  ';xx',
        '😍':  ';xx',
        '🤣':  Reactions.TEARS_OF_JOY,
        '😂':  Reactions.TEARS_OF_JOY,
        '💩':  '/-shit',
        '🌹':  '/-rose',
        '💔':  '/-break',
        '😕':  ';-/',
        '🤔':  ';-/',
        '😉':  ';-)',
        '👌':  '/-ok',
        '✌️':  '/-v',
        '✌':  '/-v',
        '🙏':  '_()_',
        '👊':  '/-punch',
        '🤯':  ':o',
        '🎉':  '/-bd',
        '🏆':  '/-ok',
        '💯':  '/-ok',
        '😎':  'x-)',
        '🤩':  'x-)',
        '🔥':  '/-heart',
      };

      const zaloIcon = TG_TO_ZALO[tgEmoji];
      if (!zaloIcon) {
        console.log(`[TG→Zalo] Reaction: no Zalo map for TG emoji "${tgEmoji}"`);
        return;
      }

      // Look up Zalo quote data for this TG message
      const quote   = msgStore.getQuote(tgMsgId);
      if (!quote) {
        console.log(`[TG→Zalo] Reaction: no Zalo quote for TG msg ${tgMsgId}`);
        return;
      }

      const { ThreadType } = await import('zca-js');
      const zaloThreadType = quote.threadType === 1 ? ThreadType.Group : ThreadType.User;

      reactionEchoStore.mark(quote.zaloId, quote.msgId, zaloIcon);
      try {
        // Resolve API based on which account has the topic
        let targetApi = getAllZaloApis().values().next().value;
        for (const accId of getAllZaloApis().keys()) {
          if (store.getTopicByZalo(accId, quote.zaloId, quote.threadType) !== undefined) {
            targetApi = getAllZaloApis().get(accId);
            break;
          }
        }
        if (!targetApi) throw new Error('No API available');
        
        await targetApi.addReaction(
          zaloIcon as unknown as import('zca-js').Reactions,
          {
            data: { msgId: quote.msgId, cliMsgId: quote.cliMsgId },
            threadId: quote.zaloId,
            type: zaloThreadType,
          },
        );
      } catch (err) {
        reactionEchoStore.cancel(quote.zaloId, quote.msgId, zaloIcon);
        throw err;
      }
      console.log(`[TG→Zalo] Reaction "${tgEmoji}" → Zalo "${zaloIcon}" on msg ${quote.msgId}`);
    } catch (err) {
      console.error('[TG→Zalo] Reaction error:', err);
    }
  });

  /**
   * Look up Zalo quote data for a TG reply chain.
   * Tries msgStore first (for Zalo→TG and TG→Zalo text messages).
   * Only returns a quote if cliMsgId has been confirmed by the Zalo echo
   * (non-empty, non-"0") — otherwise Zalo rejects with code 114.
   */
  function getZaloQuote(tgMsgId: number | undefined): ZaloQuoteData | undefined {
    if (tgMsgId === undefined) return undefined;
    const fromMsgStore = msgStore.getQuote(tgMsgId);
    if (fromMsgStore) {
      // cliMsgId is empty/"0" while waiting for the Zalo echo to confirm it
      if (!fromMsgStore.cliMsgId || fromMsgStore.cliMsgId === '0') {
        console.log(`[TG→Zalo] getZaloQuote: found in msgStore but cliMsgId not yet confirmed (${fromMsgStore.cliMsgId}) — skipping quote for tgMsgId=${tgMsgId}`);
        return undefined;
      }
      console.log(`[TG→Zalo] getZaloQuote: found in msgStore for tgMsgId=${tgMsgId} msgId=${fromMsgStore.msgId} cliMsgId=${fromMsgStore.cliMsgId}`);
      return fromMsgStore;
    }
    console.log(`[TG→Zalo] getZaloQuote: no quote found for tgMsgId=${tgMsgId}`);
    return undefined;
  }

  tgBot.on('message', async (ctx) => {
    try {
      const msg = ctx.message;
      if (ctx.from?.is_bot && !store.isWhitelistedBot(ctx.from.id)) return;
      // Only handle messages from our bridge group
      if (ctx.chat.id !== config.telegram.groupId) return;

      // Must originate from a topic (all bridged conversations live in topics)
      const topicId =
        'message_thread_id' in msg ? (msg.message_thread_id as number | undefined) : undefined;
      if (!topicId) return;

      // Look up the corresponding Zalo conversation
      const entry = store.getEntryByTopic(topicId);
      if (!entry) {
        console.warn(`[TG→Zalo] No Zalo mapping for topicId=${topicId}`);
        return;
      }

      // Fetch the API for this account
      const api = resolveApiForTopic(topicId);

      // Zalo not connected yet
      if (!api) {
        console.warn('[TG→Zalo] API is null – Zalo not connected. Ignoring message.');
        return;
      }

      const { zaloId } = entry;
      // Ensure numeric value is correctly mapped to ThreadType enum at runtime
      const threadType: ThreadType = entry.type === 1 ? ThreadType.Group : ThreadType.User;

      // Helper: send TG error notification back to the same topic
      const notifyError = async (action: string, err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        const code = (err as { code?: number })?.code;
        console.error(`[TG→Zalo] ${action} failed (zaloId=${zaloId}, type=${threadType}):`, err);

        // Provide a friendlier explanation for common Zalo error codes
        let hint = '';
        if (code === 114) {
          hint = threadType === ThreadType.User
            ? '\n💡 <i>Zalo từ chối: chưa kết bạn hoặc người dùng đã bật giới hạn tin nhắn từ người lạ.</i>'
            : '\n💡 <i>Zalo từ chối tham số (code 114).</i>';
        } else if (code === -216) {
          hint = '\n💡 <i>Phiên đăng nhập Zalo hết hạn. Dùng /login để đăng nhập lại.</i>';
        }

        await tgBot.telegram
          .sendMessage(
            config.telegram.groupId,
            `⚠️ Gửi thất bại: <b>${action}</b>\n<code>${errMsg}${code != null ? ` (code ${code})` : ''}</code>${hint}`,
            { message_thread_id: topicId, parse_mode: 'HTML' },
          )
          .catch(() => undefined);
      };

      if ('text' in msg && msg.text) {
        // Skip bot commands that were already handled above
        if (msg.text.startsWith('/')) return;
        console.log(`[TG→Zalo] sendMessage → zaloId=${zaloId} type=${threadType} text="${msg.text.slice(0, 80)}"`);
        // Look up Zalo quote data if this TG message is a reply.
        // Tries msgStore (Zalo→TG) first, then sentMsgStore (TG→Zalo).
        const replyToMsgId = msg.reply_to_message?.message_id;
        const zaloQuote = getZaloQuote(replyToMsgId);

        const _rawTextMentions = resolveTgMentions(
          msg.text,
          ('entities' in msg ? msg.entities : undefined) as ReadonlyArray<TgEntity> | undefined,
          threadType === ThreadType.Group,
          threadType === ThreadType.Group ? zaloId : undefined,
        );

        // Auto-prepend @Name when replying to someone else's message in a group
        const _textAutoMention = buildReplyAutoMention(replyToMsgId, threadType);
        const finalText = _textAutoMention ? _textAutoMention.prefix + msg.text : msg.text;
        const zaloMentions = _textAutoMention
          ? [
              _textAutoMention.mention,
              ..._rawTextMentions.map(m => ({ ...m, pos: m.pos + _textAutoMention.prefix.length })),
            ]
          : _rawTextMentions;

        const accountId = entry.accountId || 'default';
        sentMsgStore.markSending(accountId, zaloId);
        try {
          const chunks = splitLongText(finalText);
          let firstResult: Awaited<ReturnType<typeof api.sendMessage>> | undefined;
          for (let ci = 0; ci < chunks.length; ci++) {
            const chunkText = chunks[ci]!;
            // Adjust mentions for this chunk's offset
            let chunkOffset = 0;
            for (let i = 0; i < ci; i++) chunkOffset += chunks[i]!.length;
            const chunkMentions = zaloMentions
              .filter(m => m.pos >= chunkOffset && m.pos < chunkOffset + chunkText.length)
              .map(m => ({ ...m, pos: m.pos - chunkOffset }));
            const useQuote = ci === 0 ? zaloQuote : undefined;
            const sendResult = await api.sendMessage(
              {
                msg: chunkText,
                ...(useQuote ? { quote: useQuote as any } : {}),
                ...(chunkMentions.length ? { mentions: chunkMentions } : {}),
              },
              zaloId,
              threadType,
            );
            if (ci === 0) firstResult = sendResult;
            // Space out chunks to avoid Zalo rate limiting
            if (ci < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
          }
          const zaloMsgId = firstResult?.message?.msgId;
          if (zaloMsgId !== undefined) {
            sentMsgStore.save(msg.message_id, { accountId, msgIds: [zaloMsgId], zaloId, threadType });
            const ownUid = String(api.getOwnId?.() ?? '');
            console.log(`[TG→Zalo] msgStore.save for tgMsgId=${msg.message_id} msgId=${zaloMsgId} ownUid=${ownUid}`);
            msgStore.save(accountId, msg.message_id, [String(zaloMsgId)], {
              msgId: String(zaloMsgId),
              cliMsgId: '',
              uidFrom: ownUid,
              ts: String(Math.floor(Date.now() / 1000)),
              msgType: 'webchat',
            content: (msg as any).text ?? '',
              ttl: 0,
              zaloId,
              threadType: entry.type,
            });
          }
        } catch (err) {
          await notifyError('sendMessage', err);
        } finally {
          sentMsgStore.unmarkSending(accountId, zaloId);
        }
        return;
      }

      // helper: download TG file → send via uploadAttachment → cleanup
      // Local server with --local flag supports up to 2 GB; official API caps at 20 MB
      const TG_FILE_LIMIT = config.telegram.localServer
        ? 2 * 1024 * 1024 * 1024  // 2 GB
        : 20 * 1024 * 1024;        // 20 MB
      const TG_FILE_LIMIT_LABEL = config.telegram.localServer ? '2 GB' : '20 MB';
      const notifyTooBig = async (filename: string, sizeBytes?: number) => {
        const sizeMb = sizeBytes ? ` (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)` : '';
        await notifyError(
          `sendAttachment(${filename})`,
          new Error(`File${sizeMb} vượt giới hạn ${TG_FILE_LIMIT_LABEL} của Telegram Bot API — không thể tải xuống`),
        );
      };

      const sendAttachment = async (
        fileId: string,
        filename: string,
        fileSize?: number,
        caption?: string,
        captionMentions?: Array<{ pos: number; uid: string; len: number }>,
      ) => {
        if (fileSize !== undefined && fileSize > TG_FILE_LIMIT) {
          await notifyTooBig(filename, fileSize);
          return;
        }
        // Pass Zalo quote if the TG message is a reply to a forwarded Zalo message
        const replyToMsgId = 'reply_to_message' in msg
          ? (msg as { reply_to_message?: { message_id: number } }).reply_to_message?.message_id
          : undefined;
        const zaloQuote = getZaloQuote(replyToMsgId);
        let fileLink: URL;
        try {
          fileLink = await ctx.telegram.getFileLink(fileId);
        } catch (err: unknown) {
          const msg2 = err instanceof Error ? err.message : String(err);
          if (msg2.includes('file is too big')) { await notifyTooBig(filename, fileSize); return; }
          // Local server cannot resolve file_ids created by the official API (e.g. old messages).
          // Fallback: query official Telegram API directly to get a download URL.
          if (config.telegram.localServer && (msg2.includes('wrong file_id') || msg2.includes('temporarily unavailable'))) {
            console.warn(`[TG→Zalo] Local server can't resolve file_id, falling back to official API: ${filename}`);
            try {
              const token = config.telegram.token;
              const res = await (await import('axios')).default.get(
                `https://api.telegram.org/bot${token}/getFile`,
                { params: { file_id: fileId }, timeout: 10_000 },
              );
              const filePath: string | undefined = res.data?.result?.file_path;
              if (!filePath) throw new Error('No file_path from official API');
              fileLink = new URL(`https://api.telegram.org/file/bot${token}/${filePath}`);
            } catch (fallbackErr) {
              console.error('[TG→Zalo] Official API fallback failed:', fallbackErr);
              await ctx.reply(`⚠️ Không thể tải file "${filename}". Hãy gửi lại file.`, { message_thread_id: topicId }).catch(() => {});
              return;
            }
          } else {
            throw err;
          }
        }
        const localPath = await downloadToTemp(fileLink.toString(), filename);
        const accountId = entry.accountId || 'default';
        sentMsgStore.markSending(accountId, zaloId);
        try {
          console.log(`[TG→Zalo] Sending ${filename} → zaloId=${zaloId} type=${threadType}`);

          // zca-js splits internally when msg is non-empty + quote is set:
          //   1) sends caption+quote as text (reply indicator in Zalo)
          //   2) sends attachment without quote
          // When no caption, skip the quote — adding a placeholder text just to
          // carry the quote would create visible noise in the conversation.
          const effectiveCaption = caption ?? '';

          let attachmentSource: AttachmentSource[] = [localPath];
          if (!['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4'].includes(path.extname(filename).slice(1).toLowerCase())) {
            const fileBuffer = await readFile(localPath);
            attachmentSource = [{
              data: fileBuffer,
              filename: filename as `${string}.${string}`,
              metadata: { totalSize: fileBuffer.length },
            }];
          }

          const sendResult = await api.sendMessage(
            {
              msg: effectiveCaption,
              attachments: attachmentSource,
              ...(effectiveCaption.length && zaloQuote ? { quote: zaloQuote as any } : {}),
              ...(captionMentions?.length ? { mentions: captionMentions } : {}),
            },
            zaloId,
            threadType,
          ).catch(async (err: unknown) => {
            // Code 114 with quote: quote data incompatible with this message type.
            // Retry without quote so the attachment still goes through.
            if ((err as { code?: number })?.code === 114) {
              console.warn('[TG→Zalo] code 114 on attachment+quote, retrying without quote');
              return api.sendMessage(
                {
                  msg: effectiveCaption,
                  attachments: attachmentSource,
                  ...(captionMentions?.length ? { mentions: captionMentions } : {}),
                },
                zaloId,
                threadType,
              );
            }
            throw err;
          }) as { message?: { msgId?: number } | null; attachment?: Array<{ msgId?: number }> };

          const zaloMsgId = sendResult?.message?.msgId ?? sendResult?.attachment?.[0]?.msgId;
          if (zaloMsgId !== undefined) {
          sentMsgStore.save(msg.message_id, { accountId, msgIds: [zaloMsgId], zaloId, threadType });
          const ownUid = String(api.getOwnId?.() ?? '');
          msgStore.save(accountId, msg.message_id, [String(zaloMsgId)], {
            msgId: String(zaloMsgId),
            cliMsgId: '',
            uidFrom: ownUid,
            ts: String(Math.floor(Date.now() / 1000)),
            msgType: 'webchat',
            content: caption ?? '',
            ttl: 0,
            zaloId,
            threadType: entry.type,
          });
        }
          console.log(`[TG→Zalo] Send OK: ${filename}`);
        } catch (err) {
          await notifyError(`sendAttachment(${filename})`, err);
        } finally {
          sentMsgStore.unmarkSending(accountId, zaloId);
          await cleanTemp(localPath);
        }
      };

      // Compute auto-mention once for this entire message (reply → prepend @Name)
      const _captionReplyMsgId = ('reply_to_message' in msg
        ? (msg as { reply_to_message?: { message_id: number } }).reply_to_message?.message_id
        : undefined);
      const _autoMentionForMedia = buildReplyAutoMention(_captionReplyMsgId, threadType);

      // Helper: extract caption + resolved mentions from any media message
      const getCaptionMentions = () => {
        const cap = ('caption' in msg ? (msg as { caption?: string }).caption : undefined);
        const capEntities = ('caption_entities' in msg
          ? (msg as { caption_entities?: ReadonlyArray<TgEntity> }).caption_entities
          : undefined);
        const rawMentions = cap
          ? resolveTgMentions(cap, capEntities, threadType === ThreadType.Group, threadType === ThreadType.Group ? zaloId : undefined)
          : [];
        if (_autoMentionForMedia) {
          const prefixLen = _autoMentionForMedia.prefix.length;
          const capMentions = [
            _autoMentionForMedia.mention,
            ...rawMentions.map(m => ({ ...m, pos: m.pos + prefixLen })),
          ];
          return {
            cap: cap ? _autoMentionForMedia.prefix + cap : _autoMentionForMedia.prefix.trimEnd(),
            capMentions,
          };
        }
        return { cap, capMentions: rawMentions.length ? rawMentions : undefined };
      };

      // Helper: flush a media group — download all files and send as single Zalo message
      const flushMediaGroup = async (
        items: import('../store.js').MediaGroupItem[],
        meta: { topicId: number; zaloId: string; threadType: 0 | 1; replyToMsgId?: number },
      ) => {
        const replyMsgId = meta.replyToMsgId;
        const zaloQuote = getZaloQuote(replyMsgId);
        const caption = items[0]?.caption ?? '';
        const capMentions = items[0]?.captionMentions;
        const localPaths: string[] = [];
        const downloadedTgIds: number[] = [];
        try {
          for (const item of items) {
            if ((item.fileSize ?? 0) > TG_FILE_LIMIT) continue;
            let fileLink: URL;
            try { fileLink = await tgBot.telegram.getFileLink(item.fileId); }
            catch { continue; }
            localPaths.push(await downloadToTemp(fileLink.toString(), item.fname));
            if (item.tgMsgId !== undefined) downloadedTgIds.push(item.tgMsgId);
          }
          if (localPaths.length === 0) return;
          const accountId = entry.accountId || 'default';
          sentMsgStore.markSending(accountId, meta.zaloId);
          try {
            const sendResult = await api.sendMessage(
              {
                msg: caption,
                attachments: localPaths,
                ...(zaloQuote ? { quote: zaloQuote as any } : {}),
                ...(capMentions?.length ? { mentions: capMentions } : {}),
              },
              meta.zaloId,
              meta.threadType === 1 ? ThreadType.Group : ThreadType.User,
            );
            const zaloMsgIds: (string | number)[] = [];
            if (sendResult?.message?.msgId != null) zaloMsgIds.push(sendResult.message.msgId);
            if (sendResult?.attachment) {
              for (const a of sendResult.attachment) {
                if (a.msgId != null) zaloMsgIds.push(a.msgId);
              }
            }
            if (zaloMsgIds.length > 0) {
              const ownUid = String(api.getOwnId?.() ?? '');
              const attStartIdx = sendResult?.message?.msgId != null ? 1 : 0;
              for (let i = 0; i < downloadedTgIds.length; i++) {
                const tgId = downloadedTgIds[i];
                const msgIdForItem = zaloMsgIds[Math.min(attStartIdx + i, zaloMsgIds.length - 1)] ?? zaloMsgIds[0] ?? '';
                sentMsgStore.save(tgId, { accountId, msgIds: zaloMsgIds, zaloId: meta.zaloId, threadType: meta.threadType });
                msgStore.save(accountId, tgId, [String(msgIdForItem)], {
                  msgId: String(msgIdForItem),
                  cliMsgId: '',
                  uidFrom: ownUid,
                  ts: String(Math.floor(Date.now() / 1000)),
                  msgType: 'webchat',
                  content: caption || 'Media group',
                  ttl: 0,
                  zaloId: meta.zaloId,
                  threadType: meta.threadType,
                });
              }
              console.log(`[TG→Zalo] Media group sent: ${localPaths.length} files, msgIds=[${zaloMsgIds}]`);
            }
          } finally {
            sentMsgStore.unmarkSending(accountId, meta.zaloId);
          }
        } catch (err) {
          console.error('[TG→Zalo] Media group send failed:', err);
          await notifyError('sendMediaGroup', err);
        } finally {
          for (const lp of localPaths) await cleanTemp(lp);
        }
      };

      // Capture api reference for closures (already defined above but re-alias for flush closure)
      const _api = api;

      if ('photo' in msg && msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1]!;
        const { cap, capMentions } = getCaptionMentions();
        const mediaGroupId = ('media_group_id' in msg ? (msg as { media_group_id?: string }).media_group_id : undefined);
        if (mediaGroupId) {
          const replyToMsgId = msg.reply_to_message?.message_id;
          mediaGroupStore.add(
            mediaGroupId,
            { fileId: photo.file_id, fname: 'photo.jpg', fileSize: photo.file_size, caption: cap, captionMentions: capMentions, tgMsgId: msg.message_id },
            { topicId, zaloId, threadType: entry.type, replyToMsgId },
            (items, meta) => { void flushMediaGroup(items, meta); },
          );
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          void _api; // keep reference
          return;
        }
        await sendAttachment(photo.file_id, 'photo.jpg', photo.file_size, cap, capMentions);
        return;
      }

      if ('animation' in msg && msg.animation) {
        const fname = msg.animation.file_name ?? 'animation.gif';
        const { cap, capMentions } = getCaptionMentions();
        await sendAttachment(msg.animation.file_id, fname, msg.animation.file_size, cap, capMentions);
        return;
      }

      if ('document' in msg && msg.document) {
        const doc   = msg.document;
        const fname = doc.file_name ?? `file_${Date.now()}.bin`;
        const { cap, capMentions } = getCaptionMentions();
        await sendAttachment(doc.file_id, fname, doc.file_size, cap, capMentions);
        return;
      }

      if ('video' in msg && msg.video) {
        const vid   = msg.video;
        const fname = vid.file_name?.endsWith('.mp4') ? vid.file_name : `video_${Date.now()}.mp4`;
        const { cap, capMentions } = getCaptionMentions();
        const mediaGroupId = ('media_group_id' in msg ? (msg as { media_group_id?: string }).media_group_id : undefined);
        if (mediaGroupId) {
          const replyToMsgId = msg.reply_to_message?.message_id;
          mediaGroupStore.add(
            mediaGroupId,
            { fileId: vid.file_id, fname, fileSize: vid.file_size, caption: cap, captionMentions: capMentions, tgMsgId: msg.message_id },
            { topicId, zaloId, threadType: entry.type, replyToMsgId },
            (items, meta) => { void flushMediaGroup(items, meta); },
          );
          return;
        }

        // Download video → upload to Zalo CDN → send as inline playable video
        if ((vid.file_size ?? 0) > TG_FILE_LIMIT) {
          await notifyTooBig(fname, vid.file_size);
          return;
        }
        let fileLink: URL;
        try { fileLink = await ctx.telegram.getFileLink(vid.file_id); }
        catch (err: unknown) {
          const isTooBig = err instanceof Error && err.message.includes('file is too big');
          if (isTooBig) { await notifyTooBig(fname, vid.file_size); return; }
          throw err;
        }
        const localVideoPath = await downloadToTemp(fileLink.toString(), fname);
        let localThumbPath: string | undefined;
        try {
          // Extract first frame as thumbnail
          try { localThumbPath = await extractVideoThumbnail(localVideoPath); } catch { /* no thumb */ }

          // Upload video to Zalo CDN
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const videoUploads: any[] = await api.uploadAttachment([localVideoPath], zaloId, threadType);
          const videoUpload = videoUploads?.find((r: { fileType?: string }) => r.fileType === 'video') as
            { fileUrl?: string } | undefined;

          if (!videoUpload?.fileUrl) {
            // Fallback: send as file attachment
            await sendAttachment(vid.file_id, fname, vid.file_size, cap, capMentions);
            return;
          }

          // Upload thumbnail image to Zalo CDN
          let thumbUrl = videoUpload.fileUrl; // worst-case: same URL (shows broken thumb but video works)
          if (localThumbPath) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const thumbUploads: any[] = await api.uploadAttachment([localThumbPath], zaloId, threadType);
              const tu = thumbUploads?.[0] as { normalUrl?: string } | undefined;
              if (tu?.normalUrl) thumbUrl = tu.normalUrl;
            } catch { /* keep fallback thumbUrl */ }
          }

          const accountId = entry.accountId || 'default';
          sentMsgStore.markSending(accountId, zaloId);
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = await (api.sendVideo as (...a: any[]) => Promise<{ msgId?: number }>)(
              {
                videoUrl:     videoUpload.fileUrl,
                thumbnailUrl: thumbUrl,
                width:        vid.width,
                height:       vid.height,
                duration:     (vid.duration ?? 0) * 1000,
                msg:          cap ?? '',
              },
              zaloId,
              threadType,
            );
            if (result?.msgId !== undefined) {
              sentMsgStore.save(msg.message_id, { accountId, msgIds: [result.msgId], zaloId, threadType });
              const ownUid = String(api.getOwnId?.() ?? '');
              msgStore.save(accountId, msg.message_id, [String(result.msgId)], {
                msgId: String(result.msgId),
                cliMsgId: '',
                uidFrom: ownUid,
                ts: String(Math.floor(Date.now() / 1000)),
                msgType: 'webchat',
                content: cap ?? '',
                ttl: 0,
                zaloId,
                threadType: entry.type,
              });
            }
          } finally {
            sentMsgStore.unmarkSending(accountId, zaloId);
          }
        } catch (err) {
          console.error('[TG→Zalo] sendVideo failed, fallback to attachment:', err);
          // Fallback: send as regular file
          try { await sendAttachment(vid.file_id, fname, vid.file_size, cap, capMentions); } catch { /* ignore */ }
        } finally {
          await cleanTemp(localVideoPath);
          if (localThumbPath) await cleanTemp(localThumbPath);
        }
        return;
      }

      if ('voice' in msg && msg.voice) {
        // Telegram voice notes are always small (<1 min OGG Opus), well under 20 MB
        if ((msg.voice.file_size ?? 0) > TG_FILE_LIMIT) {
          await notifyTooBig(`voice_${Date.now()}.ogg`, msg.voice.file_size);
          return;
        }
        // Download OGG from TG, convert to M4A, upload to Zalo, send as voice bubble
        let fileLink: URL;
        try { fileLink = await ctx.telegram.getFileLink(msg.voice.file_id); }
        catch (err: unknown) {
          const isTooBig = err instanceof Error && err.message.includes('file is too big');
          if (isTooBig) { await notifyTooBig(`voice_${Date.now()}.ogg`, msg.voice.file_size); return; }
          throw err;
        }
        const oggPath  = await downloadToTemp(fileLink.toString(), `voice_${Date.now()}.ogg`);
        let m4aPath: string | undefined;
        try {
          m4aPath = await convertToM4a(oggPath);
          // Upload to Zalo CDN to get a voiceUrl
          const uploaded = await api.uploadAttachment(m4aPath, zaloId, threadType) as Array<{ fileUrl?: string }>;
          const voiceUrl = uploaded[0]?.fileUrl;
          if (!voiceUrl) throw new Error('No fileUrl from uploadAttachment');
          console.log(`[TG→Zalo] Sending voice → ${voiceUrl}`);
          // Zalo mobile relies heavily on duration metadata for native voice UX.
          // Keep the value in milliseconds to match zca-js video/voice internals.
          const voiceDurationMs = Math.max(0, (msg.voice.duration ?? 0) * 1000);
          const voiceResult = await api.sendVoice(
            (voiceDurationMs > 0 ? { voiceUrl, duration: voiceDurationMs } : { voiceUrl }) as any,
            zaloId,
            threadType,
          ) as Record<string, unknown>;
          const voiceMsgId = voiceResult?.msgId ?? (voiceResult?.message as Record<string, unknown> | undefined)?.msgId;
          if (voiceMsgId != null && !Number.isNaN(Number(voiceMsgId))) {
            const accountId = entry.accountId || 'default';
            sentMsgStore.save(msg.message_id, { accountId, msgIds: [Number(voiceMsgId)], zaloId, threadType });
            const ownUid = String(api.getOwnId?.() ?? '');
            msgStore.save(accountId, msg.message_id, [String(voiceMsgId)], {
              msgId: String(voiceMsgId),
              cliMsgId: '',
              uidFrom: ownUid,
              ts: String(Math.floor(Date.now() / 1000)),
              msgType: 'webchat',
              content: '[Voice]',
              ttl: 0,
              zaloId,
              threadType: entry.type,
            });
          }
          console.log(`[TG→Zalo] Voice sent OK`);
        } catch (err) {
          console.error('[TG→Zalo] Voice convert/send failed, falling back to file:', err);
          await sendAttachment(msg.voice.file_id, `voice_${Date.now()}.ogg`);
        } finally {
          await cleanTemp(oggPath);
          if (m4aPath) await cleanTemp(m4aPath);
        }
        return;
      }

      if ('sticker' in msg && msg.sticker) {
        const sticker = msg.sticker;
        if (sticker.is_video) {
          // Video sticker (.webm) → convert to GIF so Zalo shows an animation
          let webmPath: string | null = null;
          let gifPath:  string | null = null;
          try {
            const fileLink = await ctx.telegram.getFileLink(sticker.file_id);
            webmPath = await downloadToTemp(fileLink.toString(), `sticker_${Date.now()}.webm`);
            gifPath  = await convertWebmToGif(webmPath);
            const accountId = entry.accountId || 'default';
            sentMsgStore.markSending(accountId, zaloId);
            try {
              const sendResult = await api.sendMessage(
                { msg: '', attachments: [gifPath] }, zaloId, threadType,
              ) as { message?: { msgId?: number } | null; attachment?: Array<{ msgId?: number }> };
              const zaloMsgId = sendResult?.message?.msgId ?? sendResult?.attachment?.[0]?.msgId;
              if (zaloMsgId !== undefined) {
                sentMsgStore.save(msg.message_id, { accountId, msgIds: [zaloMsgId], zaloId, threadType });
                const ownUid = String(api.getOwnId?.() ?? '');
                msgStore.save(accountId, msg.message_id, [String(zaloMsgId)], {
                  msgId: String(zaloMsgId),
                  cliMsgId: '',
                  uidFrom: ownUid,
                  ts: String(Math.floor(Date.now() / 1000)),
                  msgType: 'webchat',
                  content: '[Sticker]',
                  ttl: 0,
                  zaloId,
                  threadType: entry.type,
                });
              }
            } finally {
              sentMsgStore.unmarkSending(accountId, zaloId);
            }
          } catch (err) {
            console.error('[TG→Zalo] sticker webm→gif failed, falling back to thumbnail:', err);
            // Fallback: send jpg thumbnail
            const thumbId = sticker.thumbnail?.file_id;
            if (thumbId) await sendAttachment(thumbId, `sticker_${Date.now()}.jpg`);
          } finally {
            if (webmPath) await cleanTemp(webmPath);
            if (gifPath)  await cleanTemp(gifPath);
          }
        } else {
          // Animated sticker (.tgs/Lottie) → no lightweight converter, use jpg thumbnail
          // Static sticker (.webp) → send as-is
          const useThumb = sticker.is_animated && sticker.thumbnail;
          const fileId   = useThumb ? sticker.thumbnail!.file_id : sticker.file_id;
          const ext      = useThumb ? '.jpg' : '.webp';
          await sendAttachment(fileId, `sticker_${Date.now()}${ext}`);
        }
        return;
      }

      if ('poll' in msg && msg.poll) {
        const tgPoll = msg.poll;
        console.log(`[TG→Zalo] Received TG poll: id=${tgPoll.id} question="${tgPoll.question}" is_anonymous=${tgPoll.is_anonymous}`);

        if (threadType !== 1) {
          await ctx.reply('❌ Chỉ tạo bình chọn được trong nhóm Zalo.', { message_thread_id: topicId });
          return;
        }

        try {
          // 1. Create poll on Zalo
          const created = await api.createPoll(
            {
              question:         tgPoll.question,
              options:          tgPoll.options.map((o: { text: string }) => o.text),
              isAnonymous:      false,   // force non-anonymous so poll_answer fires
              allowMultiChoices: tgPoll.allows_multiple_answers ?? false,
            },
            zaloId,
          );
          console.log(`[TG→Zalo] Zalo poll created: pollId=${created?.poll_id}`);

          // 2. Bot re-creates the same poll on TG (non-anonymous so bot gets poll_answer)
          const botPollMsg = await tgBot.telegram.sendPoll(
            config.telegram.groupId,
            tgPoll.question,
            tgPoll.options.map((o: { text: string }) => o.text),
            {
              message_thread_id:       topicId,
              is_anonymous:            false,
              allows_multiple_answers: tgPoll.allows_multiple_answers ?? false,
            } as Parameters<typeof tgBot.telegram.sendPoll>[3],
          );
          const tgPollUUID = (botPollMsg as { poll?: { id?: string } }).poll?.id ?? '';
          console.log(`[TG→Zalo] Bot TG poll sent: msgId=${botPollMsg.message_id} uuid=${tgPollUUID}`);

          // 3. Build option list from Zalo response
          const zaloPollOptions = created?.options ?? tgPoll.options.map((o: { text: string }, i: number) => ({
            option_id: i, content: o.text, votes: 0,
          }));

          // 4. Send score message below bot's poll
          const scoreLines = zaloPollOptions.map((o: { content: string }) =>
            `${o.content}\n  ${'░'.repeat(10)} 0 phiếu (0%)`,
          );
          const scoreText = `📊 <b>Kết quả bình chọn</b>\n<i>(tạo từ Telegram)</i>\n\nTổng: 0 phiếu\n\n${scoreLines.join('\n\n')}`;
          const lockPollId = created?.poll_id ?? 0;
          const tgScoreMsg = await tgBot.telegram.sendMessage(
            config.telegram.groupId,
            scoreText,
            {
              message_thread_id: topicId,
              parse_mode: 'HTML',
              reply_parameters: { message_id: botPollMsg.message_id, allow_sending_without_reply: true },
              reply_markup: {
                inline_keyboard: [[
                  { text: '🔒 Khoá bình chọn', callback_data: `lock_poll:${lockPollId}` },
                ]],
              },
            },
          );

          // 5. Save to pollStore — keyed by both pollId and tgPollUUID
          if (created?.poll_id) {
            pollStore.save({
              pollId:           created.poll_id,
              zaloGroupId:      zaloId,
              tgPollMsgId:      botPollMsg.message_id,
              tgOrigPollMsgId:  msg.message_id,   // user's original poll
              tgPollUUID:       tgPollUUID,
              tgScoreMsgId:     tgScoreMsg.message_id,
              tgThreadId:       topicId,
              options: zaloPollOptions.map((o: { option_id?: number; content: string }, i: number) => ({
                option_id: o.option_id ?? i,
                content:   o.content,
              })),
            });
          }
        } catch (err) {
          console.error('[TG→Zalo] createPoll failed:', err);
          await tgBot.telegram.sendMessage(
            config.telegram.groupId,
            '❌ Không thể tạo bình chọn trên Zalo.',
            { message_thread_id: topicId },
          );
        }
        return;
      }

      if ('location' in msg && msg.location) {
        const { latitude, longitude } = msg.location;
        const venue = ('venue' in msg && msg.venue) ? (msg.venue as { title?: string; address?: string }) : undefined;
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const locationLabel = venue?.title
          ? `📍 ${venue.title}${venue.address ? ` — ${venue.address}` : ''}\n${mapsUrl}`
          : `📍 ${mapsUrl}`;
        const accountId = entry.accountId || 'default';
        sentMsgStore.markSending(accountId, zaloId);
        try {
          const result = await api.sendMessage({ msg: locationLabel }, zaloId, threadType) as { message?: { msgId?: number } };
          const zaloMsgId = result?.message?.msgId;
          if (zaloMsgId !== undefined) {
            sentMsgStore.save(msg.message_id, { accountId, msgIds: [zaloMsgId], zaloId, threadType });
            const ownUid = String(api.getOwnId?.() ?? '');
            msgStore.save(accountId, msg.message_id, [String(zaloMsgId)], {
              msgId: String(zaloMsgId),
              cliMsgId: '',
              uidFrom: ownUid,
              ts: String(Math.floor(Date.now() / 1000)),
              msgType: 'webchat',
              content: locationLabel,
              ttl: 0,
              zaloId,
              threadType: entry.type,
            });
          }
          console.log(`[TG→Zalo] Location sent: ${latitude},${longitude}`);
        } catch (err) {
          console.error('[TG→Zalo] Location send error:', err);
        } finally {
          sentMsgStore.unmarkSending(accountId, zaloId);
        }
        return;
      }

      if ('contact' in msg && msg.contact) {
        const contact = msg.contact as { phone_number: string; first_name: string; last_name?: string; user_id?: number };
        const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
        // Try to send via sendCard if we can resolve the Zalo UID from the phone number
        // Fall back to sending contact info as a plain text message
        let cardSent = false;
        if (contact.user_id) {
          // TG user_id is not Zalo UID, skip sendCard attempt
        }
        if (!cardSent) {
          const accountId = entry.accountId || 'default';
          sentMsgStore.markSending(accountId, zaloId);
          try {
            const result = await api.sendMessage({ msg: `👤 ${fullName} — ${contact.phone_number}` }, zaloId, threadType) as { message?: { msgId?: number } };
            const zaloMsgId = result?.message?.msgId;
            if (zaloMsgId !== undefined) {
              sentMsgStore.save(msg.message_id, { accountId, msgIds: [zaloMsgId], zaloId, threadType });
              const ownUid = String(api.getOwnId?.() ?? '');
              msgStore.save(accountId, msg.message_id, [String(zaloMsgId)], {
                msgId: String(zaloMsgId),
                cliMsgId: '',
                uidFrom: ownUid,
                ts: String(Math.floor(Date.now() / 1000)),
                msgType: 'webchat',
                content: `👤 ${fullName} — ${contact.phone_number}`,
                ttl: 0,
                zaloId,
                threadType: entry.type,
              });
            }
          } catch (err) {
            await notifyError('sendContact', err);
          } finally {
            sentMsgStore.unmarkSending(accountId, zaloId);
          }
        }
        return;
      }
    } catch (err) {
      console.error('[TG→Zalo] Error:', err);
    }
  });

  async function doLockPoll(entry: import('../store.js').PollEntry, api: ZaloAPI): Promise<void> {
    await api.lockPoll(entry.pollId);
    console.log(`[TG→Zalo] Locked Zalo poll ${entry.pollId}`);
    // Stop bot's clone TG poll
    try {
      await tgBot.telegram.stopPoll(config.telegram.groupId, entry.tgPollMsgId);
    } catch { /* already stopped or no permission */ }
    // Stop original user poll too (if we have its message_id)
    if (entry.tgOrigPollMsgId) {
      try {
        await tgBot.telegram.stopPoll(config.telegram.groupId, entry.tgOrigPollMsgId);
      } catch { /* no admin rights or already stopped */ }
    }
    // Update score message: show [Đã đóng], remove lock button
    try {
      const detail = await api.getPollDetail(entry.pollId);
      if (detail?.options) {
        const total = detail.options.reduce((s: number, o: { votes: number }) => s + (o.votes ?? 0), 0);
        const lines = (detail.options as Array<{ content: string; votes: number }>).map(o => {
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
          const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
          return `${o.content}\n  ${bar} ${o.votes} phiếu (${pct}%)`;
        });
        const scoreText = `📊 <b>Kết quả bình chọn <i>[Đã đóng]</i></b>\n\nTổng: ${total} phiếu\n\n${lines.join('\n\n')}`;
        try {
          await tgBot.telegram.editMessageText(
            config.telegram.groupId,
            entry.tgScoreMsgId,
            undefined,
            scoreText,
            { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
          );
        } catch { /* too old to edit */ }
      }
    } catch { /* non-fatal */ }
  }

  tgBot.on('poll', async (ctx) => {
    try {
      const poll = ctx.poll;
      if (!poll.is_closed) return;
      const entry = pollStore.getByTgPollUUID(poll.id);
      if (!entry) return;
      const api = resolveApiForTopic(entry.tgThreadId);
      if (!api) return;
      await doLockPoll(entry, api);
    } catch (err) {
      console.error('[TG→Zalo] lockPoll error:', err);
    }
  });

  tgBot.on('poll_answer', async (ctx) => {
    try {
      const answer = ctx.pollAnswer;
      // answer.option_ids: array of 0-based indices chosen in TG poll
      // answer.poll_id: TG internal poll ID (NOT the Zalo pollId)
      // We track by message_id via pollStore, but Telegraf poll_answer only has poll_id.
      // pollStore also indexes by tgPollMsgId. TG doesn't give us the message_id in poll_answer,
      // so we keep a secondary index by TG poll UUID in our store via a separate lookup.
      // Telegraf ctx.pollAnswer.poll_id is the TG poll identifier — we stored tgPollMsgId.
      // Workaround: iterate pollStore (small set) by checking tgPollUUID stored during creation.

      // Since we can only look up by tgPollMsgId but TG gives us poll_id (a string UUID),
      // we store the mapping tgPollUUID → pollId when the poll is sent.
      const tgPollUUID = answer.poll_id;
      console.log(`[TG→Zalo] poll_answer: poll_id=${tgPollUUID} option_ids=[${answer.option_ids}]`);
      const entry = pollStore.getByTgPollUUID(tgPollUUID);
      if (!entry) {
        console.log('[TG→Zalo] poll_answer: unknown poll UUID', tgPollUUID);
        return;
      }

      const api = resolveApiForTopic(entry.tgThreadId);
      if (!api) return;

      // Map TG 0-based option indices → Zalo option_ids
      const optionIds = answer.option_ids
        .map(idx => entry.options[idx]?.option_id)
        .filter((id): id is number => id !== undefined);

      // empty option_ids = user retracted vote — refresh score only, no Zalo call
      const refreshScore = async () => {
        try {
          const detail = await api.getPollDetail(entry.pollId);
          if (!detail?.options) return;
          const total = detail.options.reduce((s: number, o: { votes: number }) => s + (o.votes ?? 0), 0);
          const lines = (detail.options as Array<{ content: string; votes: number }>).map(o => {
            const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
            const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
            return `${o.content}\n  ${bar} ${o.votes} phiếu (${pct}%)`;
          });
          const status = detail.closed ? ' <i>[Đã đóng]</i>' : '';
          const scoreText = `📊 <b>Kết quả bình chọn${status}</b>\n\nTổng: ${total} phiếu\n\n${lines.join('\n\n')}`;
          const replyMarkup = detail.closed
            ? { inline_keyboard: [] as { text: string; callback_data: string }[][] }
            : { inline_keyboard: [[{ text: '🔒 Khoá bình chọn', callback_data: `lock_poll:${entry.pollId}` }]] };
          try {
            await tgBot.telegram.editMessageText(
              config.telegram.groupId,
              entry.tgScoreMsgId,
              undefined,
              scoreText,
              { parse_mode: 'HTML', reply_markup: replyMarkup },
            );
          } catch {
            const newMsg = await tgBot.telegram.sendMessage(
              config.telegram.groupId,
              scoreText,
              { message_thread_id: entry.tgThreadId, parse_mode: 'HTML',
                reply_parameters: { message_id: entry.tgPollMsgId, allow_sending_without_reply: true },
                reply_markup: replyMarkup },
            );
            pollStore.updateScoreMsg(entry.pollId, newMsg.message_id);
          }
        } catch (e) {
          console.warn('[TG→Zalo] poll score refresh failed:', e);
        }
      };

      if (optionIds.length === 0) {
        // Vote retracted — unvote on Zalo then refresh score
        try {
          await api.votePoll(entry.pollId, []);
          console.log(`[TG→Zalo] Unvoted poll ${entry.pollId}`);
        } catch (e) {
          console.warn('[TG→Zalo] unvote failed:', e);
        }
        await refreshScore();
        return;
      }

      // votePoll accepts single id or array
      await api.votePoll(entry.pollId, optionIds.length === 1 ? optionIds[0] : optionIds);
      console.log(`[TG→Zalo] Voted poll ${entry.pollId} options [${optionIds}]`);

      // Immediately refresh score message
      await refreshScore();
    } catch (err) {
      console.error('[TG→Zalo] poll_answer error:', err);
    }
  });

  return setCurrentApi;
}

// Called by setupTelegramHandler, but defined after so we can reference tgBot directly.

import { Telegraf } from 'telegraf';
export function setupSetAlias(bot: any) {
    // @ts-ignore
  bot.command('setalias', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId && ctx.chat.type !== 'private') return;
    const parts = ctx.message.text.split(' ');
    if (parts.length < 3) {
      await ctx.reply('Sử dụng: /setalias <accountId> <Tên bí danh | remove>\nVí dụ: /setalias 1508995969111268915 Đăng\nHoặc để xóa: /setalias 1508995969111268915 remove');
      return;
    }
    const accId = parts[1];
    const alias = parts.slice(2).join(' ').trim();
    import('../store.js').then(store => {
      if (alias.toLowerCase() === 'remove' || alias.toLowerCase() === 'delete' || alias.toLowerCase() === 'xoa') {
        store.accountAliasStore.remove(accId);
        ctx.reply(`✅ Đã xóa bí danh cho tài khoản ${accId}`);
      } else {
        store.accountAliasStore.set(accId, alias);
        ctx.reply(`✅ Đã đặt bí danh cho tài khoản ${accId} là: ${alias}\nGợi ý: Hãy chạy lệnh /sync_aliases để cập nhật tiền tố các nhóm.`);
      }
    });
  });

    // @ts-ignore
  bot.command('aliases', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId && ctx.chat.type !== 'private') return;
    import('../store.js').then(store => {
      const allAliases = store.accountAliasStore.getAll();
      const keys = Object.keys(allAliases);
      if (keys.length === 0) {
        ctx.reply('Không có tài khoản nào được đặt bí danh.');
        return;
      }
      let msg = '📋 <b>Danh sách bí danh (Aliases):</b>\n\n';
      for (const accId of keys) {
        msg += `- <code>${accId}</code> : <b>${allAliases[accId]}</b>\n`;
      }
      ctx.reply(msg, { parse_mode: 'HTML' });
    });
  });
}

export function setupSyncAliases(bot: any) {
    // @ts-ignore
  bot.command('sync_aliases', async (ctx) => {
    if (ctx.chat.id !== config.telegram.groupId && ctx.chat.type !== 'private') return;
    
    // Check if another sync is running (optional, but good practice)
    if ((globalThis as any)._isSyncingAliases) {
      await ctx.reply('⚠️ Tiến trình đồng bộ đang chạy, vui lòng đợi cho đến khi hoàn tất.');
      return;
    }
    
    import('../store.js').then(async (store) => {
      const allTopics = store.store.all();
      
      const topicsByAccount = new Map<string, typeof allTopics>();
      for (const entry of allTopics) {
        if (!entry.accountId) continue;
        if (!topicsByAccount.has(entry.accountId)) topicsByAccount.set(entry.accountId, []);
        topicsByAccount.get(entry.accountId)!.push(entry);
      }
      
      let renamedCount = 0;
      let skippedCount = 0;
      
      await ctx.reply(`Đang tiến hành kiểm tra và đồng bộ tên cho ${allTopics.length} topic...`);
      (globalThis as any)._isSyncingAliases = true;
      
      try {
        const { topicName } = await import('../utils/format.js');
        
        for (const [accountId, topics] of topicsByAccount.entries()) {
          const alias = store.accountAliasStore.get(accountId) || store.accountNameStore.get(accountId) || accountId;
          const prefix = `[${alias}] `;
          
          for (const entry of topics) {
            // Find the base name from store entry name, which might be just "DisplayName" or "[OldAlias] DisplayName"
            // To be safe, if we don't know the exact base name (since `entry.name` might already have an old prefix),
            let realName = entry.name;
            while (true) {
              const match = /^\[.*?\]\s*(👤 |👥 )?\s*(.*)$/.exec(realName);
              if (match) {
                realName = match[2];
              } else {
                break;
              }
            }
            
            // Reconstruct the correct name
            const nextName = prefix + topicName(realName, entry.type);
            
            // Because we don't have direct access to what Telegram currently stores (unless we fetch),
            // We just attempt to edit it. If it's already the same, Telegram API will ignore or return error.
            // To minimize API calls, if the stored name already strictly starts with our EXACT new prefix + icon, we skip.
            if (entry.name === nextName) {
              skippedCount++;
              continue;
            }
            
            try {
              await ctx.telegram.editForumTopic(config.telegram.groupId, entry.topicId, { name: nextName.slice(0, 128) });
              
              const logMsg = `🔄 Đã đổi: <code>${escapeHtml(entry.name)}</code> ➔ <b>${escapeHtml(nextName)}</b>`;
              store.store.updateName(entry.topicId, nextName);
              renamedCount++;
              
              // In ra ngay lập tức
              await ctx.reply(logMsg, { parse_mode: 'HTML' });
              
              // Delay 3 seconds to avoid flood wait for editForumTopic and sendMessage
              await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (err: any) {
              if (err.response?.error_code === 429) {
                const retryAfter = err.response.parameters?.retry_after || 5;
                console.warn(`[sync_aliases] Hit 429 Flood Wait, sleeping for ${retryAfter}s...`);
                await ctx.reply(`⚠️ Telegram yêu cầu đợi ${retryAfter} giây trước khi tiếp tục đổi tên...`).catch(() => {});
                await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                // We skip this topic and let it sync next time, or we could retry. For simplicity, just skip.
              }
              // Ignore topic deleted errors, etc.
              skippedCount++;
            }
          }
        }
        await ctx.reply(`✅ Hoàn tất đồng bộ!\n- Đổi tên: ${renamedCount} topic\n- Bỏ qua: ${skippedCount} topic`);
      } catch (e: any) {
        console.error('Error in sync_aliases:', e);
        await ctx.reply('❌ Có lỗi xảy ra trong quá trình đồng bộ: ' + e.message).catch(() => {});
      } finally {
        (globalThis as any)._isSyncingAliases = false;
      }
    });
  });
}
