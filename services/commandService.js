const taskService = require('./taskService');
const messageBuilders = require('./messageBuilders');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';

// Status mode per chat/room (private atau grup) — in-memory, reset kalau bot restart
const userModes = {};

function isWithinDay(dateStr, dayOffset) {
  const now = new Date();
  const target = new Date(dateStr);
  const start = new Date(now);
  start.setDate(now.getDate() + dayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return target >= start && target < end;
}

const NATURAL_RULES = [
  { pattern: /besok.*(tugas|apa|ada)/i, command: '!besok' },
  { pattern: /(paling )?urgent/i, command: '!focus' },
  { pattern: /(harus (ngerjain|kerjain)|ngapain (sekarang|now)|kerjain apa)/i, command: '!focus' },
  { pattern: /(berapa|jumlah).*(belum selesai|belum kelar|aktif)/i, command: '!tugas' },
  { pattern: /progress/i, command: '!progress' },
  { pattern: /hari ini.*(tugas|apa|ada)/i, command: '!today' },
];

const buatTugasTool = {
  functionDeclarations: [
    {
      name: 'tambahTugasKeSupabase',
      description: 'Menambahkan tugas baru milik user ke database task manager',
      parameters: {
        type: 'OBJECT',
        properties: {
          judul: { type: 'STRING', description: 'Nama/judul tugas' },
          waktu: {
            type: 'STRING',
            description:
              'Deadline tugas dalam format ISO 8601 LENGKAP (contoh: 2026-09-25T15:00:00+07:00). ' +
              'WAJIB dihitung sendiri dari tanggal & jam "sekarang" yang diberikan di instruksi sistem — ' +
              'jangan kirim teks mentah seperti "besok jam 3 sore".',
          },
        },
        required: ['judul', 'waktu'],
      },
    },
  ],
};

// Dibangun ulang tiap request (bukan konstanta statis) — supaya "sekarang" yang
// dikasih ke Gemini selalu akurat walau bot udah jalan berhari-hari tanpa restart.
function buildSystemInstruction() {
  const now = new Date().toLocaleString('id-ID', {
    timeZone: TIMEZONE,
    dateStyle: 'full',
    timeStyle: 'short',
  });

  return `Kamu adalah "Kayla", seorang asisten pribadi digital berwujud perempuan yang cerdas, ramah, dan sangat suportif. Kamu bertugas membantu User mengelola tugas di aplikasi Task Manager miliknya sekaligus menjadi teman mengobrol yang asyik.

Sekarang adalah: ${now} (zona waktu ${TIMEZONE}). Gunakan ini sebagai acuan kalau User menyebut waktu relatif seperti "besok", "nanti malam", atau "3 hari lagi".

Kamu memiliki dua mode operasi utama yang ditentukan oleh sistem:
1. MODE TEMAN (Default):
- Fokus menjadi teman mengobrol, mendengarkan curhat, memberikan motivasi, atau menjawab pertanyaan umum.
- Gunakan bahasa yang santai, kasual, hangat, empati, dan menggunakan gaya bahasa anak muda (seperti menggunakan 'aku', 'kamu', atau ekspresi ramah lainnya).
- Jangan memicu atau memanggil fungsi (tools) database pada mode ini kecuali diminta secara eksplisit untuk mencatat sesuatu.
2. MODE ASISTEN / AGENT:
- Fokus membantu mengelola tugas (Task Management).
- Jadilah asisten yang terorganisir, teliti, dan solutif.
- Tugas utama kamu adalah mengekstrak informasi dari chat User untuk memicu alat (tools) database.
- Jika User ingin menambah tugas (misal: "Ingetin rapat besok jam 3 sore"), analisis teks tersebut, ekstrak judul tugas, HITUNG waktunya jadi format ISO 8601 lengkap berdasarkan "sekarang" di atas, lalu panggil fungsi \`tambahTugasKeSupabase\`.

ATURAN UMUM:
- Jawablah selalu dalam Bahasa Indonesia yang natural.
- Sesuaikan energi kamu dengan mood User. Jika User sedang sedih/curhat, berikan empati yang mendalam.`;
}

function resolveCommand(rawText, roomId) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (lower === '!gemini' || lower === '!curhat') {
    userModes[roomId] = 'friend';
    return '!switch_friend';
  }
  if (lower === '!agent' || lower === '!task') {
    userModes[roomId] = 'agent';
    return '!switch_agent';
  }

  if (lower.startsWith('!')) return lower;

  for (const rule of NATURAL_RULES) {
    if (rule.pattern.test(text)) return rule.command;
  }

  return text;
}

