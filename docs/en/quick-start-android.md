<div align="center">
  <strong>English</strong> | <a href="../vi/quick-start-android.md">Tiếng Việt</a>
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

# Repurpose Your Android Phone into a Bot Server

You can easily repurpose an old Android phone into a 24/7 home server to run the Zalo-TG Bridge for free, with extreme power efficiency. The best tool for this job is **Termux**.

> [!WARNING]
> **Regarding iOS (iPhone/iPad):**
> Unfortunately, it is **impossible** to run this system natively on non-jailbroken iOS devices. Apple enforces strict sandbox limitations, and the operating system aggressively kills background processes to save battery. This guide is strictly for **Android**.

---

## Step 1: Install Termux properly

> [!IMPORTANT]
> **DO NOT** download Termux from the Google Play Store. That version is deprecated and cannot install Node.js properly.

1. Download the **F-Droid** app store from their official website: [f-droid.org](https://f-droid.org/)
2. Open F-Droid, search for, and install these two apps:
   - **Termux**
   - **Termux:API**

## Step 2: Disable Battery Optimizations (Required)

If you don't disable battery optimization, the Android OS will forcefully close Termux as soon as you lock your screen.
1. Pull down your notification shade, find the Termux notification, and tap **"Acquire wakelock"** (This keeps the CPU awake).
2. Go to your phone's **Settings** > **Apps** > **Termux** > **Battery** > Select **Unrestricted**.

## Step 3: Install the Environment

Open the Termux app and run the following commands (press Enter after each line):

```bash
# Upgrade Termux packages
pkg update && pkg upgrade -y

# Install Node.js, Git, and FFmpeg
pkg install nodejs git ffmpeg -y
```
*(If Termux prompts `[Y/n]` during installation, type `y` and press Enter).*

## Step 4: Download the Source Code

Still in Termux, run the following commands:

```bash
# Clone the repository
git clone https://github.com/williamcachamwri/zalo-tg
cd zalo-tg

# Install Node dependencies
npm install
```

## Step 5: Configuration & Startup

1. Create the `.env` file:
   ```bash
   cp .env.example .env
   ```
2. Edit the `.env` file using the `nano` text editor:
   ```bash
   nano .env
   ```
   *Use your keyboard to fill in your `TG_TOKEN` and `TG_GROUP_ID`. When done, press `Ctrl + X`, type `y`, and press `Enter` to save.*

3. Build and start the bot:
   ```bash
   npm run build
   npm start
   ```

> [!TIP]
> To keep the bot running safely in the background even if you close the Termux window, install **PM2**: `npm install -g pm2`, then start the bot via: `pm2 start dist/index.js --name zalo-bot`.
