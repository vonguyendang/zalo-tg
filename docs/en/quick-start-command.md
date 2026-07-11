# Guide to using `zalo-bot-onefile.command`

<div align="center">
  <strong>English</strong> | <a href="../vi/quick-start-command.md">Tiếng Việt</a>
</div>
<br>
<details>
  <summary><b>📖 Documentation Menu</b></summary>
  <ul>
    <li><a href="../../README.md">🏠 Home (README)</a></li>
    <li><a href="../../docs/en/user-guide.md">📖 Basic User Guide</a></li>
    <br>
    <b>🍎 For Mac Users (macOS)</b>
    <li><a href="../../docs/en/quick-start-automation.md">Install via Automator (Zalo Bot Control)</a></li>
    <li><a href="../../docs/en/quick-start-command.md">Install via Command</a></li>
    <li><a href="../../docs/en/clamshell-mode-setup.md">Mac 24/7 Clamshell Mode Setup</a></li>
    <br>
    <b>🪟 For Windows Users</b>
    <li><a href="../../docs/en/quick-start-windows.md">Windows Setup (Native & WSL)</a></li>
    <br>
    <b>📱 For Mobile Devices</b>
    <li><a href="../../docs/en/quick-start-android.md">Android Setup (via Termux)</a></li>
    <br>
    <b>⚙️ For Servers & Advanced Users</b>
    <li><a href="../../docs/en/deploy-home-server.md">Deploy on Linux VPS / Home Server</a></li>
    <li><a href="../../docs/en/local-bot-api-setup.md">Local Bot API Setup (2GB Large Files)</a></li>
  </ul>
</details>

---

The `.command` file is a **one-touch** way to launch the bot on macOS — double-click to show the control menu, no Terminal needed.

---

## Overview

| Component | Description |
|---|---|
| `zalo-bot-onefile.command` | Main script, double-click to run |
| `~/.zalo-bot-control/zalo-bot-run.sh` | Child script, created automatically when "Turn on bot" |
| `~/.zalo-bot-control/settings.conf` | Configuration file (log retention days, etc.) |
| `~/Library/LaunchAgents/com.edwardfranklin.zalo-bot.plist` | LaunchAgent, auto-starts the bot after every login |
| `~/Library/Logs/zalo-bot-control/` | Directory containing all logs |

---

## Initial Setup

### Step 1 — Copy file to Applications

```bash
cp /Users/dangvo/Projects/zalo-tg/quick-start-script/zalo-bot-onefile.command \
   /Applications/zalo-bot-onefile.command
```

### Step 2 — Grant execution permissions

```bash
chmod +x /Applications/zalo-bot-onefile.command
```

> The `.command` file **must** have execution permission to be opened by double-clicking.

### Step 3 — First time opening (bypass Gatekeeper warning)

1. Go to **Finder → Applications**.
2. Right-click on `zalo-bot-onefile.command` → select **Open**.
3. Click **Open** in the Gatekeeper warning dialog.

> This step only needs to be done **once**. Subsequent times you can double-click normally.

### Step 4 — Update path when moved
If you move the entire project folder `zalo-tg` somewhere else, the application will report an error because it cannot find the new path.
You need to update the path into the configuration by:
1. Go to the new `zalo-tg` folder, open `quick-start-script`
2. Double-click the `zalo-bot-control.sh` file to run it at least once (or run it via Terminal).
3. This file will automatically find its current directory and save it into the configuration `~/.zalo-bot-control/settings.conf`. You can then go back to running the `.command` file in `Applications` as normal!

---

## Daily usage

Double-click the `zalo-bot-onefile.command` file. A menu appears with 7 options:

| Option | Effect |
|---|---|
| **Bật bot** (Turn on bot) | Build project, clean logs, create LaunchAgent, start bot |
| **Tắt bot** (Turn off bot) | Stop bot and remove LaunchAgent |
| **Xem trạng thái** (View status) | Show ON / OFF status and log retention days |
| **Mở log** (Open logs) | Open log directory in Finder |
| **Cấu hình xóa log** (Config log cleanup) | Set days to auto-delete logs (0 = disable auto-delete) |
| **Xóa log ngay** (Clear logs now) | Immediately delete old logs based on current config |
| **Đổi nhánh** (Branch config) | Select another git branch to run the bot |
| **Toggle Clamshell Mode** | Enable/Disable anti-sleep when lid is closed (Requires password) |
| **Hướng dẫn** (Guide) | Show short description and important notes |

---

## Execution flow when selecting "Turn on bot"

```
double-click → show menu
  → "Bật bot"
      → delete logs older than N days (by config)
      → npm run build (Builds only once here to prevent overheating during auto-restarts)
      → configure daemon to keep app alive (launchd)
      → git checkout the configured branch
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

1. Double-click file → select **Cấu hình xóa log**.
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

Quick open with Terminal:

```bash
open ~/Library/Logs/zalo-bot-control
```

Or select **Mở log** in the app's menu.

---

## Important Notes for 24/7 Operation

> [!CAUTION]
> IF YOU PUT YOUR MAC IN A BACKPACK, YOU **MUST DISABLE** `Toggle Clamshell Mode` from the menu. Otherwise, the Mac cannot sleep and will overheat in the bag, causing hardware damage!

> [!WARNING]
> - **Power supply:** When using `Toggle Clamshell Mode` (closed-display mode) to run 24/7, you must keep your Mac plugged into power continuously.
> - **Auto-start on boot:** macOS requires the user to log in before the system activates the bot's LaunchAgent. Go to `System Settings -> Users & Groups -> Automatically log in` and select your account to handle power outages and automatic reboots.

> [!IMPORTANT]
> The script waits for port `127.0.0.1:8081` to open before starting the app. If your Node.js code still calls `http://localhost:8081`, change it to `http://127.0.0.1:8081` to avoid connection errors due to IPv4/IPv6 mismatch.

> [!NOTE]
> `choose from list` is the standard way in AppleScript to display multiple choices. `display dialog` only allows up to 3 buttons so it cannot be used here.
