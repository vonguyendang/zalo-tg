import axios from 'axios';
import { createWriteStream, mkdirSync, copyFileSync } from 'fs';
import { readFile, stat, unlink, writeFile, rmdir, rm } from 'fs/promises';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { gunzipSync } from 'zlib';
import path from 'path';
import { imageSizeFromFile } from 'image-size/fromFile';
import { createSharedTempPath, getSharedTempDir } from './sharedTemp.js';

// Local Bot API reads outgoing files from a shared host/container path.
// Use a permission-safe resolver instead of the historical fixed /tmp/zalo-tg
// directory, which can be left root-owned on Docker bind mounts.
const TMP_DIR = getSharedTempDir('zalo-tg');

function uniqueTempName(prefix: string, extension: string): string {
  return createSharedTempPath('zalo-tg', prefix, extension);
}

/** Keep readable Unicode filenames, but remove path/control chars unsafe on disk. */
export function sanitizeFileName(fileName: string, fallback = `download_${Date.now()}`): string {
  const cleaned = fileName
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

/** Download a remote URL to a temp file. Returns the local file path.
 *  When using a local Telegram Bot API server (--local flag), getFileLink()
 *  returns a file:// URL pointing to the server's working directory.
 *  In that case we copy the file directly instead of downloading via HTTP.
 */
export async function downloadToTemp(url: string, fileName?: string, retries = 3): Promise<string> {
  if (!Number.isInteger(retries) || retries < 1) {
    throw new Error('retries must be an integer >= 1');
  }
  mkdirSync(TMP_DIR, { recursive: true });

  // Local Bot API server returns file:// paths — copy directly, no HTTP needed
  if (url.startsWith('file:')) {
    const srcPath = fileURLToPath(url);
    const baseName = sanitizeFileName(fileName ?? path.basename(srcPath));
    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const destDir = path.join(TMP_DIR, uid);
    mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, baseName);
    try {
      copyFileSync(srcPath, destPath);
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
      if (code === 'ENOENT') {
        throw new Error(
          `Local Bot API file is not visible to the bridge: ${srcPath}. `
          + 'Mount TELEGRAM_WORK_DIR at the same absolute path in both processes.',
          { cause: err },
        );
      }
      throw err;
    }
    // The source belongs to telegram-bot-api's cache. Never delete it here;
    // cleanTemp() only removes the bridge-owned destination copy.
    return destPath;
  }

  // Sanitize filename and add a unique prefix so concurrent downloads
  // with the same logical name (e.g. multiple 'photo.jpg' in a media group)
  // do not overwrite each other.
  const baseName = sanitizeFileName(fileName ?? `download_${Date.now()}`);

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 500ms, 1500ms, ...
      await new Promise(r => setTimeout(r, 500 * attempt * attempt));
    }

    const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const destDir = path.join(TMP_DIR, uid);
    mkdirSync(destDir, { recursive: true });
    const filePath = path.join(destDir, baseName);
    try {
      const resp = await axios.get<NodeJS.ReadableStream>(url, {
        responseType: 'stream',
        timeout: 30_000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ZaloTGBridge/1.0)' },
      });

      await new Promise<void>((resolve, reject) => {
        const writer = createWriteStream(filePath);
        
        let streamTimeout: NodeJS.Timeout | undefined;
        const resetStreamTimeout = () => {
          if (streamTimeout) clearTimeout(streamTimeout);
          streamTimeout = setTimeout(() => {
            (resp.data as any).destroy(); // Abort the incoming stream
            reject(new Error('Stream stalled during download'));
          }, 30_000);
        };
        
        resetStreamTimeout(); // Start timeout immediately in case no data is ever sent
        resp.data.on('data', resetStreamTimeout);
        resp.data.on('error', (err) => {
          if (streamTimeout) clearTimeout(streamTimeout);
          reject(err);
        });

        resp.data.pipe(writer);
        writer.on('finish', () => {
          if (streamTimeout) clearTimeout(streamTimeout);
          resolve();
        });
        writer.on('error', (err) => {
          if (streamTimeout) clearTimeout(streamTimeout);
          reject(err);
        });
        
        resetStreamTimeout();
      });

      const { size } = await stat(filePath);
      if (size === 0) {
        await unlink(filePath).catch(() => undefined);
        lastErr = new Error(`Downloaded file is empty: ${url}`);
        continue;
      }

      return filePath;
    } catch (err) {
      await unlink(filePath).catch(() => undefined);
      lastErr = err;
    }
  }

  throw lastErr;
}

