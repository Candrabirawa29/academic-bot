const apiClient = require('./apiClient');

async function hasBeenNotified(taskId, notificationType, channel = 'whatsapp') {
  try {
    const res = await apiClient.get('/api/notifications', {
      params: { taskId, type: notificationType, channel },
    });
    return Boolean(res.data?.exists);
  } catch (error) {
    console.error(`[notificationService] Gagal cek log notifikasi (${notificationType}):`, error.message);
    // Fail-safe: kalau nggak bisa cek ke backend, anggap SUDAH terkirim
    // biar nggak spam kalau API lagi down — lebih aman diam daripada dobel kirim.
    return true;
  }
}

async function markAsNotified(taskId, notificationType, channel = 'whatsapp') {
  try {
    await apiClient.post('/api/notifications', { taskId, notificationType, channel });
  } catch (error) {
    console.error(`[notificationService] Gagal mencatat log notifikasi (${notificationType}):`, error.message);
  }
}

module.exports = { hasBeenNotified, markAsNotified };