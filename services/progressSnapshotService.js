// Snapshot progress task, in-memory — dipakai buat baris "progress naik dari X% ke Y%"
// di night briefing.
//
// PENTING — INI BUKAN PERSISTEN: kalau proses bot restart di antara morning briefing
// dan night briefing (misal karena redeploy), snapshot ini hilang dan baris delta
// di night briefing hari itu otomatis di-skip (briefing tetap terkirim, cuma tanpa
// baris progress). Untuk data historis yang tahan restart, perlu tabel snapshot
// harian di backend — belum dibuat di iterasi ini.

const snapshots = new Map(); // taskId -> { progress, capturedAt }

function captureSnapshot(tasks) {
  const now = new Date();
  tasks.forEach((t) => {
    snapshots.set(t.id, { progress: t.progressPercent, capturedAt: now });
  });
}

function getDelta(task) {
  const snap = snapshots.get(task.id);
  if (!snap) return null;
  if (snap.progress === task.progressPercent) return null;
  return { from: snap.progress, to: task.progressPercent };
}

module.exports = { captureSnapshot, getDelta };