/**
 * Download the first working URL in priority order.
 *
 * Zalo photo messages can carry an HD URL, a normal URL and a thumbnail. The
 * CDN does not always keep those variants alive for the same amount of time,
 * so a dead HD URL must not make the whole message disappear.
 */
export async function downloadToTempFromCandidates(
  urls: readonly string[],
  fileName?: string,
  retries = 3,
): Promise<string> {
  const candidates = Array.from(new Set(urls.map(url => url.trim()).filter(Boolean)));
  if (candidates.length === 0) throw new Error('No media URL candidates were provided');

  const errors: unknown[] = [];
  for (const url of candidates) {
    try {
      return await downloadToTemp(url, fileName, retries);
    } catch (err) {
      errors.push(err);
    }
  }

  throw new AggregateError(errors, `Failed to download media from ${candidates.length} URL candidate(s)`);
}

/** Remove a temp file, ignoring errors. */
export async function cleanTemp(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
    const dir = path.dirname(filePath);
    if (dir !== TMP_DIR) {
      await rmdir(dir).catch(() => undefined);
    }
  } catch { /* ignore */ }
}

/** Split Telegram album payloads without ever producing an invalid >10 batch. */
export function telegramMediaBatches<T>(items: T[], maxBatchSize = 10): T[][] {
  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 2) {
    throw new Error('maxBatchSize must be an integer >= 2');
  }
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += maxBatchSize) {
    batches.push(items.slice(i, i + maxBatchSize));
  }
  return batches;
}

export interface SpriteSheetLayout {
  frames: number;
  frameWidth: number;
  frameHeight: number;
  direction: 'horizontal' | 'vertical';
}

/** Resolve equally sized frames from a Zalo sticker sprite sheet. */
export function getSpriteSheetLayout(
  width: number,
  height: number,
  declaredFrames = 0,
): SpriteSheetLayout {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Sprite dimensions must be positive integers');
  }

  const requested = Number.isInteger(declaredFrames) && declaredFrames > 1
    ? declaredFrames
    : 0;
  if (requested > 1 && width % requested === 0) {
    return { frames: requested, frameWidth: width / requested, frameHeight: height, direction: 'horizontal' };
  }
  if (requested > 1 && height % requested === 0) {
    return { frames: requested, frameWidth: width, frameHeight: height / requested, direction: 'vertical' };
  }

  // Zalo currently serves square frames in one horizontal strip. Keep a
  // vertical inference as a defensive fallback for older sticker packs.
  if (width > height && width % height === 0) {
    return { frames: width / height, frameWidth: height, frameHeight: height, direction: 'horizontal' };
  }
  if (height > width && height % width === 0) {
    return { frames: height / width, frameWidth: width, frameHeight: width, direction: 'vertical' };
  }
  return { frames: 1, frameWidth: width, frameHeight: height, direction: 'horizontal' };
}

