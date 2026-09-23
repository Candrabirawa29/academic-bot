// Context Engine — satu-satunya tempat yang menentukan "keadaan" dari sebuah task/hari.
// personalityService TIDAK BOLEH baca task mentah langsung untuk keputusan tone;
// semua keputusan lewat context yang dibangun di sini.

function getTimeOfDay(now = new Date()) {
  const hour = now.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 15) return 'afternoon';
  if (hour >= 15 && hour < 19) return 'evening';
  return 'night';
}

function getUrgencyTier(hoursLeft) {
  if (hoursLeft < 0) return 'overdue';
  if (hoursLeft <= 2) return 'urgent';
  if (hoursLeft <= 6) return 'nagging';
  if (hoursLeft <= 24) return 'concerned';
  if (hoursLeft <= 72) return 'reminder';
  return 'gentle';
}

const URGENCY_LEVEL_MAP = {
  gentle: 'low',
  reminder: 'medium',
  concerned: 'high',
  nagging: 'high',
  urgent: 'critical',
  overdue: 'critical',
};

function getTaskState(task, hoursLeft) {
  if (task.status === 'completed') return 'completed';
  if (hoursLeft < 0) return 'overdue';
  if (task.progressPercent === 0) return 'not_started';
  if (task.progressPercent >= 80) return 'almost_done';
  return 'in_progress';
}

function buildTaskContext(task, now = new Date()) {
  const deadline = new Date(task.currentDeadline);
  const hoursLeft = (deadline.getTime() - now.getTime()) / 3600000;
  const tier = getUrgencyTier(hoursLeft);

  const progressStagnant = task.progressUpdatedAt
    ? (now.getTime() - new Date(task.progressUpdatedAt).getTime()) / 86400000 >= 3
    : false;

  const preparationIncomplete = task.checklists.some(
    (c) => c.type === 'preparation_item' && !c.isChecked
  );

  return {
    time_of_day: getTimeOfDay(now),
    task_state: getTaskState(task, hoursLeft),
    urgency: URGENCY_LEVEL_MAP[tier],
    urgency_tier: tier, // versi presisi (5 tingkat), dipakai personalityService pilih variasi
    progress: task.progressPercent,
    deadline_hours_remaining: hoursLeft,
    progress_stagnant: progressStagnant,
    preparation_incomplete: preparationIncomplete,
  };
}

function buildWorkloadContext(tasks, now = new Date()) {
  const active = tasks.filter((t) => t.status !== 'completed');
  const urgentCount = active.filter((t) => {
    const hoursLeft = (new Date(t.currentDeadline).getTime() - now.getTime()) / 3600000;
    return hoursLeft <= 24;
  }).length;

  let workload = 'low';
  if (active.length >= 5 || urgentCount >= 3) workload = 'high';
  else if (active.length >= 2 || urgentCount >= 1) workload = 'medium';

  return { workload, activeCount: active.length, urgentCount };
}

module.exports = {
  getTimeOfDay,
  getUrgencyTier,
  buildTaskContext,
  buildWorkloadContext,
};