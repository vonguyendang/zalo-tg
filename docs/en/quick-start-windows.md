<div align="center">
  <strong>English</strong> | <a href="../vi/quick-start-windows.md">Tiếng Việt</a>
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

# Windows Setup Guide

You can run the Zalo-TG Bridge on Windows in two ways: directly via PowerShell (Native) or through the Windows Subsystem for Linux (WSL - Recommended).

---

## METHOD 1: Run via WSL (Recommended)

WSL (Windows Subsystem for Linux) allows you to run a true Linux environment right inside Windows, providing the best compatibility for server applications.

**Step 1: Install WSL**
1. Open PowerShell as Administrator.
2. Run the command:
   ```powershell
   wsl --install
   ```
3. Restart your computer. Open the **Ubuntu** app from the Start Menu and set up your username/password.

**Step 2: Install the Bot in Ubuntu**
1. Open the **Ubuntu** app.
2. Run the automated Linux installation script:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/williamcachamwri/zalo-tg/main/install.sh | sh
   ```
3. The script will automatically install Node.js, Git, FFmpeg, and configure your environment.
4. Navigate to the project folder and start the bot:
   ```bash
   cd ~/zalo-tg
   npm start
   ```

---

## METHOD 2: Run natively (Native Windows)

If you prefer not to use WSL, you can run the bot directly in PowerShell. This requires installing all dependencies manually.

### Step 1: Install prerequisites
1. **Node.js (>= 18):** Download and install the LTS version from [nodejs.org](https://nodejs.org/).
2. **Git:** Download and install from [git-scm.com](https://git-scm.com/).
3. **FFmpeg:** (Required for sending voice/video files)
   - Download the FFmpeg release for Windows from [gyan.dev](https://www.gyan.dev/ffmpeg/builds/ffmpeg-git-full.7z).
   - Extract it to your C drive (e.g., `C:\ffmpeg`).
   - Add the `C:\ffmpeg\bin` path to your Windows **Environment Variables (PATH)**. Open CMD/PowerShell and type `ffmpeg -version` to verify.

### Step 2: Download and install the source code
Open **PowerShell** and run:

```powershell
git clone https://github.com/williamcachamwri/zalo-tg
cd zalo-tg
npm install
```

### Step 3: Configure and Run
Create the `.env` file for your Telegram Bot Token and Group ID:
```powershell
copy .env.example .env
notepad .env
```
*(Fill in `TG_TOKEN` and `TG_GROUP_ID`, then save the file).*

**Run the bot:**
Build and start the application:
```powershell
npm run build
npm start
```

### Step 4 (Optional): Run 24/7 in the background with PM2
To keep the bot running even if you close PowerShell:
```powershell
npm install -g pm2
pm2 start dist/index.js --name zalo-tg
pm2 save
```
> [!TIP]
> PM2 will keep the bot running in the background. To have the bot start automatically when you boot your PC, you can create a basic Task in the Windows **Task Scheduler** that runs the `pm2 resurrect` command on login.
