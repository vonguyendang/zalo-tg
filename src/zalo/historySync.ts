/**
 * historySync.ts — Đồng bộ lịch sử tin nhắn nhóm Zalo → Telegram
 *
 * Sử dụng api.getGroupChatHistory() để lấy các tin nhắn cũ và forward
 * sang Telegram topic tương ứng. Mỗi tin cách nhau một khoảng delay
 * (config.zalo.historySyncDelayMs) để tránh bị Zalo rate-limit / ban.
 *
 * Chỉ hỗ trợ nhóm (group topics) vì zca-js không có API lấy lịch sử DM.
 */

import { createReadStream } from 'fs';
import path from 'path';

import type { ZaloAPI } from './types.js';
import { ZALO_MSG_TYPES } from './types.js';
import { tgBot } from '../telegram/bot.js';
import { config } from '../config.js';
import { msgStore, userCache, aliasCache, friendsCache, type ZaloQuoteData } from '../store.js';
import { downloadToTemp, cleanTemp } from '../utils/media.js';
import {
  applyZaloMarkupHtml,
  groupCaption,
  escapeHtml,
  truncate,
} from '../utils/format.js';
import type { ZaloStyle } from '../utils/format.js';
import { tgQueue } from '../utils/tgQueue.js';

// Proxy tg qua tgQueue (giống zalo/handler.ts)
const tg = new Proxy(tgBot.telegram, {
  get(target, prop: string) {
    const orig = (target as unknown as Record<string, unknown>)[prop];
    if (typeof orig !== 'function') return orig;
    return (...args: unknown[]) =>
      tgQueue(() => (orig as (...a: unknown[]) => Promise<unknown>).apply(target, args));
  },
}) as typeof tgBot.telegram;

// ── Types từ zca-js (GroupMessage.data) ──────────────────────────────────────

interface HistoryMsgData {
  msgId:      string;
  cliMsgId?:  string;
  realMsgId?: string;
  uidFrom:    string;
  dName?:     string;
  idTo:       string;
  ts:         string;
  msgType?:   string;
  content:    string | Record<string, unknown>;
  ttl?:       number;
  mentions?:  Array<{ uid: string; pos: number; len: number; type: 0 | 1 }>;
}

interface HistoryMsg {
  data:     HistoryMsgData;
  isSelf:   boolean;
  threadId: string;
}

type MediaContent = {
  href?:        string;
  thumb?:       string;
  title?:       string;
  description?: string;
  params?:      string;
  action?:      string;
  childnumber?: number;
  id?:          number;
  catId?:       number;
};

function parseContent(raw: string | Record<string, unknown>): {
  text: string | null;
  media: MediaContent;
} {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as MediaContent;
      return { text: null, media: parsed };
    } catch {
      return { text: raw, media: {} };
    }
  }
  return { text: null, media: raw as MediaContent };
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// Resolve display name: ưu tiên friendsCache/aliasCache/userCache
function resolveName(uid: string, dName?: string): string {
  const f = friendsCache.get(uid);
  if (f?.alias?.trim()) return f.alias.trim();
  if (f?.displayName?.trim()) return f.displayName.trim();
  const a = aliasCache.get(uid)?.trim();
  if (a) return a;
  const u = userCache.getName(uid)?.trim();
  if (u) return u;
  return dName?.trim() || uid;
}

// ── Gửi 1 tin nhắn lịch sử lên Telegram ─────────────────────────────────────

