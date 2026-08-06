/**
 * Rate-limit-aware concurrent queue for Telegram API calls.
 *
 * Allows up to CONCURRENCY calls in-flight simultaneously for low latency.
 * On 429 Too Many Requests: the failing call is re-queued after retry_after,
 * and all subsequent calls wait out the same pause window.
 */
import { execSync, spawn } from 'child_process';

interface QueueItem {
  fn: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject:  (e: unknown) => void;
  retries: number;
}

const MAX_RETRIES  = 5;
const CONCURRENCY_TEXT  = 8;   // moderate concurrency for text messages to avoid overloading telegram-bot-api
const CONCURRENCY_MEDIA = 5;   // lower concurrency for media (prevent heavy load)

const _textQueue: QueueItem[] = [];
const _mediaQueue: QueueItem[] = [];

let _activeText = 0;
let _activeMedia = 0;
let _pauseUntil = 0; // epoch ms — global back-off on 429 shared by both queues

function is429(err: unknown): number | null {
  if (
    err != null &&
    typeof err === 'object' &&
    'response' in err &&
    (err as { response: { error_code?: number; parameters?: { retry_after?: number } } })
      .response?.error_code === 429
  ) {
    return (
      (err as { response: { parameters?: { retry_after?: number } } })
        .response?.parameters?.retry_after ?? 30
    );
  }
  return null;
}

function scheduleNextText(): void {
  while (_activeText < CONCURRENCY_TEXT && _textQueue.length > 0) {
    const item = _textQueue.shift()!;
    _activeText++;
    void runOne(item, true);
  }
}

function scheduleNextMedia(): void {
  while (_activeMedia < CONCURRENCY_MEDIA && _mediaQueue.length > 0) {
    const item = _mediaQueue.shift()!;
    _activeMedia++;
    void runOne(item, false);
  }
}

async function runOne(item: QueueItem, isText: boolean): Promise<void> {
  try {
    // Honour the global pause window before firing
    const wait = _pauseUntil - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      // 10 minutes timeout to allow large file uploads (up to 2GB)
      timeoutId = setTimeout(() => reject(new Error('TG_API_TIMEOUT: Local bot API server hung')), 10000); // Reduce to 10 seconds for testing!
    });

    console.log(`[tgQueue] Starting execution. isText=${isText}`);
    const result = await Promise.race([item.fn(), timeoutPromise]);
    console.log(`[tgQueue] Execution finished successfully. isText=${isText}`);
    clearTimeout(timeoutId!);
    item.resolve(result);
  } catch (err) {
    console.log(`[tgQueue] Execution threw an error. isText=${isText}`, err);
    const retryAfter = is429(err);
    const isTimeout = err instanceof Error && (
      err.message.includes('TG_API_TIMEOUT') ||
      err.message.includes('socket hang up') ||
      err.message.includes('ECONNRESET') ||
      err.message.includes('ECONNREFUSED')
    );

    if (retryAfter !== null && item.retries < MAX_RETRIES) {
      const delay = (retryAfter + 1) * 1000;
      console.warn(`[TGQueue] 429 — retry #${item.retries + 1} after ${retryAfter}s (${isText ? 'text' : 'media'} queue)`);
      _pauseUntil = Math.max(_pauseUntil, Date.now() + delay);
      // Re-queue at the front so it goes next once the pause expires
      if (isText) {
        _textQueue.unshift({ ...item, retries: item.retries + 1 });
      } else {
        _mediaQueue.unshift({ ...item, retries: item.retries + 1 });
      }
    } else if (isTimeout && item.retries < MAX_RETRIES) {
      console.error(`[TGQueue] API timeout! Self-healing retry #${item.retries + 1}...`);
      try {
        if (item.retries >= 1) {
          console.error(`[TGQueue] API timeout persists! Wiping telegram-bot-api database...`);
          execSync('pkill -f telegram-bot-api || true');
          execSync('rm -rf /Users/dangvo/Projects/zalo-tg/data/bot-api/*');
        } else {
          console.error(`[TGQueue] API timeout! Killing telegram-bot-api to force restart...`);
          execSync('pkill -f telegram-bot-api || true');
        }
        console.error(`[TGQueue] Restarting telegram-bot-api...`);
        spawn('./run-bot-api.sh', { detached: true, stdio: 'ignore' }).unref();
      } catch (e) {
        console.error('[TGQueue] Self-healing command failed:', e);
      }
      
      const delay = 3000; // wait 3s for restart
      _pauseUntil = Math.max(_pauseUntil, Date.now() + delay);
      
      if (isText) {
        _textQueue.unshift({ ...item, retries: item.retries + 1 });
      } else {
        _mediaQueue.unshift({ ...item, retries: item.retries + 1 });
      }
    } else {
      item.reject(err);
    }
  } finally {
    console.log(`[tgQueue] Finally block executing. isText=${isText}`);
    if (isText) {
      _activeText--;
      scheduleNextText();
    } else {
      _activeMedia--;
      scheduleNextMedia();
    }
  }
}

/** Enqueue a Telegram API call to the text queue (fast, high concurrency). */
export function tgTextQueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    _textQueue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject, retries: 0 });
    scheduleNextText();
  });
}

/** Enqueue a Telegram API call to the media queue (slow, low concurrency). */
export function tgMediaQueue<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    _mediaQueue.push({ fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject, retries: 0 });
    scheduleNextMedia();
  });
}

/** 
 * Enqueue a realtime Telegram media call.
 * This bypasses the concurrency limit to ensure real-time messages 
 * aren't blocked by slow HistorySync background uploads.
 */
export function tgMediaQueueUrgent<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const item = { fn: fn as () => Promise<unknown>, resolve: resolve as (v: unknown) => void, reject, retries: 0 };
    _activeMedia++; // increment active media to track it, but force run immediately
    void runOne(item, false);
  });
}
