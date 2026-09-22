const taskService = require('./taskService');
const notificationService = require('./notificationService');
const whatsappService = require('./whatsappService');
const messageBuilders = require('./messageBuilders');

// Urut dari yang paling jauh ke paling dekat — dicek satu-satu,
// yang paling relevan (paling dekat yang sudah terlewati) yang dikirim.
const DEADLINE_THRESHOLDS = [
  { type: 'deadline_h3d', hours: 72 },
  { type: 'deadline_h1d', hours: 24 },
  { type: 'deadline_h3h', hours: 3 },
  { type: 'deadline_h30m', hours: 0.5 },
];

async function sendIfNotYet(taskId, notificationType, chatId, buildMessage) {
  const already = await notificationService.hasBeenNotified(taskId, notificationType);
  if (already) return;

  const sent = await whatsappService.sendMessage(chatId, buildMessage());
  if (sent) {
    await notificationService.markAsNotified(taskId, notificationType);
  }
}

async function processTask(task, chatId) {
  try {
    if (task.status === 'completed') return;

    const now = new Date();
    const deadline = new Date(task.currentDeadline);
    const hoursLeft = (deadline.getTime() - now.getTime()) / 3600000;

    // 1. Overdue — kalau sudah lewat, ini prioritas utama, skip threshold lain
    if (hoursLeft < 0) {
      await sendIfNotYet(task.id, 'overdue', chatId, () =>
        messageBuilders.buildOverdueReminder(task)
      );
      return;
    }

    // 2. Deadline thresholds — kirim satu yang paling dekat & relevan
    for (const threshold of DEADLINE_THRESHOLDS) {
      if (hoursLeft <= threshold.hours) {
        await sendIfNotYet(task.id, threshold.type, chatId, () =>
          messageBuilders.buildDeadlineReminder(task, hoursLeft)
        );
        break;
      }
    }

    // 3. Preparation reminder — barang bawaan belum siap, deadline < 24 jam
    if (hoursLeft <= 24) {
      const uncheckedPrep = task.checklists.filter(
        (c) => c.type === 'preparation_item' && !c.isChecked
      );
      if (uncheckedPrep.length > 0) {
        await sendIfNotYet(task.id, 'preparation', chatId, () =>
          messageBuilders.buildPreparationReminder(task, uncheckedPrep)
        );
      }
    }

    // 4. Progress stagnation — belum berubah 3+ hari.
    // Notification type menyertakan jumlah hari (stagnation_3d, stagnation_4d, dst)
    // supaya reminder ini nyusul lagi tiap bertambah 1 hari, bukan cuma sekali seumur hidup.
    if (task.progressUpdatedAt) {
      const daysStagnant = Math.floor(
        (now.getTime() - new Date(task.progressUpdatedAt).getTime()) / 86400000
      );
      if (daysStagnant >= 3) {
        await sendIfNotYet(task.id, `stagnation_${daysStagnant}d`, chatId, () =>
          messageBuilders.buildStagnationReminder(task, daysStagnant)
        );
      }
    }
  } catch (error) {
    // Error di satu task TIDAK BOLEH menghentikan proses task lain
    console.error(`[reminderService] Gagal memproses task ${task.id} (${task.title}):`, error.message);
  }
}

async function runReminderCycle(userId, chatId) {
  let tasks;
  try {
    tasks = await taskService.getTasks(userId);
  } catch (error) {
    console.error('[reminderService] Gagal mengambil data task, cycle dilewati:', error.message);
    return;
  }

  for (const task of tasks) {
    await processTask(task, chatId);
  }
}

module.exports = { runReminderCycle };