async function sendHistoryMsg(
  api: ZaloAPI,
  msg: HistoryMsg,
  topicId: number,
  groupId: string,
): Promise<void> {
  const msgType = msg.data.msgType ?? ZALO_MSG_TYPES.TEXT;
  const { text, media } = parseContent(msg.data.content);

  const ownUid = String(api.getOwnId?.() ?? '');
  const senderUid = msg.isSelf && ownUid ? ownUid : (msg.data.uidFrom ?? '');
  const senderName = msg.isSelf ? 'Bạn' : resolveName(senderUid, msg.data.dName);

  // Thời gian tin nhắn
  const tsNum = Number(msg.data.ts);
  const tsDate = isNaN(tsNum) ? new Date() : new Date(tsNum > 1e12 ? tsNum : tsNum * 1000);
  const timeStr = tsDate.toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const tgBase = { message_thread_id: topicId };

  // Danh sách zaloMsgIds để lưu vào msgStore
  const zaloMsgIds = [
    msg.data.msgId,
    ...(msg.data.realMsgId && msg.data.realMsgId !== msg.data.msgId ? [msg.data.realMsgId] : []),
    ...(msg.data.cliMsgId && msg.data.cliMsgId !== msg.data.msgId ? [msg.data.cliMsgId] : []),
  ];

  const zaloQuoteData: ZaloQuoteData = {
    msgId:      msg.data.msgId,
    cliMsgId:   msg.data.cliMsgId ?? '',
    uidFrom:    senderUid,
    ts:         msg.data.ts,
    msgType:    msgType,
    content:    text !== null
      ? (msg.data.content as string)
      : (media as Record<string, unknown>),
    ttl:        msg.data.ttl ?? 0,
    zaloId:     groupId,
    threadType: 1,
  };

  const saveTgMapping = (sent: { message_id: number }) => {
    msgStore.save(sent.message_id, zaloMsgIds, zaloQuoteData);
  };

  // Caption: hiển thị người gửi + thời gian
  const caption = `${groupCaption(senderName)} <i>${escapeHtml(timeStr)}</i>`;
  const tgOpts = { ...tgBase, parse_mode: 'HTML' as const, caption };

  // ── 1. Text ───────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.TEXT || text !== null) {
    let body = text
      ?? ((typeof msg.data.content === 'string' ? msg.data.content : '')
        || media.title || media.description || '');

    if (!body.trim() && typeof msg.data.content === 'object' && msg.data.content !== null) {
      body = JSON.stringify(msg.data.content);
    }
    if (!body.trim()) return;

    const mentions = msg.data.mentions;

    // Parse ZaloStyle (rich text)
    let styles: ZaloStyle[] | undefined;
    try {
      if (media.params) {
        const parsed = JSON.parse(media.params) as { styles?: ZaloStyle[] };
        if (Array.isArray(parsed.styles) && parsed.styles.length > 0) {
          styles = parsed.styles;
        }
      }
    } catch { /* ignore */ }

    const safeBody = truncate(body);
    const safeMentions = mentions
      ?.filter(m => m.pos < safeBody.length)
      .map(m => {
        const len = Math.min(m.len, safeBody.length - m.pos);
        const contactName = m.type === 0
          ? (friendsCache.get(m.uid)?.alias?.trim()
            || friendsCache.get(m.uid)?.displayName?.trim()
            || aliasCache.get(m.uid)?.trim())
          : undefined;
        return { ...m, len, label: contactName ? `@${contactName}` : undefined };
      });
    const safeStyles = styles
      ?.filter(s => s.start < safeBody.length)
      .map(s => ({ ...s, len: Math.min(s.len, safeBody.length - s.start) }));

    const bodyHtml = (safeMentions?.length || safeStyles?.length)
      ? applyZaloMarkupHtml(safeBody, safeMentions, safeStyles)
      : escapeHtml(safeBody);

    // formatGroupMsgHtml escapes senderName → build header manually with raw HTML
    const headerHtml = `<b>${escapeHtml(truncate(senderName, 64))}</b> <i>${escapeHtml(timeStr)}</i>`;
    const tgText = `${headerHtml}:\n${bodyHtml}`;
    const sent = await tg.sendMessage(
      config.telegram.groupId,
      tgText,
      { ...tgBase, parse_mode: 'HTML' },
    );
    saveTgMapping(sent);
    return;
  }

  // ── 2. Photo ──────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.PHOTO) {
    let url = media.href;
    if (media.params) {
      try {
        const p = JSON.parse(media.params) as { hd?: string };
        if (p.hd) url = p.hd;
      } catch { /* ignore */ }
    }
    if (!url) return;
    const localPath = await downloadToTemp(url, `hist_photo_${Date.now()}.jpg`);
    try {
      const sent = await tg.sendPhoto(config.telegram.groupId, { source: createReadStream(localPath) }, tgOpts);
      saveTgMapping(sent);
    } finally { await cleanTemp(localPath); }
    return;
  }

  // ── 3. GIF ────────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.GIF) {
    const url = media.href;
    if (!url) return;
    const ext = path.extname(url.split('?')[0] ?? '').toLowerCase() || '.mp4';
    const localPath = await downloadToTemp(url, `hist_gif_${Date.now()}${ext}`);
    try {
      const sent = await tg.sendAnimation(config.telegram.groupId, { source: createReadStream(localPath) }, tgOpts);
      saveTgMapping(sent);
    } finally { await cleanTemp(localPath); }
    return;
  }

  // ── 4. File ───────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.FILE) {
    const url = media.href;
    const fileName = media.title ?? `hist_file_${Date.now()}`;
    if (!url) return;
    const localPath = await downloadToTemp(url, fileName);
    try {
      const sent = await tg.sendDocument(config.telegram.groupId, { source: createReadStream(localPath), filename: fileName }, tgOpts);
      saveTgMapping(sent);
    } finally { await cleanTemp(localPath); }
    return;
  }

  // ── 5. Video ──────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.VIDEO) {
    const url = media.href;
    if (!url) return;
    const fileName = media.title?.trim() || `hist_video_${Date.now()}.mp4`;
    const localPath = await downloadToTemp(url, fileName);
    try {
      const sent = await tg.sendDocument(config.telegram.groupId, { source: createReadStream(localPath), filename: fileName }, tgOpts);
      saveTgMapping(sent);
    } finally { await cleanTemp(localPath); }
    return;
  }

  // ── 6. Voice ──────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.VOICE) {
    const url = media.href;
    if (!url) return;
    const ext = path.extname(url.split('?')[0] ?? '').toLowerCase() || '.m4a';
    const localPath = await downloadToTemp(url, `hist_voice_${Date.now()}${ext}`);
    try {
      const sent = await tg.sendVoice(config.telegram.groupId, { source: createReadStream(localPath) }, tgOpts);
      saveTgMapping(sent);
    } finally { await cleanTemp(localPath); }
    return;
  }

  // ── 7. Sticker ────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.STICKER) {
    const stickerId = media.id;
    if (!stickerId) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const details: any[] = await api.getStickersDetail([stickerId]);
      const detail = details?.[0];
      const url: string | undefined = detail?.stickerWebpUrl ?? detail?.stickerUrl ?? detail?.stickerSpriteUrl;
      if (!url) return;
      const ext = path.extname(url.split('?')[0] ?? '').toLowerCase() || '.webp';
      const localPath = await downloadToTemp(url, `hist_sticker_${Date.now()}${ext}`);
      try {
        const stream = createReadStream(localPath);
        try {
          const sent = await tg.sendSticker(
            config.telegram.groupId, { source: stream },
            tgBase as Parameters<typeof tg.sendSticker>[2],
          );
          saveTgMapping(sent);
        } catch {
          const stream2 = createReadStream(localPath);
          const sent = await tg.sendPhoto(config.telegram.groupId, { source: stream2 }, tgOpts);
          saveTgMapping(sent);
        }
      } finally { await cleanTemp(localPath); }
    } catch { /* ignore sticker errors */ }
    return;
  }

  // ── 8. Link ───────────────────────────────────────────────────────────────
  if (msgType === ZALO_MSG_TYPES.LINK) {
    if (media.action === 'recommened.misscall') {
      const sent = await tg.sendMessage(
        config.telegram.groupId,
        `${caption}\n📞 cuộc gọi nhỡ`,
        { ...tgBase, parse_mode: 'HTML' },
      );
      saveTgMapping(sent);
      return;
    }
    const href = media.href || '';
    const title = media.title || href;
    if (!href) return;
    const linkText = `${caption}\n<a href="${href}">${escapeHtml(title)}</a>`;
    const sent = await tg.sendMessage(config.telegram.groupId, linkText, {
      ...tgBase, parse_mode: 'HTML', link_preview_options: { is_disabled: false },
    });
    saveTgMapping(sent);
    return;
  }

  // ── Fallback: loại tin không xử lý được ──────────────────────────────────
  console.log(`[HistorySync] Skipping unsupported msgType="${msgType}" msgId=${msg.data.msgId}`);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface SyncGroupHistoryOptions {
  /** Số tin nhắn tối đa cần sync. Default: config.zalo.historySyncCount */
  count?: number;
  /** Delay (ms) giữa các tin. Default: config.zalo.historySyncDelayMs */
  delayMs?: number;
}

