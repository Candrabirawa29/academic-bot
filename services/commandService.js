const taskService = require('./taskService');
const messageBuilders = require('./messageBuilders');

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

// Rule-based matcher untuk pertanyaan natural — dicek SEBELUM anggap command tidak dikenal.
// Sengaja deterministic (bukan LLM) sesuai requirement: prioritaskan rule-based dulu.
const NATURAL_RULES = [
  { pattern: /besok.*(tugas|apa|ada)/i, command: '!besok' },
  { pattern: /(paling )?urgent/i, command: '!focus' },
  { pattern: /(harus (ngerjain|kerjain)|ngapain (sekarang|now)|kerjain apa)/i, command: '!focus' },
  { pattern: /(berapa|jumlah).*(belum selesai|belum kelar|aktif)/i, command: '!tugas' },
  { pattern: /progress/i, command: '!progress' },
  { pattern: /hari ini.*(tugas|apa|ada)/i, command: '!today' },
];

function resolveCommand(rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (lower.startsWith('!')) return lower;

  for (const rule of NATURAL_RULES) {
    if (rule.pattern.test(text)) return rule.command;
  }

  return null; // nggak dikenali — bot diam, jangan asal jawab
}

async function handleCommand(command, userId) {
  switch (command) {
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
    default:
      return null;
  }
}

module.exports = { resolveCommand, handleCommand, isWithinDay };