async function handleCommand(command, roomId) {
  // Semua task selalu ditulis/dibaca dari akun Damar (USER_ID), apapun room-nya —
  // sesuai keputusan kamu bahwa grup kelas juga masuk ke tracker pribadi ini.
  const targetUserId = process.env.USER_ID;
  const currentMode = userModes[roomId] || 'friend';

  switch (command) {
    case '!switch_friend':
      return 'Siap! Mode santai aktif. Kayla siap dengerin curhatan kamu hari ini? 😊';
    case '!switch_agent':
      return "Mode Asisten Aktif 📋. Kirim tugasmu langsung ke Kayla (misal: 'ingetin rapat jam 3 sore')!";
    case '!tugas': {
      const ranked = await taskService.getFocusRanking(targetUserId);
      return messageBuilders.buildTaskSummary(ranked);
    }
    case '!focus': {
      const ranked = await taskService.getFocusRanking(targetUserId);
      if (ranked.length === 0) return 'Nggak ada tugas aktif. Santai dulu! 🎉';
      return messageBuilders.buildFocusReminder(ranked[0]); // FIX: sebelumnya ngirim seluruh array
    }
    case '!besok': {
      const tasks = await taskService.getTasks(targetUserId);
      const tomorrow = tasks.filter((t) => isWithinDay(t.currentDeadline, 1));
      return messageBuilders.buildAgendaSummary(tomorrow, 'BESOK');
    }
    case '!today': {
      const tasks = await taskService.getTasks(targetUserId);
      const today = tasks.filter((t) => isWithinDay(t.currentDeadline, 0));
      return messageBuilders.buildAgendaSummary(today, 'HARI INI');
    }
    case '!progress': {
      const tasks = await taskService.getTasks(targetUserId);
      return messageBuilders.buildProgressSummary(tasks);
    }
    case '!help':
      return messageBuilders.buildHelp();

    default: {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: command,
          config: {
            systemInstruction: buildSystemInstruction(),
            tools: currentMode === 'agent' ? [buatTugasTool] : [],
          },
        });

        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];

          if (call.name === 'tambahTugasKeSupabase') {
            const { judul, waktu } = call.args;

            const parsedDate = new Date(waktu);
            if (isNaN(parsedDate.getTime())) {
              // Gemini gagal ngasih format ISO yang valid — jangan diterusin ke backend,
              // itu bakal nyimpen Invalid Date yang ngerusak sorting/scoring task ini selamanya.
              return `Hmm, Kayla nangkep tugasnya ("${judul}") tapi bingung soal waktunya. Bisa disebutin lagi tanggal & jamnya yang lebih jelas? 🥺`;
            }

            await taskService.createTask(targetUserId, {
              title: judul,
              currentDeadline: parsedDate.toISOString(),
            });

            const formatted = parsedDate.toLocaleString('id-ID', {
              timeZone: TIMEZONE,
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            return `Siap! Tugas "${judul}" sudah Kayla catat, deadline-nya ${formatted}. Semangat! ✨`;
          }
        }

        return response.text;
      } catch (err) {
        console.error('Gemini Error:', err);
        return 'Aduh maaf, otak Kayla lagi ngeblank sebentar. Coba kirim pesan lagi ya.. 🥺';
      }
    }
  }
}

module.exports = { resolveCommand, handleCommand, isWithinDay };