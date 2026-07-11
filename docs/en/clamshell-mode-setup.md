# Guide to 24/7 Clamshell Mode Operation

This document explains how to configure your Intel macOS to run the Zalo Bot continuously 24/7 even when the lid is closed (Clamshell Mode), ensuring maximum stability without interruptions.

---

## Part 1: Apply Bot Changes (One-time)

The bot system has been optimized. To apply the changes:
1. Look at the **Menu Bar** (top right corner) and click the **Z** icon.
2. Select **Restart bot**.
3. The bot will automatically recompile the anti-overheating version and restart in the background.

---

## Part 2: macOS Settings (Required)

To ensure the bot recovers automatically after a power outage and runs safely 24/7, you need to configure the following in System Settings:

### 1. Enable Auto-login
> Ensures the bot automatically restarts if your Mac loses power and turns back on.
- Open **System Settings** > **Users & Groups**.
- Find **Automatically log in as**.
- Select your account and enter your password to confirm.

### 2. Lock Screen Settings
> Ensures your Mac locks automatically when the lid is closed for security.
- Open **System Settings** > **Lock Screen**.
- Set **Require password after screen saver begins or display is turned off** to `Immediately`.

---

## Part 3: Daily Usage

When you want to leave the machine running the bot 24/7 with the lid closed, follow these steps exactly:

1. **Power Supply:** Plug in the charger to your MacBook. (Mandatory).
2. **Enable Anti-Sleep Mode:**
   - Click the **Z** icon on the Menu Bar.
   - Select **Toggle Clamshell Mode**.
   - Enter your Mac password. A dialog saying **"Đã BẬT chế độ chống Sleep 24/7"** (Anti-Sleep enabled) will appear.
3. **Close the Lid:** 
   - You can now safely close the lid.
   - The screen will turn off (saving power) and lock automatically (security), but the network and CPU will continue running in the background to serve messages continuously.
4. **Placement:** Place the Mac in a cool, well-ventilated area on a hard surface (like a desk). Do NOT place it on a bed or blanket to ensure proper heat dissipation.

---

## ⚠️ Hardware Safety Warning (Crucial)

> [!CAUTION]
> IF YOU NEED TO TAKE YOUR MAC TO WORK / PUT IT IN A BACKPACK:
> - You **MUST DISABLE** Clamshell mode.
> - Click **Toggle Clamshell Mode** again from the Z menu.
> - Wait for the **"Đã TẮT chế độ chống Sleep"** (Anti-Sleep disabled) dialog, then you can unplug it, close it, and put it in your bag.
> 
> *Reason: If you forget to disable it, the Mac will continue running in the background and cannot dissipate heat inside a closed backpack, which can lead to battery swelling, hardware damage, or fire hazards!*
