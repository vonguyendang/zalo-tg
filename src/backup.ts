import chokidar from 'chokidar';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import { tgBot } from './telegram/bot.js';
import { config } from './config.js';

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
  const zip = new AdmZip();
  const rootDir = process.cwd();

  const addTarget = (targetPath: string, zipPath: string) => {
    if (!fs.existsSync(targetPath)) return;
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      zip.addLocalFolder(targetPath, zipPath);
    } else {
      zip.addLocalFile(targetPath, path.dirname(zipPath) === '.' ? '' : path.dirname(zipPath));
    }
  };

  addTarget(path.resolve(rootDir, 'data'), 'data');
  addTarget(path.resolve(rootDir, 'sessions'), 'sessions');
  addTarget(path.resolve(rootDir, 'aliases.json'), 'aliases.json');
  addTarget(path.resolve(rootDir, '.env'), '.env');

  const buffer = zip.toBuffer();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${timestamp}.zip`;

  let caption = '📦 <b>Auto Backup</b>\n\nCác file cấu hình và dữ liệu (data, sessions, aliases.json, .env) đã có sự thay đổi.';
  if (changedFilesList.length > 0) {
    const listLimit = 15;
    const items = changedFilesList.slice(0, listLimit).map(f => `- <code>${f}</code>`);
    if (changedFilesList.length > listLimit) {
      items.push(`- ...và ${changedFilesList.length - listLimit} file khác`);
    }
    caption += `\n\n<b>Chi tiết thay đổi:</b>\n${items.join('\n')}`;
  }

  await tgBot.telegram.sendDocument(config.telegram.groupId, {
    source: buffer,
    filename: filename
  }, {
    caption: caption,
    parse_mode: 'HTML'
  });
  
  console.log(`[Backup] Backup sent to Telegram: ${filename}`);
}
