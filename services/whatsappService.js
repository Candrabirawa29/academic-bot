const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client = null;
let isReady = false;

function init({ onReady, onMessage }) {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🤖 Scan QR Code ini pakai HP yang mau dijadiin bot!');
  });

  client.on('ready', () => {
    isReady = true;
    console.log('✅ WhatsApp client siap.');
    if (onReady) onReady();
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.error('⚠️ WhatsApp terputus:', reason);
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Autentikasi WhatsApp gagal:', msg);
  });

  if (onMessage) {
    client.on('message', (msg) => {
      // Satu pesan gagal diproses tidak boleh mematikan listener
      Promise.resolve(onMessage(msg)).catch((err) =>
        console.error('❌ Gagal memproses pesan masuk:', err.message)
      );
    });
  }

  client.initialize();
}

async function sendMessage(chatId, message) {
  if (!client || !isReady) {
    console.error('[whatsappService] Client belum siap, pesan dibatalkan.');
    return false;
  }
  try {
    await client.sendMessage(chatId, message);
    return true;
  } catch (error) {
    console.error('[whatsappService] Gagal mengirim pesan:', error.message);
    return false;
  }
}

module.exports = { init, sendMessage };