/** Convert a Zalo PNG/WebP sprite strip into a Telegram-compatible WebM (with transparency). */
export async function convertSpriteSheetToWebm(
  inputPath: string,
  declaredFrames: number,
  frameDurationMs: number,
): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  
  const image = await loadImage(inputPath);
  if (!image.width || !image.height) throw new Error('Cannot read sticker sprite dimensions');
  const layout = getSpriteSheetLayout(image.width, image.height, declaredFrames);
  if (layout.frames < 2) throw new Error('Sticker sprite does not contain multiple frames');

  const duration = Number.isFinite(frameDurationMs)
    ? Math.min(1_000, Math.max(20, frameDurationMs))
    : 100;
  const fps = Math.round(1000 / duration);

  const outputPath = uniqueTempName('zalo_sticker', '.webm');
  const frameDir = uniqueTempName('frames_', '');
  mkdirSync(frameDir);

  const canvas = createCanvas(layout.frameWidth, layout.frameHeight);
  const ctx = canvas.getContext('2d');
  try {
    for (let frame = 0; frame < layout.frames; frame++) {
      ctx.clearRect(0, 0, layout.frameWidth, layout.frameHeight);
      let sx = 0, sy = 0;
      if (layout.direction === 'horizontal') sx = frame * layout.frameWidth;
      else sy = frame * layout.frameHeight;
      ctx.drawImage(image, sx, sy, layout.frameWidth, layout.frameHeight, 0, 0, layout.frameWidth, layout.frameHeight);
      const pngBuffer = await canvas.encode('png');
      await writeFile(`${frameDir}/${frame.toString().padStart(3, '0')}.png`, pngBuffer);
    }

    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y', '-framerate', String(fps),
        '-i', `${frameDir}/%03d.png`,
        '-vf', "scale='if(gt(iw/ih,1),512,-1)':'if(gt(iw/ih,1),-1,512)'",
        '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p',
        '-auto-alt-ref', '0', '-b:v', '500k',
        '-t', '3.0',
        outputPath
      ]);
      ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg webm exit ${code}`)));
      ff.on('error', reject);
    });

    return outputPath;
  } finally {
    await rm(frameDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Convert an audio file to OGG OPUS using ffmpeg.
 * Returns the path to the converted file (caller must clean it up).
 */
export async function convertToOgg(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = uniqueTempName('voice', '.ogg');
  await new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on',
      '-vn', outputPath,
    ]);
    let stderr = '';
    ff.stderr?.on('data', chunk => { stderr += String(chunk).slice(-2_000); });
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg ogg conversion exit ${code}: ${stderr.trim().slice(-500)}`)));
    ff.on('error', reject);
  });
  return outputPath;
}

/**
 * Convert an audio file to mp3 using ffmpeg.
 * Returns the path to the converted file (caller must clean it up).
 */
export async function convertToMp3(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = uniqueTempName('voice', '.mp3');
  await new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-c:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', '-ar', '44100',
      '-vn', outputPath,
    ]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    ff.on('error', reject);
  });
  return outputPath;
}

/**
 * Convert a WebM video (e.g. Telegram video sticker) to GIF using ffmpeg.
 * Returns the path to the output GIF (caller must clean it up).
 */
export async function convertWebmToGif(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = uniqueTempName('sticker', '.gif');
  // Two-pass palette preserves the original frame rate, Telegram's full
  // 512px sticker resolution and transparent pixels.
  const palettePass = uniqueTempName('palette', '.png');
  try {
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y', '-i', inputPath,
        '-vf', 'scale=min(256\\,iw):-2:flags=lanczos,format=rgba,palettegen=stats_mode=diff:reserve_transparent=1',
        palettePass,
      ]);
      ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg palettegen exit ${code}`)));
      ff.on('error', reject);
    });
    await new Promise<void>((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y', '-i', inputPath, '-i', palettePass,
        '-lavfi', 'scale=min(256\\,iw):-2:flags=lanczos,format=rgba[x];[x][1:v]paletteuse=dither=sierra2_4a:alpha_threshold=128',
        outputPath,
      ]);
      ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg paletteuse exit ${code}`)));
      ff.on('error', reject);
    });
  } finally {
    await unlink(palettePass).catch(() => undefined);
  }
  return outputPath;
}

/** Convert a Telegram static WebP sticker to a lossless transparent PNG. */
export async function convertStickerToPng(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const { createCanvas, loadImage } = await import('@napi-rs/canvas');
  const image = await loadImage(inputPath);
  if (!image.width || !image.height) throw new Error('Cannot read static sticker dimensions');
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, image.width, image.height);
  ctx.drawImage(image, 0, 0, image.width, image.height);
  const outputPath = uniqueTempName('telegram_sticker', '.png');
  await writeFile(outputPath, canvas.toBuffer('image/png'));
  return outputPath;
}

