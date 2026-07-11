# Guide to Deploy Zalo-TG on Raspberry Pi and Android Devices (Termux)

<div align="center">
  <strong>English</strong> | <a href="../vi/deploy-home-server.md">Tiếng Việt</a>
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

---

If you don't have a VPS, utilizing an old Android phone or a board like Raspberry Pi to run the bot 24/7 is a perfect, energy-efficient, and completely free solution.

This document provides detailed step-by-step instructions for both platforms.

---

## Part 1: Deployment on Old Android Phones (via Termux)

**Requirements:**
- Android phone running version 7.0 or higher (8.0+ recommended).
- **No Root required.**
- Stable Wi-Fi connection and always plugged into a charger.

### Step 1: Install Termux
**IMPORTANT NOTE:** DO NOT install Termux from the Google Play Store as that version is deprecated and no longer updated.

1. Download and install **F-Droid** from [f-droid.org](https://f-droid.org/) (or download the Termux APK directly from [Termux GitHub releases](https://github.com/termux/termux-app/releases)).
2. Open F-Droid, search for **Termux** (Termux Terminal emulator with packages), and install it.

### Step 2: Set up Environment (Node.js, Git, FFmpeg)
Open the Termux app and type the following commands one by one (press Enter after each command, type `Y` and Enter if prompted):

```bash
# Grant storage access to Termux (A popup will appear, select Allow)
termux-setup-storage

# Update the package list
pkg update && pkg upgrade -y

# Install Node.js, Git, and FFmpeg (for voice message processing)
pkg install nodejs git ffmpeg nano -y
```

*Tip: Check if Node.js was installed successfully by running `node -v`. Version >= 18 is required.*

### Step 3: Download Source Code and Configure
Still in Termux, run the following commands:

```bash
# Clone the repository from GitHub
git clone https://github.com/williamcachamwri/zalo-tg.git

# Navigate to the project directory
cd zalo-tg

# Install required dependencies
npm install

# Create the configuration file from the template
cp .env.example .env
```

### Step 4: Edit Configuration `.env`
We will use the built-in `nano` editor:
```bash
nano .env
```
1. Fill in `TG_TOKEN` (Obtained from @BotFather on Telegram).
2. Fill in `TG_GROUP_ID` (Your Telegram group ID).
3. Once done editing, press `Ctrl + X`, then type `Y` and press `Enter` to save the file.

### Step 5: Run Bot and Keep it Awake
Android has a mechanism to automatically kill background apps to save battery. You MUST do the following 2 things to keep the bot running 24/7:

1. **Enable Wakelock in Termux:**
   Type the following command in Termux:
   ```bash
   termux-wake-lock
   ```
   *(You will see a "wake lock held" notification in your Android notification shade).*

2. **Disable Battery Optimization for Termux:**
   Go to your phone's **Settings -> Battery -> Battery Optimization**. Find the Termux app and select **Don't optimize (Unrestricted)**.

3. **Start the bot:**
   ```bash
   # Build TypeScript code to JavaScript
   npm run build

   # Start the bot
   npm start
   ```
The bot is now running. You can go to your Telegram group and type `/login` or `/loginweb` to start.

---

## Part 2: Deployment on Raspberry Pi (or Linux Home Server)

**Requirements:** Raspberry Pi 3/4/5 running Raspberry Pi OS (or Ubuntu/Debian). Connected to the network.

### Step 1: Set up Environment
Open the Terminal (or SSH into your Pi) and run:

```bash
# Update the system
sudo apt update && sudo apt upgrade -y

# Install Git and FFmpeg
sudo apt install git ffmpeg -y
```

**Install Node.js:** (The default Node.js on Pi OS is usually outdated, we need to install NodeSource version 18 or 20)
```bash
# Install Node.js v20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Step 2: Clone Repository and Configure
```bash
# Clone the repository
git clone https://github.com/williamcachamwri/zalo-tg.git
cd zalo-tg

# Install dependencies
npm install

# Copy configuration file
cp .env.example .env

# Edit .env file (Fill in TOKEN and GROUP_ID)
nano .env
```

### Step 3: Build the Project
```bash
npm run build
```

### Step 4: Run Bot in Background with PM2
If you just type `npm start`, the bot will stop when you close the Terminal window. To run the bot in the background and automatically restart it when the Pi reboots, we use `pm2`.

```bash
# Install pm2 globally
sudo npm install -g pm2

# Start the bot with pm2
pm2 start dist/index.js --name "zalo-tg"

# Save the current pm2 configuration
pm2 save

# Get the command to make pm2 start on boot
pm2 startup
```
*(After running `pm2 startup`, the screen will output a command starting with `sudo ...`. Copy that command and run it to complete the setup).*

**Useful PM2 Commands:**
- View bot logs: `pm2 logs zalo-tg`
- Restart bot: `pm2 restart zalo-tg`
- Stop bot: `pm2 stop zalo-tg`
- View status: `pm2 status`

---
**Happy configuring!** If you encounter an `ECONNREFUSED` error or network issues, ensure your home network does not block connections to the Telegram API.
