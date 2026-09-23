const taskService = require('./taskService');
const contextService = require('./contextService');
const personalityService = require('./personalityService');
const progressSnapshotService = require('./progressSnapshotService');
const whatsappService = require('./whatsappService');
const messageBuilders = require('./messageBuilders'); // reuse formatDeadline
const variations = require('./messageVariations');

function isWithinDay(dateStr, dayOffset, now = new Date()) {
  const target = new Date(dateStr);
  const start = new Date(now);
  start.setDate(now.getDate() + dayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return target >= start && target < end;
}

async function sendMorningBriefing(userId, chatId) {
  if (!personalityService.ENABLED.morningBriefing) return;

  const now = new Date();
  const tasks = await taskService.getTasks(userId);
  const ranked = await taskService.getFocusRanking(userId);

  // Ambil snapshot progress SEKARANG, buat dibandingin lagi di night briefing nanti
  progressSnapshotService.captureSnapshot(tasks);

  const todayTasks = tasks.filter(
    (t) => isWithinDay(t.currentDeadline, 0, now) && t.status !== 'completed'
  );
  const focusTask = ranked[0];
  const workloadCtx = contextService.buildWorkloadContext(tasks, now);

  const uncheckedTodayPrep = todayTasks.flatMap((t) =>
    t.checklists.filter((c) => c.type === 'preparation_item' && !c.isChecked)
  );

  let msg = `${personalityService.pickIntro(variations.morningIntros)}\n\n`;

  if (todayTasks.length > 0) {
    msg += `Hari ini ada ${todayTasks.length} agenda:\n`;
    todayTasks.forEach((t) => {
      msg += `${messageBuilders.formatDeadline(t.currentDeadline)} — ${t.title}${
        t.course ? ` (${t.course})` : ''
      }\n`;
    });
    msg += `\n`;
  }

  if (focusTask && focusTask.focusScore > 0) {
    const hoursLeft = Math.max(
      0,
      Math.round((new Date(focusTask.currentDeadline).getTime() - now.getTime()) / 3600000)
    );
    msg += `🔥 Yang perlu diperhatikan:\n${focusTask.title} — deadline ${hoursLeft} jam lagi.\n\n`;
  }

  if (uncheckedTodayPrep.length > 0) {
    msg += `🎒 Sebelum berangkat:\n${uncheckedTodayPrep.map((i) => `☐ ${i.title}`).join('\n')}\n\n`;
  }

  const affirmation = personalityService.pickAffirmation(
    workloadCtx.workload === 'high' ? 'highWorkload' : 'lowWorkload'
  );
  if (affirmation) {
    msg += `🌱 Reminder hari ini:\n${affirmation}\n\nSemangat ya. 🤍`;
  }

  await whatsappService.sendMessage(chatId, msg.trim());
}

async function sendNightBriefing(userId, chatId) {
  if (!personalityService.ENABLED.nightBriefing) return;

  const now = new Date();
  const tasks = await taskService.getTasks(userId);
  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const tomorrowTasks = activeTasks.filter((t) => isWithinDay(t.currentDeadline, 1, now));

  const nothingUrgentSoon =
    activeTasks.length === 0 ||
    activeTasks.every((t) => new Date(t.currentDeadline).getTime() - now.getTime() > 86400000 * 2);

  if (tomorrowTasks.length === 0 && nothingUrgentSoon) {
    await whatsappService.sendMessage(chatId, personalityService.pickIntro(variations.nightIntrosAllSafe));
    return;
  }

  let msg = `${personalityService.pickIntro(variations.nightIntros)}\n\n`;

  if (tomorrowTasks.length > 0) {
    msg += `Besok:\n`;
    tomorrowTasks.forEach((t) => {
      msg += `${messageBuilders.formatDeadline(t.currentDeadline)} — ${t.title}\n`;
      const prep = t.checklists.filter((c) => c.type === 'preparation_item' && !c.isChecked);
      if (prep.length > 0) {
        msg += `🎒 Jangan lupa:\n${prep.map((i) => `☐ ${i.title}`).join('\n')}\n`;
      }
    });
    msg += `\n`;
  } else {
    msg += `Besok nggak ada deadline yang deket.\n\n`;
  }

  // Best-effort — kalau snapshot pagi ini nggak ada (bot sempat restart), baris ini di-skip
  const progressLines = activeTasks
    .map((t) => {
      const delta = progressSnapshotService.getDelta(t);
      if (!delta) return null;
      return `Progress ${t.title} naik dari ${delta.from}% → ${delta.to}%.`;
    })
    .filter(Boolean);

  if (progressLines.length > 0) {
    msg += `${progressLines.join('\n')}\nGood job. 🤍\n\n`;
  }

  msg += `Sekarang istirahat dulu. Besok kita lanjut lagi.`;

  await whatsappService.sendMessage(chatId, msg.trim());
}

module.exports = { sendMorningBriefing, sendNightBriefing };