const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client = null;
let isReady = false;
let selfId = null;

function init({ onReady, onMessage }) {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      // Isi CHROME_PATH di .env kalau mau pakai Chromium sistem (lebih hemat RAM
      // daripada Chromium bawaan puppeteer) — lihat catatan instalasi di ringkasan.
      executablePath: process.env.CHROME_PATH || undefined,
      // Default protocolTimeout puppeteer kadang kepotong duluan di VPS yang lagi
      // kepepet resource — dinaikin biar "Runtime.callFunctionOn timed out" lebih jarang.
      protocolTimeout: 120000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--mute-audio',
        '--no-first-run',
        '--metrics-recording-only',
        '--safebrowsing-disable-auto-update',
        '--js-flags=--max-old-space-size=256',
      ],
    },
  });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🤖 Scan QR Code ini pakai HP yang mau dijadiin bot!');
  });

  client.on('ready', () => {
    isReady = true;
    selfId = client.info?.wid?._serialized || null;
    console.log('✅ WhatsApp client siap. Self ID:', selfId);
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
      Promise.resolve(onMessage(msg)).catch((err) =>
        console.error('❌ Gagal memproses pesan masuk:', err.message)
      );
    });
  }

  client.initialize();
}

async function sendMessage(chatId, message, retryCount = 1) {
  if (!client || !isReady) {
    console.error('[whatsappService] Client belum siap, pesan dibatalkan.');
    return false;
  }
  try {
    await client.sendMessage(chatId, message);
    return true;
  } catch (error) {
    console.error('[whatsappService] Gagal mengirim pesan:', error.message);
    // Timeout di VPS kecil sering transient (Chrome lagi kepepet resource sesaat).
    // Satu kali retry setelah jeda singkat, tanpa nambah kompleksitas berlebih.
    if (retryCount > 0 && error.message && error.message.includes('timed out')) {
      console.log('[whatsappService] Retry mengirim pesan setelah timeout...');
      await new Promise((r) => setTimeout(r, 3000));
      return sendMessage(chatId, message, retryCount - 1);
    }
    return false;
  }
}

function getSelfId() {
  return selfId;
}

module.exports = { init, sendMessage, getSelfId };