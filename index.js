require('dotenv').config();

const express = require('express');
const cron = require('node-cron');

const whatsappService = require('./services/whatsappService');
const reminderService = require('./services/reminderService');
const commandService = require('./services/commandService');
const messageBuilders = require('./services/messageBuilders');
const taskService = require('./services/taskService');

const app = express();
const port = process.env.PORT || 10000;

const USER_ID = process.env.USER_ID;
const NOMOR_WA = process.env.WHATSAPP_NUMBER;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';
const DAILY_SUMMARY_HOUR = process.env.DAILY_SUMMARY_HOUR || '21'; // jam 24h, sesuai TIMEZONE

if (!USER_ID || !NOMOR_WA || !process.env.API_BASE_URL) {
  console.error('❌ Environment variable belum lengkap. Wajib ada: USER_ID, WHATSAPP_NUMBER, API_BASE_URL');
  process.exit(1);
}

const CHAT_ID = `${NOMOR_WA}@c.us`;

// ==========================================
// SERVER PANCINGAN (biar hosting nggak nge-sleep karena nggak ada port terbuka)
// ==========================================
app.get('/', (req, res) => res.send('✅ Academic Assistant Bot Aktif!'));
app.listen(port, () => console.log(`Server pancingan jalan di port ${port}`));

// ==========================================
// WHATSAPP CLIENT + REMINDER ENGINE + COMMAND HANDLER
// ==========================================
whatsappService.init({
  onReady: () => {
    console.log('✅ Bot Academic Assistant aktif!');

    // Reminder engine — polling tiap 1 menit.
    // Idempoten: dedup dicek/dicatat lewat notification log di backend (bukan Set() memori),
    // jadi restart/redeploy/multi-instance nggak bikin reminder dobel.
    cron.schedule('* * * * *', async () => {
      try {
        await reminderService.runReminderCycle(USER_ID, CHAT_ID);
      } catch (error) {
        // Jaring pengaman terakhir — seharusnya nggak pernah kena karena
        // reminderService sudah handle error per-task di dalam.
        console.error('❌ Reminder cycle gagal total:', error.message);
      }
    });

    // Daily summary — sekali sehari jam yang dikonfigurasi, di timezone yang benar
    // (bukan timezone server), sesuai requirement jam bisa diatur.
    cron.schedule(
      `0 ${DAILY_SUMMARY_HOUR} * * *`,
      async () => {
        try {
          const tasks = await taskService.getTasks(USER_ID);
          const now = new Date();
          const tomorrowStart = new Date(now);
          tomorrowStart.setDate(now.getDate() + 1);
          tomorrowStart.setHours(0, 0, 0, 0);
          const tomorrowEnd = new Date(tomorrowStart);
          tomorrowEnd.setDate(tomorrowStart.getDate() + 1);

          const tomorrow = tasks.filter((t) => {
            const d = new Date(t.currentDeadline);
            return d >= tomorrowStart && d < tomorrowEnd;
          });

          await whatsappService.sendMessage(CHAT_ID, messageBuilders.buildDailySummary(tomorrow));
        } catch (error) {
          console.error('❌ Gagal mengirim ringkasan harian:', error.message);
        }
      },
      { timezone: TIMEZONE }
    );
  },

  onMessage: async (msg) => {
    if (msg.from !== CHAT_ID) return;

    const command = commandService.resolveCommand(msg.body);
    if (!command) return; // nggak dikenali — bot diam, jangan asal jawab/spam

    try {
      const reply = await commandService.handleCommand(command, USER_ID);
      if (reply) await msg.reply(reply);
    } catch (error) {
      console.error(`❌ Gagal memproses command "${command}":`, error.message);
      await msg.reply('Lagi error narik data dari server, coba lagi nanti.').catch(() => {});
    }
  },
});