const apiClient = require('./apiClient');

async function getTasks(userId) {
  const res = await apiClient.get('/api/tasks', { params: { userId } });
  const data = res.data?.data;
  if (!Array.isArray(data)) {
    throw new Error('Response /api/tasks bukan array yang valid');
  }
  return data;
}

async function getFocusRanking(userId) {
  const res = await apiClient.get('/api/tasks/focus', { params: { userId } });
  const data = res.data?.data;
  if (!Array.isArray(data)) {
    throw new Error('Response /api/tasks/focus bukan array yang valid');
  }
  return data;
}

// PENTING: nama field di sini HARUS persis sama dengan yang dibaca
// app/api/tasks/route.ts di backend. Field yang salah nama bukan error —
// backend diam-diam pakai default schema, atau (untuk checklists) crash
// kalau nggak dikirim sama sekali.
async function createTask(userId, taskData) {
  const res = await apiClient.post('/api/tasks', {
    userId,
    title: taskData.title,
    currentDeadline: taskData.currentDeadline,
    course: taskData.course || null,
    difficulty: taskData.difficulty || 'medium',
    basePriority: taskData.basePriority || 'medium',
    estimatedTimeMinutes: taskData.estimatedTimeMinutes ?? 60,
    checklists: taskData.checklists || [],
  });
  return res.data;
}

module.exports = { getTasks, getFocusRanking, createTask };