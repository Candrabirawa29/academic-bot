const apiClient = require('./apiClient');

async function getTasks(userId) {
  const res = await apiClient.get('/api/tasks', { params: { userId } });
  const data = res.data?.data;
  if (!Array.isArray(data)) {
    throw new Error('Response /api/tasks bukan array yang valid');
  }
  return data;
}

// Ranking berdasarkan Focus Score — dihitung backend, bot tidak menghitung ulang sendiri
// (satu sumber kebenaran yang sama dipakai dashboard, lihat lib/scoring.ts di academic-tracker)
async function getFocusRanking(userId) {
  const res = await apiClient.get('/api/tasks/focus', { params: { userId } });
  const data = res.data?.data;
  if (!Array.isArray(data)) {
    throw new Error('Response /api/tasks/focus bukan array yang valid');
  }
  return data;
}

module.exports = { getTasks, getFocusRanking };