/** Render Telegram's gzip-compressed Lottie/TGS sticker to a GIF via Python lottie library. */
export async function convertTgsToGif(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = uniqueTempName('telegram_sticker', '.gif');

  // Use Python lottie library (correctly renders TGS stickers unlike @napi-rs/canvas)
  const pyScript = `
import sys, os
from lottie.parsers.tgs import parse_tgs
from lottie.exporters.gif import export_gif
anim = parse_tgs(sys.argv[1])
# skip_frames=2 halves render time while keeping smooth enough animation
export_gif(anim, sys.argv[2], skip_frames=2)
`.trim();

  await new Promise<void>((resolve, reject) => {
    const ff = spawn('python3', ['-c', pyScript, inputPath, outputPath]);
    let stderr = '';
    ff.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    ff.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`python3 lottie tgs→gif exit ${code}: ${stderr.slice(0, 500)}`));
    });
    ff.on('error', reject);
  });

  return outputPath;
}

/**
 * Extract the first frame of a video as a JPEG thumbnail.
 * Returns the path to the thumbnail file (caller must clean it up).
 */

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv']);

/** Guess media type from filename or URL. */
export function detectMediaType(fileNameOrUrl: string): 'image' | 'video' | 'document' {
  const lower = fileNameOrUrl.toLowerCase();
  // Query strings and fragments are URL metadata, not part of the filename.
  // Strip both before asking path.extname() so `clip.webm#t=3` is detected.
  const pathname = lower.split(/[?#]/, 1)[0] ?? '';
  const ext = path.extname(pathname);
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (/\.(jpg|jpeg|png|gif|webp)(?:[?#]|$)/.test(lower)) return 'image';
  if (/\.(mp4|mov|avi|mkv|webm)(?:[?#]|$)/.test(lower))  return 'video';
  return 'document';
}

export async function convertAnimatedToMp4(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = createSharedTempPath('zalo-tg', 'sticker_', '.mp4');
  await new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      // pad to even dimensions (required by yuv420p) and ensure opaque output
      '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2:color=white,format=yuv420p',
      '-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p',
      '-r', '30', '-movflags', '+faststart',
      outputPath,
    ]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg animated to mp4 exit ${code}`)));
    ff.on('error', reject);
  });
  return outputPath;
}


export async function extractVideoThumbnail(videoPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const thumbPath = createSharedTempPath('zalo-tg', 'thumb_', '.jpg');
  await new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      thumbPath,
    ]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg thumbnail exit ${code}`)));
    ff.on('error', reject);
  });
  return thumbPath;
}

/** Convert a downloaded static image to a WebP sticker (max 512x512). */
export async function convertImageToWebpSticker(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = createSharedTempPath('zalo-tg', 'tg_sticker_', '.webp');
  await new Promise<void>((resolve, reject) => {
    // scale to fit within 512x512, keeping aspect ratio
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-vcodec', 'libwebp',
      '-vf', "scale='if(gt(iw,ih),512,-1)':'if(gt(iw,ih),-1,512)'",
      outputPath,
    ]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg image to webp exit ${code}`)));
    ff.on('error', reject);
  });
  return outputPath;
}

/** Convert a Zalo MP4 video back to a WebM video sticker (VP9, max 512x512, max 3 seconds, no audio). */
export async function convertMp4ToWebmSticker(inputPath: string): Promise<string> {
  mkdirSync(TMP_DIR, { recursive: true });
  const outputPath = createSharedTempPath('zalo-tg', 'tg_sticker_', '.webm');
  await new Promise<void>((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-c:v', 'libvpx-vp9',
      '-vf', "scale='if(gt(iw,ih),512,-1)':'if(gt(iw,ih),-1,512)'",
      '-pix_fmt', 'yuva420p',
      '-b:v', '250k',
      '-t', '2.9', // strict 3s limit for TG stickers
      '-an',       // strict no audio
      outputPath,
    ]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg mp4 to webm exit ${code}`)));
    ff.on('error', reject);
  });
  return outputPath;
}
