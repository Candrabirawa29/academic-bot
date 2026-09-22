const TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';

function formatDeadline(deadlineStr) {
  return new Date(deadlineStr).toLocaleString('id-ID', {
    timeZone: TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: false,
  });
}

function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} menit`;
  if (rest === 0) return `${hours} jam`;
  return `${hours} jam ${rest} menit`;
}

function remainingMinutes(task) {
  return task.estimatedTimeMinutes * (1 - task.progressPercent / 100);
}

function buildDeadlineReminder(task, hoursLeft) {
  const label = hoursLeft <= 3 ? 'DEADLINE WARNING' : 'Reminder Deadline';
  const sisaWaktu = hoursLeft < 1 ? `${Math.round(hoursLeft * 60)} menit` : `${Math.round(hoursLeft)} jam`;

  let msg = `⚠️ *${label}*\n\n`;
  msg += `*${task.title}*\n`;
  msg += `⏰ Tinggal ${sisaWaktu}\n`;
  msg += `📊 Progress ${task.progressPercent}%\n`;
  msg += `⏱ Estimasi sisa: ~${formatMinutes(remainingMinutes(task))}\n\n`;
  msg += `Gas sekarang supaya nggak mepet.`;
  return msg;
}

function buildOverdueReminder(task) {
  let msg = `🚨 *TASK OVERDUE*\n\n`;
  msg += `*${task.title}*\n`;
  msg += `Deadline sudah lewat (${formatDeadline(task.currentDeadline)}).\n\n`;
  msg += `Status sekarang: ${task.status.replace('_', ' ')}.\n\n`;
  msg += `Mau reschedule?`;
  return msg;
}

function buildPreparationReminder(task, uncheckedItems) {
  let msg = `🎒 *REMINDER BESOK*\n\n`;
  msg += `Besok ada *${task.title}*`;
  msg += task.course ? ` (${task.course})` : '';
  msg += ` — ${formatDeadline(task.currentDeadline)}\n\n`;
  msg += `Jangan sampai kejadian kelupaan lagi:\n`;
  msg += uncheckedItems.map((i) => `☐ ${i.title}`).join('\n');
  return msg;
}

function buildStagnationReminder(task, daysStagnant) {
  let msg = `👀 *PROGRESS STAGNAN*\n\n`;
  msg += `Progress *${task.title}* masih ${task.progressPercent}% sejak ${daysStagnant} hari lalu.\n\n`;
  msg += `Deadline: ${formatDeadline(task.currentDeadline)}`;
  return msg;
}

function buildFocusReminder(scoredTask) {
  let msg = `🔥 *FOCUS NOW*\n\n`;
  msg += `*${scoredTask.title}*\n\n`;
  msg += `Progress: ${scoredTask.progressPercent}%\n`;
  msg += `Deadline: ${formatDeadline(scoredTask.currentDeadline)}\n`;
  msg += `Remaining work: ~${formatMinutes(remainingMinutes(scoredTask))}\n`;
  msg += `Priority: ${scoredTask.basePriority}\n\n`;
  if (scoredTask.focusReasons?.length) {
    msg += `Kenapa ini?\n${scoredTask.focusReasons.join('\n')}\n\n`;
  }
  msg += `👉 Gas kerjain ini dulu.`;
  return msg;
}

function buildTaskSummary(rankedTasks) {
  const buckets = { critical: 0, high: 0, medium: 0, low: 0 };
  rankedTasks.forEach((t) => {
    if (t.focusScore >= 90) buckets.critical++;
    else if (t.focusScore >= 60) buckets.high++;
    else if (t.focusScore >= 30) buckets.medium++;
    else buckets.low++;
  });

  let msg = `📚 *TUGAS LO*\n\n`;
  msg += `🔴 Critical: ${buckets.critical}\n`;
  msg += `🟠 High: ${buckets.high}\n`;
  msg += `🟡 Medium: ${buckets.medium}\n`;
  msg += `🟢 Low: ${buckets.low}\n\n`;
  msg += `Total aktif: ${rankedTasks.length}\n`;

  const top = rankedTasks.slice(0, 3);
  if (top.length > 0) {
    msg += `\nPaling urgent:\n`;
    top.forEach((t, i) => {
      msg += `${i + 1}. ${t.title} (${formatDeadline(t.currentDeadline)})\n`;
    });
  }

  return msg.trim();
}

function buildProgressSummary(tasks) {
  const now = new Date();
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const late = tasks.filter((t) => t.status !== 'completed' && new Date(t.currentDeadline) < now).length;
  const inProgress = tasks.length - completed - late;
  const overall = tasks.length
    ? Math.round(tasks.reduce((sum, t) => sum + t.progressPercent, 0) / tasks.length)
    : 0;

  let msg = `📊 *PROGRESS*\n\n`;
  msg += `Completed: ${completed}\n`;
  msg += `In Progress: ${inProgress}\n`;
  msg += `Late: ${late}\n\n`;
  msg += `Overall completion: ${overall}%`;
  return msg;
}

function buildAgendaSummary(tasks, title = 'BESOK') {
  if (tasks.length === 0) {
    return `📅 *${title}*\n\nNggak ada deadline. Santai dulu! 🎉`;
  }

  let msg = `📅 *${title}*\n\n`;
  tasks.forEach((t) => {
    msg += `${formatDeadline(t.currentDeadline)} — *${t.title}*`;
    msg += t.course ? ` (${t.course})` : '';
    msg += `\n`;
    const prep = t.checklists.filter((c) => c.type === 'preparation_item');
    if (prep.length > 0) {
      msg += `🎒 Bawa:\n`;
      prep.forEach((p) => {
        msg += `${p.isChecked ? '☑' : '☐'} ${p.title}\n`;
      });
    }
    msg += `\n`;
  });
  return msg.trim();
}

function buildDailySummary(tasksTomorrow) {
  return buildAgendaSummary(tasksTomorrow, 'RINGKASAN BESOK (malam ini)');
}

function buildHelp() {
  return (
    `🤖 *ACADEMIC ASSISTANT — COMMAND LIST*\n\n` +
    `!tugas — Ringkasan semua tugas aktif\n` +
    `!focus — Tugas yang paling perlu dikerjain sekarang\n` +
    `!besok — Deadline & barang bawaan besok\n` +
    `!today — Agenda hari ini\n` +
    `!progress — Ringkasan progress keseluruhan\n` +
    `!help — Tampilkan pesan ini\n\n` +
    `Bisa juga tanya natural kayak "yang paling urgent apa?" atau "besok ada tugas apa?"`
  );
}

module.exports = {
  formatDeadline,
  formatMinutes,
  buildDeadlineReminder,
  buildOverdueReminder,
  buildPreparationReminder,
  buildStagnationReminder,
  buildFocusReminder,
  buildTaskSummary,
  buildProgressSummary,
  buildAgendaSummary,
  buildDailySummary,
  buildHelp,
};