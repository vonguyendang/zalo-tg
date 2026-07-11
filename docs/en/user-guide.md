# ZaloBot User Guide (Multi-Account & Mac Menu Bar Version)

<div align="center">
  <strong>English</strong> | <a href="../vi/user-guide.md">Tiếng Việt</a>
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

This version has been massively upgraded to support **multiple Zalo accounts simultaneously** on a single Telegram Bot, and comes with a **convenient Mac Menu Bar App**.

---

## 0. Installation & Build Guide

### Step 1: Prepare the Bot Environment
Before using, you need to install the required libraries and configure the `.env` file.
1. Open Terminal and navigate to the code directory (e.g., `cd /Users/dangvo/Projects/zalo-tg`).
2. Run the command: `npm install` to install libraries.
3. Run the command: `npm run build` to compile the TypeScript source code to JavaScript.
4. Create an `.env` file based on `.env.example` and fill in your Telegram Bot Token.

### Step 2: Install Mac Menu Bar App
You only need to do this once. The script will automatically package the app into a `.app` file and place it on your Menu Bar.
1. In the Terminal window (at the root of the project), run the following commands:
   ```bash
   cd quick-start-script/mac-menu-bar
   ./install-menu-bar.sh
   ```
2. Immediately, you will see a **Z** icon inside a circle appear in the top right corner of your screen (the Menu Bar).
3. The app is automatically configured to hide from the Dock below and to launch automatically every time you restart your Mac.

> **💡 Note:** The `ZaloBotMenu.app` file is stored in the hidden directory `~/.zalo-bot-control/` in your Mac's Home folder. By default, Finder hides this folder to prevent accidental deletion. If you want to view this folder, you can run the command `open ~/.zalo-bot-control` in the Terminal.

### Step 3: Note on moving the project directory
If you later move the entire `zalo-tg` folder to another location (or rename the folder), the Menu Bar App may report an error that it cannot find the project.
To fix this, simply help the system update the new path using one of the two methods:
* **Method 1**: Open Terminal, navigate to the new folder, and run the command `quick-start-script/zalo-bot-control.sh show_status`.
* **Method 2**: Use Finder to go to the new project folder, open the `quick-start-script` folder, and double-click the `zalo-bot-control.sh` file to run it once.
As soon as the script runs, it will automatically remember the new path into the configuration file. After that, everything will work normally!

---

## 1. Mac Menu Bar App (Status Bar)
Instead of using the Terminal, you can control the entire Bot directly from the Menu Bar at the top right corner of your MacBook screen.

### Icon Meanings
*   🟢 **Z (Green)**: The bot is running normally.
*   🔴 **Z (Red)**: The bot is currently off or encountered a startup error.

### Menu Functions
When you click on the **Z** icon, you can perform the following actions:
*   **Turn On/Off Bot (Bật/Tắt Bot)**: Start or completely stop the bot in the background (without a disruptive Terminal window).
*   **Restart Bot (Khởi động lại Bot)**: This is useful when you have just changed the configuration file (like `.env`).
*   **Open Log (Mở Log)**: Quickly open the folder containing the error log files (`~/Library/Logs/zalo-bot-control/`).
*   **Log Deletion Config / Clear Logs Now (Cấu hình xóa log / Xóa log ngay)**: Customize the periodic cleanup of junk data.
*   **Branch Configuration (Cấu hình nhánh)**: Switch between source code versions (e.g., `dev` to `multi-zalo`). The bot will automatically download the configuration and restart after changing the branch.

---

## 2. Connect Multiple Zalo Accounts

You are no longer limited to just 1 Zalo account. The bot can act as a bridge for as many accounts as you like.

### Login to an additional account (`/login`)
In the Bot's Telegram chat group, type the command:
`/login` (or `/loginapp` / `/loginweb`)
*   Every time a QR code is successfully scanned, the system will automatically add that Zalo account to the system **without affecting** the previously connected accounts.

### Manage accounts (`/accounts`)
To see which Zalo accounts you are currently running, type:
`/accounts`
*   The bot will return a list of active accounts along with the ID (UID) of each account.

### Logout of a specific account (`/logout`)
If you want to disconnect a specific Zalo account:
1. Type `/accounts` to view the ID (UID) of that account.
2. Type `/logout <UID>` (For example: `/logout 123456789`).
*   That account will be logged out and removed from Telegram; the remaining accounts will still function normally.

---

## 3. How the Message System (Topic) Works

When an incoming Zalo message arrives, the Bot will automatically create a Topic (Message thread) in your Telegram group.

*   **Automatic Topic Naming**: To help you easily distinguish which message belongs to which Zalo account, the Topic name will automatically be prepended with a prefix.
    *   Example: `[Your Zalo Name] Customer Name`
*   **Replying to messages**: You just need to Reply or send a direct message into that Topic. The bot is smart enough to know which Zalo account this Topic belongs to and will use that exact account to send the message.
*   **Using commands in Topic**: Any command called inside a Topic (e.g., `/history`) will automatically be executed on the corresponding Zalo account of that Topic.

---

## 4. Backup and Migration

If you are running the bot on one device (e.g., a Mac) and want to migrate to another device (e.g., a Linux VPS or Android phone) without having to log in again or losing your current Topic linkages, you only need to back up the core files.

### Files you MUST keep
- **The `.env` file**: Contains your configuration (Token, Group ID).
- **The `sessions/` folder**: Contains your Zalo login session files:
  - `credentials.json` and `app-session.json`: Keeps your Zalo login session active (no need to scan QR again).
- **The `data/` folder**: Contains all your bot databases, including:
  - `topics.json`: Saves the mapping between Zalo groups and Telegram Topics.
  - `msg-map.json` (or `msg-map.json.gz`): Saves the 2-way linkage of all messages (ensures Reply and Recall features work).
  - `user-cache.json.gz`: Saves the cache of usernames and UIDs.
  - `polls.json.gz`: Saves the linkages of Polls between Zalo and Telegram.

### Files you must NEVER copy to the new machine
- **`node_modules/`** and **`dist/`**: Source code and libraries are compiled specifically for the old operating system/CPU architecture. Copying them to a new machine with a different architecture (e.g., from Mac to Linux) will crash the bot immediately.

### Safe Migration Process
1. **On the new device:** Install the environment (Node.js, Git, FFmpeg) and clone the source code fresh:
   ```bash
   git clone https://github.com/williamcachamwri/zalo-tg
   cd zalo-tg
   npm install
   ```
2. **Transfer data:** Copy the `.env` file, the `sessions/` folder, and the `data/` folder from your old machine into the `zalo-tg/` folder on your new machine.
3. **Start the bot:** Rebuild the source code and start the bot:
   ```bash
   npm run build
   npm start
   ```
As soon as it starts, the bot on the new device will resume the old connection and continue running seamlessly.
