import chokidar from 'chokidar';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { tgBot } from './telegram/bot.js';
import { config } from './config.js';

const execAsync = util.promisify(exec);

let backupTimeout: NodeJS.Timeout | null = null;
const BACKUP_DELAY_MS = 60 * 1000; // 60 seconds debounce to avoid spam
const changedFiles = new Set<string>();

export function startBackupWatcher() {
  const rootDir = process.cwd();
  
  const watchTargets = [
    path.resolve(rootDir, 'data'),
    path.resolve(rootDir, 'sessions'),
    path.resolve(rootDir, 'aliases.json'),
    path.resolve(rootDir, '.env'),
  ];

  const watcher = chokidar.watch(watchTargets, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on('all', (event, filePath) => {
    // Ignore .zip files if any are generated in these folders
    if (filePath.endsWith('.zip')) return;
    
    // Ignore error-topic.txt from data to avoid cyclic backups if we write to it
    if (filePath.endsWith('error-topic.txt')) return;

    // Ignore cache files that change constantly with every message
    if (filePath.endsWith('msg-map.json.gz') || filePath.endsWith('msg-map.json')) return;
    if (filePath.endsWith('user-cache.json.gz') || filePath.endsWith('user-cache.json')) return;
    
    // Ignore temporary files used during safe writes
    if (filePath.endsWith('.tmp')) return;

    // Ignore local telegram bot API server database (changes continuously)
    if (filePath.includes('/bot-api/') || filePath.includes('\\bot-api\\')) return;

    const relativePath = path.relative(rootDir, filePath);
    changedFiles.add(relativePath);

    if (backupTimeout) {
      clearTimeout(backupTimeout);
    }
    
    backupTimeout = setTimeout(() => {
      const filesToReport = Array.from(changedFiles);
      changedFiles.clear();
      
      performBackup(filesToReport).catch(err => {
        console.error('[Backup] Backup failed:', err);
      });
    }, BACKUP_DELAY_MS);
  });
  
  console.log('[Backup] Started watching data, sessions, aliases.json, .env for changes');

  // Also run a scheduled periodic backup every 3 days to capture the latest caches
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  setInterval(() => {
    performBackup(['[Scheduled 3-day Auto Backup]']).catch(err => {
      console.error('[Backup] Scheduled backup failed:', err);
    });
  }, THREE_DAYS_MS);
}

async function performBackup(changedFilesList: string[]) {
  console.log(`[Backup] Changes detected (${changedFilesList.length} files), creating backup archive...`);
  const rootDir = process.cwd();

  const backupDir = path.resolve(rootDir, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.zip`;
  const backupPath = path.join(backupDir, filename);
  
  try {
    const excludes = '-x "data/bot-api.bak/*" "data/bot-api.bak" "data/bot-api/*" "data/bot-api" "data/backups/*" "backups/*"';
    const command = `zip -q -r "${backupPath}" data sessions aliases.json .env ${excludes}`;
    await execAsync(command, { cwd: rootDir });
  } catch (err) {
    console.error('[Backup] Failed to create zip archive:', err);
    return;
  }

  let caption = '📦 <b>Auto Backup</b>\n\nCác file cấu hình và dữ liệu (data, sessions, aliases.json, .env) đã có sự thay đổi.';
  if (changedFilesList.length > 0) {
    const listLimit = 15;
    const items = changedFilesList.slice(0, listLimit).map(f => `- <code>${f}</code>`);
    if (changedFilesList.length > listLimit) {
      items.push(`- ...và ${changedFilesList.length - listLimit} file khác`);
    }
    caption += `\n\n<b>Chi tiết thay đổi:</b>\n${items.join('\n')}`;
  }

  try {
    await tgBot.telegram.sendDocument(config.telegram.groupId, 'file://' + backupPath, {
      caption: caption,
      parse_mode: 'HTML'
    });
    console.log(`[Backup] Backup sent to Telegram: ${filename}`);
  } catch (err) {
    console.error('[Backup] Failed to send backup to Telegram:', err);
  }
  
  // Cleanup old backups (keep last 3)
  try {
    const files = fs.readdirSync(backupDir)
      .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
      .sort()
      .reverse();
    for (let i = 3; i < files.length; i++) {
      fs.unlinkSync(path.join(backupDir, files[i]));
    }
  } catch (e) {
    console.error('[Backup] Failed to cleanup old backups:', e);
  }
}
