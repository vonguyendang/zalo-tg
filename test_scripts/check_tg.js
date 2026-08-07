import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';
dotenv.config();
const bot = new Telegraf(process.env.TG_TOKEN);
try {
  const me = await bot.telegram.getMe();
  console.log('Bot Info:', me);
} catch (err) {
  console.error('Error:', err);
}
