# Code Update & Deployment Guide

Whenever the project source code changes (e.g., new features, bug fixes, dependency updates), follow the steps below to ensure your bot applies the changes safely and correctly.

---

## 📍 1. Menu Bar App Environment (`zalo-tg-tui` on macOS)

If you manage the bot on your personal Mac using the Menu Bar tool (the green "Z" icon), the update process is straightforward as the app handles most of the background work.

**Steps:**
1. Open Terminal in the project directory (`/Users/.../Projects/zalo-tg`).
2. Pull the latest code from GitHub:
   ```bash
   git pull
   ```
3. Install new dependencies (if `package.json` was updated):
   ```bash
   npm install
   ```
4. Compile the source code from TypeScript to JavaScript:
   ```bash
   npm run build
   ```
5. Click the green **Z** icon on your Mac's Menu Bar.
6. Select **"Restart bot"**. The bot will automatically restart using the newly compiled code from the `dist/` directory.

---

## 📍 2. Manual Local Development Environment (Terminal)

If you are a developer manually running the bot via your Terminal:

**Steps:**
1. Stop the currently running process by pressing `Control + C` in the Terminal window running the bot.
2. Pull the latest code (or save your local changes):
   ```bash
   git pull
   ```
3. Install dependencies and recompile the code:
   ```bash
   npm install && npm run build
   ```
4. Start the bot again:
   ```bash
   npm run start
   # Or use npm run dev (which uses tsx) if you want the bot to auto-reload on future file changes
   ```

---

## 📍 3. Production Server Environment (VPS / Linux)

When running the bot as a background service (via Systemd or PM2) on a Linux server.

### 🔹 Method 1: Using Systemd (Recommended)
*Prerequisite: You have configured the `zalo-tg.service` file as per the deployment documentation.*

1. Navigate to the bot directory on your server:
   ```bash
   cd /root/zalo-tg
   ```
2. Pull the latest code:
   ```bash
   git pull
   ```
3. Install new dependencies:
   ```bash
   npm install
   ```
4. Restart the service:
   ```bash
   sudo systemctl restart zalo-tg
   ```
   *(Note: The provided systemd script already includes `ExecStartPre=/usr/bin/npm run build`, so restarting it will automatically recompile the code).*

### 🔹 Method 2: Using PM2
1. Pull the code, install dependencies, and build:
   ```bash
   git pull
   npm install
   npm run build
   ```
2. Restart the PM2 process:
   ```bash
   pm2 restart zalo-tg
   ```

---

## 💡 Important Notes
- **Always run `npm install`** if you notice changes to `package.json` or `package-lock.json`. This ensures security patches (like `npm audit` fixes) and new libraries are properly installed.
- **Always run `npm run build`** (unless you are exclusively using `npm run dev`). The original source code is written in TypeScript (`.ts`), but Node.js executes the JavaScript (`.js`) files generated in the `dist/` folder. Failing to build means the bot will continue running the old compiled logic.
