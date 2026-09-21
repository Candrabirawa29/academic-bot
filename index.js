const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const axios = require('axios');

// KONFIGURASI PRIBADI LO (GANTI INI)
const USER_ID = "1070b337-6f92-4500-90df-f510c1bde9c9"; 
const NOMOR_WA = "6281387798583"; // Format tanpa '+', pakai 62
const API_URL = `https://academic-tracker-phi.vercel.app/api/tasks?userId=${USER_ID}`;

// Set untuk nyimpen task_id yang udah dikasih notif (biar ga nge-spam tiap menit)
const notifiedTasks = new Set();

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true, // set false kalau mau lihat browser-nya jalan (buat debug)
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    },
});

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🤖 Scan QR Code ini pakai HP yang mau dijadiin bot!');
});

client.on('ready', () => {
    console.log('✅ Bot Tracker aktif dan siap jadi asisten akademik lo, Damar!');

    // CRON JOB: Jalan tiap 1 menit untuk ngecek tugas (Bisa diganti tiap jam nanti)
    cron.schedule('* * * * *', async () => {
        console.log('⏳ Mengecek radar tugas di database...');
        try {
            // Narik data dari web Next.js lo
            const response = await axios.get(API_URL);
            const tasks = response.data.data;

            if (!tasks || tasks.length === 0) return;

            const now = new Date();

            tasks.forEach(task => {
                const deadline = new Date(task.currentDeadline);
                const timeDiffHours = (deadline - now) / (1000 * 60 * 60);

                // LOGIKA NOTIFIKASI: Kalau tugas belum selesai & deadline kurang dari 24 jam & belum pernah dinotif
                if (task.status !== 'completed' && timeDiffHours > 0 && timeDiffHours <= 24 && !notifiedTasks.has(task.id)) {
                    
                    // Filter checklist khusus untuk barang bawaan (Preparation Items) yang belum dicentang
                    const preparationItems = task.checklists
                        .filter(item => item.type === 'preparation_item' && !item.isChecked)
                        .map(item => `  ☐ ${item.title}`)
                        .join('\n');

                    // Rangkai pesan WA ala asisten pribadi
                    let pesan = `🔔 *REMINDER TUGAS: ${task.title}*\n`;
                    pesan += `⏰ Deadline: ${deadline.toLocaleString('id-ID')}\n`;
                    pesan += `📊 Status: ${task.status.replace('_', ' ')}\n\n`;
                    
                    if (preparationItems) {
                        pesan += `🎒 *JANGAN LUPA BAWA BESOK:*\n${preparationItems}\n\n`;
                        pesan += `_Note: Cek tas lo sekarang biar tragedi ketinggalan nggak keulang!_`;
                    } else {
                        pesan += `_Gas selesain mumpung masih ada waktu!_`;
                    }

                    // Kirim pesan ke nomor utama lo (@c.us adalah format wajib dari library ini)
                    const chatId = `${NOMOR_WA}@c.us`;
                    client.sendMessage(chatId, pesan)
                        .then(() => {
                            console.log(`📩 Berhasil ngirim reminder untuk tugas: ${task.title}`);
                            notifiedTasks.add(task.id); // Masukin ke cache biar ga disubmit ulang di menit berikutnya
                        })
                        .catch(err => console.error('Gagal ngirim WA:', err));
                }
            });
        } catch (error) {
            console.error('❌ Gagal koneksi ke API Next.js:', error.message);
        }
    });
});

// Fitur Interaktif: Balas chat dari nomor utama lo
client.on('message', async (msg) => {
    if (msg.from === `${NOMOR_WA}@c.us` && msg.body.toLowerCase() === '!tugas') {
        msg.reply('Sedang mengecek tugas lo...');
        try {
            const response = await axios.get(API_URL);
            const tasks = response.data.data;
            const pendingTasks = tasks.filter(t => t.status !== 'completed').length;
            msg.reply(`Lo punya *${pendingTasks} tugas* yang belum selesai. Buka dashboard web untuk detailnya!`);
        } catch (error) {
            msg.reply('Lagi error narik data dari server, coba lagi nanti.');
        }
    }
});

client.initialize();

