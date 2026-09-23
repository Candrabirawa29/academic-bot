const taskService = require('./taskService');
const notificationService = require('./notificationService');
const whatsappService = require('./whatsappService');
const contextService = require('./contextService');
const personalityService = require('./personalityService');

async function sendIfNotYet(taskId, notificationType, chatId, buildMessage) {
  const already = await notificationService.hasBeenNotified(taskId, notificationType);
  if (already) return;

  const message = buildMessage();
  if (!message) return; // personality bisa return null kalau fitur terkait dimatiin config

  const sent = await whatsappService.sendMessage(chatId, message);
  if (sent) {
    await notificationService.markAsNotified(taskId, notificationType);
  }
}

async function processTask(task, chatId) {
  try {
    const now = new Date();

    // Completion praise — sekali per task, begitu status kedeteksi completed.
    // Ditaruh paling atas: task yang udah selesai nggak perlu dicek deadline/stagnation lagi.
    if (task.status === 'completed') {
      await sendIfNotYet(task.id, 'completion_praise', chatId, () =>
        personalityService.generateCompletionMessage(task)
      );
      return;
    }

    const context = contextService.buildTaskContext(task, now);
    const hoursLeft = context.deadline_hours_remaining;

    // 1. Overdue — prioritas utama, skip tier deadline lain
    if (hoursLeft < 0) {
      await sendIfNotYet(task.id, 'overdue', chatId, () =>
        personalityService.generateOverdueMessage(task)
      );
      return;
    }

    // 2. Deadline tier: gentle → reminder → concerned → nagging → urgent.
    // Satu kali kirim per tier per task (dedup key menyertakan nama tier).
    await sendIfNotYet(task.id, `deadline_tier_${context.urgency_tier}`, chatId, () =>
      personalityService.generateDeadlineMessage(context, task)
    );

    // 3. Preparation reminder — barang bawaan belum siap, deadline <= 24 jam
    if (hoursLeft <= 24) {
      const uncheckedPrep = task.checklists.filter(
        (c) => c.type === 'preparation_item' && !c.isChecked
      );
      if (uncheckedPrep.length > 0) {
        await sendIfNotYet(task.id, 'preparation', chatId, () =>
          personalityService.generatePreparationMessage(task, uncheckedPrep)
        );
      }
    }

    // 4. Progress stagnation — dedup key menyertakan jumlah hari, jadi nyusul
    // tiap bertambah 1 hari, bukan cuma sekali seumur hidup.
    if (context.progress_stagnant) {
      const daysStagnant = Math.floor(
        (now.getTime() - new Date(task.progressUpdatedAt).getTime()) / 86400000
      );
      await sendIfNotYet(task.id, `stagnation_${daysStagnant}d`, chatId, () =>
        personalityService.generateStagnationMessage(task, daysStagnant)
      );
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