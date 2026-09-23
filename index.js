require('dotenv').config();

const cron = require('node-cron');

const whatsappService = require('./services/whatsappService');
const reminderService = require('./services/reminderService');
const commandService = require('./services/commandService');
const messageBuilders = require('./services/messageBuilders');
const taskService = require('./services/taskService');


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
    const isPrivateChat = msg.from === CHAT_ID;
    const isGroupChat = msg.from.endsWith('@g.us');

    if (!isPrivateChat && !isGroupChat) return;

    let textContent = msg.body.trim();
    const activeRoomId = msg.from;

    // ========================================================
    // 🛡️ FILTER KHUSUS UNTUK CHAT DI DALAM GRUP WHATSAPP
    // ========================================================
    if (isGroupChat) {
      // 1. Cek apakah pesan diawali dengan !kayla
      if (textContent.toLowerCase().startsWith('!kayla')) {
        // Hapus kata '!kayla' dari teks agar tidak ikut dibaca AI
        textContent = textContent.substring(6).trim(); 
      } 
      // 2. Atau cek apakah bot di-tag/mention di dalam grup
      else if (msg.mentionedIds && msg.mentionedIds.includes(msg.to)) {
        // Bersihkan teks tag (misal @628xxx) agar AI menerima teks bersih
        textContent = textContent.replace(/@\d+/g, '').trim();
      } 
      // 3. Jika tidak di-tag dan tidak pakai command, bot DIAM (abaikan chat grup)
      else {
        return; 
      }
      
      // Jika setelah dihapus command-nya ternyata teksnya kosong, jangan kirim apa-apa
      if (!textContent) return;
    }

    // ========================================================
    // PENGIRIMAN PERINTAH KE AGENT & GEMINI
    // ========================================================
    const command = commandService.resolveCommand(textContent, activeRoomId);
    if (!command) return; 

    try {
      const reply = await commandService.handleCommand(command, activeRoomId);
      if (reply) await msg.reply(reply);
    } catch (error) {
      console.error(`❌ Gagal memproses command "${command}":`, error.message);
      await msg.reply('Lagi error narik data dari server, coba lagi nanti.').catch(() => {});
    }
  },

});