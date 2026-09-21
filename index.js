const express = require('express');
const app = express();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const axios = require('axios');
const port = process.env.PORT || 10000;

// ==========================================
// 1. SERVER PANCINGAN (EXPRESS)
// ==========================================
app.get('/', (req, res) => {
    res.send('✅ Bot WA Tracker Aktif!');
});

app.listen(port, () => {
    console.log(`Server pancingan jalan di port ${port}`);
});

// ==========================================
// 2. KONFIGURASI PRIBADI LO (DIISI YANG BENER)
// ==========================================
const USER_ID = "1070b337-6f92-4500-90df-f510c1bde9c9"; 
const NOMOR_WA = "6281387798583"; // Format tanpa '+', pakai 62
const API_URL = `https://vercel.app{USER_ID}`;

// Set untuk menyimpan task_id yang sudah dikirim notifikasinya agar tidak duplikat
const notifiedTasks = new Set();

// ==========================================
// 3. INISIALISASI WHATSAPP CLIENT
// ==========================================
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true, // Ubah jadi false kalau mau liat browser Chrome-nya kebuka di lokal
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ],
    },
});

// Event saat QR Code digenerate
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('🤖 Scan QR Code ini pakai HP yang mau dijadiin bot!');
});

// Event saat Bot sudah siap
client.on('ready', () => {
    console.log('✅ Bot Tracker aktif dan siap jadi asisten akademik lo, Damar!');

    // ==========================================
    // 4. CRON JOB: CEK DATABASE TIAP 1 MENIT
    // ==========================================
    cron.schedule('* * * * *', async () => {
        console.log('⏳ Mengecek radar tugas di database...');
        try {
            const response = await axios.get(API_URL);
            const tasks = response.data?.data || response.data; 

            if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return;

            const now = new Date();

            tasks.forEach(task => {
                // Membaca string deadline dari API
                const deadline = new Date(task.currentDeadline);
                
                // Menghitung selisih jam real-time saat ini
                const timeDiffHours = (deadline - now) / (1000 * 60 * 60);

                // LOGIKA NOTIFIKASI: Belum selesai, deadline sisa <= 24 jam, dan belum pernah dinotif
                if (task.status !== 'completed' && timeDiffHours > 0 && timeDiffHours <= 24 && !notifiedTasks.has(task.id)) {
                    
                    // Filter checklist khusus barang bawaan (Preparation Items) yang belum dicentang
                    const preparationItems = task.checklists
                        ? task.checklists
                            .filter(item => item.type === 'preparation_item' && !item.isChecked)
                            .map(item => `  ☐ ${item.title}`)
                            .join('\n')
                        : '';

                    // Format jam ke Asia/Jakarta (WIB) biar gak jumping lagi jamnya
                    const formattedDeadline = deadline.toLocaleString('id-ID', { 
                        timeZone: 'Asia/Jakarta', 
                        dateStyle: 'medium', 
                        timeStyle: 'short',
                        hour12: false 
                    });

                    // Rangkai pesan WhatsApp ala asisten pribadi
                    let pesan = `🔔 *REMINDER TUGAS: ${task.title}*\n`;
                    pesan += `⏰ Deadline: ${formattedDeadline} WIB\n`;
                    pesan += `📊 Status: ${task.status.replace('_', ' ')}\n\n`;
                    
                    if (preparationItems) {
                        pesan += `🎒 *JANGAN LUPA BAWA BESOK:*\n${preparationItems}\n\n`;
                        pesan += `_Note: Cek tas lo sekarang biar tragedi ketinggalan nggak keulang!_`;
                    } else {
                        pesan += `_Gas selesain mumpung masih ada waktu!_`;
                    }

                    // Kirim pesan ke nomor utama lo
                    const chatId = `${NOMOR_WA}@c.us`;
                    client.sendMessage(chatId, pesan)
                        .then(() => {
                            console.log(`📩 Berhasil ngirim reminder untuk tugas: ${task.title}`);
                            notifiedTasks.add(task.id); // Masukin ke cache biar gak spam di menit berikutnya
                        })
                        .catch(err => console.error('Gagal ngirim WA:', err));
                }
            });
        } catch (error) {
            console.error('❌ Gagal koneksi ke API Next.js:', error.message);
        }
    });
});

// ==========================================
// 5. FITUR INTERAKTIF: BALAS CHAT !TUGAS
// ==========================================
client.on('message', async (msg) => {
    if (msg.from === `${NOMOR_WA}@c.us` && msg.body.toLowerCase() === '!tugas') {
        msg.reply('Sedang mengecek tugas lo...');
        try {
            const response = await axios.get(API_URL);
            const tasks = response.data?.data || response.data;
            
            if (!tasks || !Array.isArray(tasks)) {
                return msg.reply('Gagal membaca struktur data tugas.');
            }

            const pendingTasks = tasks.filter(t => t.status !== 'completed').length;
            msg.reply(`Lo punya *${pendingTasks} tugas* yang belum selesai. Buka dashboard web untuk detailnya!`);
        } catch (error) {
            msg.reply('Lagi error narik data dari server, coba lagi nanti.');
        }
    }
});

client.initialize();
