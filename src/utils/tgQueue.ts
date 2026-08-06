/**
 * Rate-limit-aware concurrent queue for Telegram API calls.
 *
 * Allows up to CONCURRENCY calls in-flight simultaneously for low latency.
 * On 429 Too Many Requests: the failing call is re-queued after retry_after,
 * and all subsequent calls wait out the same pause window.
 */

interface QueueItem {
  fn: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject:  (e: unknown) => void;
  retries: number;
}

const MAX_RETRIES  = 5;
const CONCURRENCY_TEXT  = 15;  // higher concurrency for text messages
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

    const result = await item.fn();
    item.resolve(result);
  } catch (err) {
    const retryAfter = is429(err);
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
    } else {
      item.reject(err);
    }
  } finally {
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