/**
 * Đồng bộ lịch sử tin nhắn nhóm Zalo sang Telegram topic.
 * Chỉ forward tin nhắn chưa có trong msgStore (tránh duplicate).
 * Messages cũ nhất ở cuối → reverse để forward theo thứ tự thời gian.
 *
 * @returns Số tin nhắn đã được forward thành công
 */
export async function syncGroupHistory(
  api: ZaloAPI,
  groupId: string,
  topicId: number,
  opts?: SyncGroupHistoryOptions,
): Promise<number> {
  const count   = opts?.count   ?? config.zalo.historySyncCount;
  const delayMs = opts?.delayMs ?? config.zalo.historySyncDelayMs;

  if (count <= 0) return 0;

  console.log(`[HistorySync] Starting sync for group=${groupId} topicId=${topicId} count=${count} delay=${delayMs}ms`);

  let history: { groupMsgs: HistoryMsg[] };
  try {
    history = await api.getGroupChatHistory(groupId, count) as { groupMsgs: HistoryMsg[] };
  } catch (err) {
    console.error(`[HistorySync] getGroupChatHistory failed for group=${groupId}:`, err);
    return 0;
  }

  const msgs = history?.groupMsgs;
  if (!Array.isArray(msgs) || msgs.length === 0) {
    console.log(`[HistorySync] No messages returned for group=${groupId}`);
    return 0;
  }

  // Sắp xếp tin nhắn theo thứ tự thời gian tăng dần (cũ nhất -> mới nhất)
  // và loại bỏ các tin trùng lặp (nếu API trả về trùng)
  const uniqueMsgs = new Map<string, typeof msgs[0]>();
  for (const m of msgs) {
    if (m.data?.msgId) uniqueMsgs.set(m.data.msgId, m);
  }
  const ordered = Array.from(uniqueMsgs.values()).sort((a, b) => Number(a.data?.ts || 0) - Number(b.data?.ts || 0));

  // Lọc tin đã có trong msgStore (đã được bridge forward rồi) hoặc đang in-flight
  const toSync = ordered.filter(m => {
    const ids = [m.data?.msgId, m.data?.realMsgId, m.data?.cliMsgId].filter(Boolean) as string[];
    if (ids.length === 0) return false;
    // Nếu có bất kỳ ID nào đã lưu hoặc đang xử lý, bỏ qua tin này
    return !ids.some(id => msgStore.getTgMsgId(id) !== undefined || msgStore.isInFlight(id));
  });

  if (toSync.length === 0) {
    console.log(`[HistorySync] All ${msgs.length} messages already synced for group=${groupId}`);
    return 0;
  }

  // Đánh dấu các tin sẽ sync là in-flight để tránh race condition (khi handler.ts nhận message đồng thời)
  for (const m of toSync) {
    const ids = [m.data?.msgId, m.data?.realMsgId, m.data?.cliMsgId].filter(Boolean) as string[];
    for (const id of ids) msgStore.markInFlight(id);
    // Tự động clear in-flight sau 60s phòng hờ lỗi crash khi gửi, để lần reconnect sau còn sync lại được
    setTimeout(() => {
      for (const id of ids) msgStore.unmarkInFlight(id);
    }, 60_000);
  }

  // Gửi header phân cách vào Telegram
  const headerCount = toSync.length;
  try {
    await tg.sendMessage(
      config.telegram.groupId,
      `<i>───── 📜 Lịch sử: ${headerCount} tin nhắn ─────</i>`,
      { message_thread_id: topicId, parse_mode: 'HTML' },
    );
  } catch { /* header not critical */ }

  let forwarded = 0;
  for (let i = 0; i < toSync.length; i++) {
    const msg = toSync[i]!;
    if (i > 0) await delay(delayMs);
    try {
      await sendHistoryMsg(api, msg, topicId, groupId);
      forwarded++;
    } catch (err) {
      console.warn(`[HistorySync] Failed to forward msgId=${msg.data?.msgId}:`, err);
    }
  }

  console.log(`[HistorySync] Done: forwarded ${forwarded}/${toSync.length} messages for group=${groupId}`);
  return forwarded;
}
