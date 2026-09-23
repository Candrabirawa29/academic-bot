const taskService = require('./taskService');
const messageBuilders = require('./messageBuilders');
// 1. Import SDK Gemini resmi
const { GoogleGenAI } = require('@google/genai');

// Inisialisasi Gemini menggunakan API Key dari .env
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Objek penyimpan status mode per WhatsApp User (default: 'friend')
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

// Deklarasi Tool / Function Calling untuk AI Agent memasukkan tugas ke database
const buatTugasTool = {
  functionDeclarations: [{
    name: 'tambahTugasKeSupabase',
    description: 'Menambahkan tugas atau task management baru milik user ke database',
    parameters: {
      type: 'OBJECT',
      properties: {
        judul: { type: 'STRING', description: 'Detail/nama tugas yang ingin dikerjakan' },
        waktu: { type: 'STRING', description: 'Waktu deadline tugas dalam format string ISO atau teks biasa yang bisa diurai' }
      },
      required: ['judul']
    }
  }]
};

// System Instruction / Prompt Kepribadian Kayla
const systemInstruction = `Kamu adalah "Kayla", seorang asisten pribadi digital berwujud perempuan yang cerdas, ramah, dan sangat suportif. Kamu bertugas membantu User mengelola tugas di aplikasi Task Manager miliknya sekaligus menjadi teman mengobrol yang asyik.
Kamu memiliki dua mode operasi utama yang ditentukan oleh sistem:
1. MODE TEMAN (Default):
- Fokus menjadi teman mengobrol, mendengarkan curhat, memberikan motivasi, atau menjawab pertanyaan umum.
- Gunakan bahasa yang santai, kasual, hangat, empati, dan menggunakan gaya bahasa anak muda (seperti menggunakan 'aku', 'kamu', atau ekspresi ramah lainnya).
- Jangan memicu atau memanggil fungsi (tools) database pada mode ini kecuali diminta secara eksplisit untuk mencatat sesuatu.
2. MODE ASISTEN / AGENT:
- Fokus membantu mengelola tugas (Task Management).
- Jadilah asisten yang terorganisir, teliti, dan solutif.
- Tugas utama kamu adalah mengekstrak informasi dari chat User untuk memicu alat (tools) database.
- Jika User ingin menambah tugas (misal: "Ingetin rapat besok jam 3 sore"), analisis teks tersebut, ekstrak judul tugas dan waktunya, lalu panggil fungsi \`tambahTugasKeSupabase\`.
ATURAN UMUM:
- Jawablah selalu dalam Bahasa Indonesia yang natural.
- Sesuaikan energi kamu dengan mood User. Jika User sedang sedih/curhat, berikan empati yang mendalam.`;

function resolveCommand(rawText, userId) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  // Deteksi Switch Mode manual lewat WhatsApp
  if (lower === '!gemini' || lower === '!curhat') {
    userModes[userId] = 'friend';
    return '!switch_friend';
  }
  if (lower === '!agent' || lower === '!task') {
    userModes[userId] = 'agent';
    return '!switch_agent';
  }

  if (lower.startsWith('!')) return lower;

  for (const rule of NATURAL_RULES) {
    if (rule.pattern.test(text)) return rule.command;
  }

  // Jika tidak cocok command rule-based manapun, kembalikan teks asli untuk diolah Gemini
  return text; 
}

async function handleCommand(command, userId) {
  // Ambil current mode user, default ke 'friend' jika belum diset
  const currentMode = userModes[userId] || 'friend';

  switch (command) {
    case '!switch_friend':
      return "Siap! Mode santai aktif. Kayla siap dengerin curhatan kamu hari ini? 😊";
    case '!switch_agent':
      return "Mode Asisten Aktif 📋. Kirim tugasmu langsung ke Kayla (misal: 'ingetin rapat jam 3 sore')!";
    case '!tugas': {
      const ranked = await taskService.getFocusRanking(userId);
      return messageBuilders.buildTaskSummary(ranked);
    }
    case '!focus': {
      const ranked = await taskService.getFocusRanking(userId);
      if (ranked.length === 0) return 'Nggak ada tugas aktif. Santai dulu! 🎉';
      return messageBuilders.buildFocusReminder(ranked[0]);
    }
    case '!besok': {
      const tasks = await taskService.getTasks(userId);
      const tomorrow = tasks.filter((t) => isWithinDay(t.currentDeadline, 1));
      return messageBuilders.buildAgendaSummary(tomorrow, 'BESOK');
    }
    case '!today': {
      const tasks = await taskService.getTasks(userId);
      const today = tasks.filter((t) => isWithinDay(t.currentDeadline, 0));
      return messageBuilders.buildAgendaSummary(today, 'HARI INI');
    }
    case '!progress': {
      const tasks = await taskService.getTasks(userId);
      return messageBuilders.buildProgressSummary(tasks);
    }
    case '!help':
      return messageBuilders.buildHelp();
      
    // DEFAULT CASE: Mengalirkan teks biasa ke Gemini AI (Mode Curhat / Agent)
    default: {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: command, // berisi teks chat asli dari user
          config: {
            systemInstruction: systemInstruction,
            // Hanya aktifkan tools/function calling jika berada di mode agent
            tools: currentMode === 'agent' ? [buatTugasTool] : []
          }
        });

        // Tangkap eksekusi fungsi jika Gemini memutuskan untuk menggunakan Tools
        const functionCalls = response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          
          if (call.name === 'tambahTugasKeSupabase') {
            const { judul, waktu } = call.args;
            
            // Panggil taskService proyek Anda untuk langsung menyimpan ke database Supabase
            // Sesuaikan nama fungsi di taskService Anda (misal: createTask atau sejenisnya)
            await taskService.createTask(userId, { title: judul, deadline: waktu });
            
            return `Siap! Tugas "${judul}" sudah Kayla catat di database ya, semangat! ✨`;
          }
        }

        // Kembalikan chat/jawaban teks biasa dari Gemini (Curhat / Tanya Jawab biasa)
        return response.text;
      } catch (err) {
        console.error("Gemini Error:", err);
        return "Aduh maaf, otak Kayla lagi ngeblank sebentar. Coba kirim pesan lagi ya.. 🥺";
      }
    }
  }
}

module.exports = { resolveCommand, handleCommand, isWithinDay };
