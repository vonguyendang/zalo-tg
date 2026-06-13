# Guide to creating Automator app (`zalo-bot-control.sh`)

<div align="center">
  <strong>English</strong> | <a href="HDSD%20file%20automation.md">Tiếng Việt</a>
</div>
<br>
<details>
  <summary><b>📖 Documentation Menu</b></summary>
  <ul>
    <li><a href="../README.md">Home (README)</a></li>
    <li><a href="../USER_GUIDE.md">User Guide</a></li>
    <li><a href="../LOCAL_BOT_API_SETUP.md">Local Bot API Setup</a></li>
    <li><a href="../DEPLOY_HOME_SERVER.md">Home Server Deployment</a></li>
    <li><a href="GUIDE%20automation.md">Mac Quick Start - Automator</a></li>
    <li><a href="GUIDE%20command.md">Mac Quick Start - Command</a></li>
  </ul>
</details>

---

Turn the `zalo-bot-control.sh` script into a **macOS app** in `/Applications` using Automator, allowing you to click it to show the bot control menu — no Terminal needed.

---

## Overview

| Component | Description |
|---|---|
| `Zalo Bot Control.app` | Automator app, stored at `/Applications` |
| `zalo-bot-control.sh` | The script running inside the app |
| `~/.zalo-bot-control/zalo-bot-run.sh` | Child script, created automatically when "Turn on bot" |
| `~/.zalo-bot-control/settings.conf` | Configuration file (log retention days, etc.) |
| `~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist` | LaunchAgent, auto-starts the bot after every login |
| `~/Library/Logs/zalo-bot-control/` | Directory containing all logs |

---

## Creating the Automator app

### Step 1 — Create new document

Open **Automator** (search in Spotlight or `/Applications/Automator.app`).

In the first window → choose **New Document** → select type **Application** → click **Choose**.

### Step 2 — Add Run Shell Script action

In the left search box, type `Run Shell Script`.

Drag the **Run Shell Script** action from the results column to the right workflow area.

### Step 3 — Configure action

In the newly added action:

- **Shell**: choose `/bin/bash`
- **Pass input**: choose `to stdin` (or `as arguments` is also fine)

### Step 4 — Paste script

Clear the default content in the script box, then paste the **entire content of the `zalo-bot-control.sh` file**.

> [!NOTE]
> The `export PATH=...` line at the beginning is required. Automator runs with a stripped-down `PATH`, without this line `npm`, `node`, `nc` will not be found.

### Step 5 — Test run

Click the **▶ Run** button in Automator. If a list dialog appears:

```
Bật bot / Tắt bot / Xem trạng thái / Mở log / Cấu hình xóa log / Xóa log ngay / Hướng dẫn
```

then the script is working correctly.

### Step 6 — Save as app

Click **File → Save** (or `⌘S`).

- **Save As**: `Zalo Bot Control`
- **Where**: `/Applications`
- **File Format**: Application *(default when creating an Application document)*

macOS will generate `Zalo Bot Control.app` in `/Applications`.

### Step 7 — First time opening the app

1. Open **Finder → Applications**.
2. Right-click on `Zalo Bot Control.app` → choose **Open**.
3. Click **Open** in the Gatekeeper warning dialog *(first time only)*.
4. Choose **Turn on bot (Bật bot)** to install LaunchAgent and start the bot.

---

## Control Menu

| Option | Effect |
|---|---|
| **Bật bot** (Turn on bot) | Clean old logs, build project, create LaunchAgent, start bot |
| **Tắt bot** (Turn off bot) | Stop bot and remove LaunchAgent |
| **Xem trạng thái** (View status) | Show ON / OFF status and log retention days |
| **Mở log** (Open logs) | Open log directory in Finder |
| **Cấu hình xóa log** (Config log cleanup) | Set days to auto-delete logs (0 = disable auto-delete) |
| **Xóa log ngay** (Clear logs now) | Immediately delete old logs based on current config |
| **Hướng dẫn** (Guide) | Show short description of options |

---

## Execution flow when selecting "Turn on bot"

```
click app → show menu
  → "Bật bot"
      → delete logs older than N days (by config)
      → git checkout dev
      → npm run build
      → run run-bot-api.sh (background)
      → wait for port 127.0.0.1:8081 to open (max 30s)
      → exec node dist/index.js
```

The bot will **auto-restart after every login** thanks to LaunchAgent.

---

## Auto-delete logs

### How it works

- Every time the bot **starts**, the script automatically deletes log files older than the configured number of days.
- Default: **7 days**.
- Configuration is stored at `~/.zalo-bot-control/settings.conf`.
- Cleanup history is written to `cleanup.log`.

### Set log retention days

1. Open app → select **Cấu hình xóa log**.
2. Enter the number of days to keep (e.g.: `14`).
3. Click **Lưu** (Save).

> Enter `0` to **completely disable** the auto-delete logs feature.

### Clear logs immediately

Select **Xóa log ngay** in the menu to clean old logs without restarting the bot.

### Configuration file

`~/.zalo-bot-control/settings.conf` looks like this:

```
LOG_RETENTION_DAYS=7
```

Can be edited manually with any text editor.

---

## View logs

Select **Mở log** in the app menu, or open manually:

```bash
open ~/Library/Logs/zalo-bot-control
```

| Log file | Content |
|---|---|
| `git.log` | Output of `git checkout dev` |
| `build.log` | Output of `npm run build` |
| `bot-api.log` | Output of `telegram-bot-api` |
| `app.log` | Standard output of `node dist/index.js` |
| `app.err.log` | Errors of `node dist/index.js` |
| `launchd.out.log` | Standard output from LaunchAgent |
| `launchd.err.log` | Errors from LaunchAgent |
| `cleanup.log` | History of auto-deleting old logs |

---

## Troubleshooting

### App opens but bot doesn't run

1. Go to **System Settings → Privacy & Security**.
2. Check permissions for **Automator** or `Zalo Bot Control.app`.
3. View `app.err.log` and `launchd.err.log` to find specific errors.

### `ECONNREFUSED` error when connecting bot API

> [!IMPORTANT]
> The script waits for port `127.0.0.1:8081`. If your Node.js code still calls `http://localhost:8081`, change it to `http://127.0.0.1:8081` to avoid IPv4/IPv6 mismatch.

### Full reset

```bash
# Uninstall LaunchAgent
launchctl bootout "gui/$(id -u)" ~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist

# Delete settings files
rm -rf ~/.zalo-bot-control
rm ~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist
```

Then reopen the app and select **Bật bot** to reinstall from scratch.
