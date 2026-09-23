// Semua variasi pesan personality. Dipisah dari logic (personalityService.js)
// biar nambah/ubah nada bicara bot nggak perlu sentuh reminderService atau briefingService.

const morningIntros = [
  '☀️ Good morning!',
  '☀️ Pagi! Yuk mulai hari ini.',
  '🌅 Morning! Siap-siap ya.',
];

const nightIntros = [
  '🌙 Good night.',
  '🌙 Malam! Sebelum tidur, ini ringkasan hari ini.',
];

const nightIntrosAllSafe = [
  '🌙 Good night!\nHari ini semua tugas aman.\nBesok nggak ada yang perlu dikejar.\nYou did enough today. 🤍\nSekarang waktunya istirahat.',
  '🌙 Semua beres hari ini. Nggak ada yang nyusul buat besok.\nRest well, you earned it. 🤍',
];

// Tiap fungsi nerima (task, hoursLeft) dan return string — biar bisa interpolasi data task
const gentleMessages = [
  (t) => `Masih ada waktu kok buat *${t.title}*. Kalau mulai sedikit hari ini, nanti nggak perlu kebut.`,
  (t) => `*${t.title}* deadline-nya masih agak jauh. Nggak perlu buru-buru, tapi boleh dicicil pelan-pelan.`,
];

const reminderMessages = [
  (t, h) => `👀 Hmm... deadline *${t.title}* mulai dekat nih (~${Math.round(h / 24)} hari lagi). Jangan sampai nanti harus lembur.`,
  (t, h) => `📌 *${t.title}* tinggal beberapa hari lagi. Progress sekarang ${t.progressPercent}% — gimana kalau dilanjut sedikit hari ini?`,
];

const concernedMessages = [
  (t, h) => `😭 Progress *${t.title}* masih ${t.progressPercent}% dan deadline tinggal ${Math.round(h)} jam.`,
  (t, h) => `⚠️ *${t.title}* — sisa ${Math.round(h)} jam, progress ${t.progressPercent}%. Yuk mulai fokus ke sini.`,
];

const naggingMessages = [
  (t, h) =>
    `😭 Kita perlu ngomong.\nKemarin *${t.title}* masih santai banget.\nSekarang tinggal ${Math.round(h)} jam.\nUdah, buka dulu. Kita kerjain sedikit-sedikit.`,
  (t, h) =>
    `😅 *${t.title}* nih... ${Math.round(h)} jam lagi dan progress baru ${t.progressPercent}%.\nGas dikit-dikit, nggak usah kebanyakan mikir.`,
];

const urgentMessagesFn = (name) => {
  const call = name ? `WOI ${name.toUpperCase()}` : 'WOI';
  return [
    (t, h) =>
      `🚨 ${call}.\n${Math.round(h)} JAM LAGI.\nNggak usah panik. Tutup yang nggak penting.\nSekarang fokus ke bagian paling wajib selesai untuk *${t.title}*.\nGAS.`,
    (t, h) =>
      `🚨 *${t.title}* — ${Math.round(h)} jam lagi!\nStop scroll, buka tugasnya sekarang. Kerjain bagian paling penting dulu.`,
  ];
};

const overdueMessages = [
  (t) => `🚨 *${t.title}* deadline-nya udah lewat.\nYang sudah lewat nggak bisa diubah. Yang bisa kita lakukan sekarang adalah menyelesaikannya.`,
  (t) => `😮‍💨 *${t.title}* overdue. Nggak apa, langsung lanjut aja dari sini — mau reschedule atau kejar sekarang?`,
];

const preparationMessages = [
  (t, items) =>
    `🎒 Besok ada *${t.title}*. Jangan sampai kejadian kelupaan lagi:\n${items.map((i) => `☐ ${i.title}`).join('\n')}`,
  (t, items) =>
    `🎒 Reminder barang bawaan buat *${t.title}*:\n${items.map((i) => `☐ ${i.title}`).join('\n')}\nSiapin dari sekarang ya.`,
];

const stagnationMessages = [
  (t, days) => `👀 Progress *${t.title}* masih ${t.progressPercent}% sejak ${days} hari lalu.\nDeadline makin deket lho.`,
  (t, days) => `Hmm, *${t.title}* kayaknya belum kesentuh ${days} hari terakhir. Mau lanjut sekarang?`,
];

const praiseEarlyMessages = [
  (t) => `🎉 WOAH.\nSelesai padahal deadline masih jauh.\nKali ini gercep banget 😭\nProud of you. 🤍\nSatu beban hilang.`,
  (t) => `🎉 *${t.title}* kelar duluan sebelum deadline! Keren banget nih konsistensinya. 🤍`,
];

const praiseOnTimeMessages = [
  (t) =>
    `🎉 DONE! *${t.title}* selesai, deadline aman.\nGood job.\nYou started it, worked through it, and finished it.\nOne less thing to worry about. 🤍`,
  (t) => `✅ *${t.title}* kelar tepat waktu. Solid. 🤍`,
];

const praiseLateMessages = [
  (t) =>
    `😭 Akhirnya *${t.title}* selesai juga.\nMemang sempat lewat deadline, tapi sekarang sudah beres.\nNext time kita coba mulai sedikit lebih awal ya.\nTapi tetap: You finished it. Good job. 🤍`,
  (t) => `*${t.title}* kelar, walau agak molor dari deadline. Yang penting selesai — good job udah nuntasin. 🤍`,
];

const affirmations = {
  lowWorkload: [
    'Nggak apa-apa kalau hari ini berjalan lebih pelan. Konsisten lebih penting daripada buru-buru.',
    'Hari ini santai — nikmatin aja, nggak semua hari harus ngebut.',
  ],
  highWorkload: [
    'Jangan lihat semua tugas sekaligus. Satu tugas dulu. Satu langkah dulu.',
    'Banyak, tapi bisa dicicil. Fokus ke satu yang paling urgent dulu.',
  ],
  lateTask: [
    'Yang sudah lewat nggak bisa diubah. Yang bisa kita lakukan sekarang adalah menyelesaikannya.',
    'Nggak perlu nyesel — mending energinya dipakai buat nyelesain sekarang.',
  ],
  // Belum dipakai otomatis — belum ada data aktivitas historis (lihat catatan streak di ringkasan akhir)
  streak: [
    'Lo konsisten beberapa hari terakhir. Keep going.',
    'Progress-nya jalan terus nih beberapa hari ini. Mantap.',
  ],
};

module.exports = {
  morningIntros,
  nightIntros,
  nightIntrosAllSafe,
  gentleMessages,
  reminderMessages,
  concernedMessages,
  naggingMessages,
  urgentMessagesFn,
  overdueMessages,
  preparationMessages,
  stagnationMessages,
  praiseEarlyMessages,
  praiseOnTimeMessages,
  praiseLateMessages,
  affirmations,
};