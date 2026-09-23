require('dotenv').config();

const cron = require('node-cron');

const whatsappService = require('./services/whatsappService');
const reminderService = require('./services/reminderService');
const commandService = require('./services/commandService');
const briefingService = require('./services/briefingService');

const USER_ID = process.env.USER_ID;
const NOMOR_WA = process.env.WHATSAPP_NUMBER;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';
const MORNING_BRIEFING_HOUR = process.env.MORNING_BRIEFING_HOUR || '6';
const NIGHT_BRIEFING_HOUR = process.env.NIGHT_BRIEFING_HOUR || '21';

if (!USER_ID || !NOMOR_WA || !process.env.API_BASE_URL) {
  console.error('❌ Environment variable belum lengkap. Wajib ada: USER_ID, WHATSAPP_NUMBER, API_BASE_URL');
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY belum diset — fitur Kayla (mode teman/agent) butuh ini.');
  process.exit(1);
}

const CHAT_ID = `${NOMOR_WA}@c.us`;

// CATATAN: Express server pancingan sengaja TIDAK ada di sini — sesuai keputusan kamu
// buat VPS DomaiNesia (RAM kecil, nggak butuh keep-alive HTTP kayak di Render).

whatsappService.init({
  onReady: () => {
    console.log('✅ Bot Kayla aktif!');

    // Reminder engine — polling tiap 1 menit, idempoten lewat notification log di backend
    cron.schedule('* * * * *', async () => {
      try {
        await reminderService.runReminderCycle(USER_ID, CHAT_ID);
      } catch (error) {
        console.error('❌ Reminder cycle gagal total:', error.message);
      }
    });

    // Morning & night briefing — dikembalikan (sempat hilang di versi sebelumnya).
    // Hapus dua blok cron ini kalau memang sengaja mau di-nonaktifkan.
    cron.schedule(
      `0 ${MORNING_BRIEFING_HOUR} * * *`,
      async () => {
        try {
          await briefingService.sendMorningBriefing(USER_ID, CHAT_ID);
        } catch (error) {
          console.error('❌ Gagal mengirim morning briefing:', error.message);
        }
      },
      { timezone: TIMEZONE }
    );

    cron.schedule(
      `0 ${NIGHT_BRIEFING_HOUR} * * *`,
      async () => {
        try {
          await briefingService.sendNightBriefing(USER_ID, CHAT_ID);
        } catch (error) {
          console.error('❌ Gagal mengirim night briefing:', error.message);
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

    if (isGroupChat) {
      // FIX: sebelumnya bandingin ke msg.to (ID grup itu sendiri, bukan ID bot) —
      // mention nggak akan pernah kedeteksi. Sekarang pakai ID bot yang sebenarnya.
      const selfId = whatsappService.getSelfId();
      const wasMentioned = Boolean(selfId && msg.mentionedIds && msg.mentionedIds.includes(selfId));

      if (textContent.toLowerCase().startsWith('!kayla')) {
        textContent = textContent.substring(6).trim();
      } else if (wasMentioned) {
        textContent = textContent.replace(/@\d+/g, '').trim();
      } else {
        return; // di grup, diam kalau nggak di-tag/pakai command
      }

      if (!textContent) return;
    }

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