// Personality Engine — terima context (dari contextService), keluarin STRING pesan.
// SENGAJA tidak import whatsappService apapun — supaya nanti bisa dipakai ulang
// oleh channel lain (desktop companion, web) tanpa modifikasi, sesuai arsitektur yang diminta.

const variations = require('./messageVariations');

const STYLE = (process.env.PERSONALITY_STYLE || 'playful').toLowerCase(); // gentle | playful | energetic

const ENABLED = {
  personality: process.env.PERSONALITY_ENABLED !== 'false',
  morningBriefing: process.env.MORNING_BRIEFING_ENABLED !== 'false',
  nightBriefing: process.env.NIGHT_BRIEFING_ENABLED !== 'false',
  affirmation: process.env.AFFIRMATION_ENABLED !== 'false',
  nagging: process.env.NAGGING_ENABLED !== 'false',
  praise: process.env.PRAISE_ENABLED !== 'false',
};

const DISPLAY_NAME = process.env.DISPLAY_NAME || '';

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function generateDeadlineMessage(context, task) {
  if (!ENABLED.personality) return null;

  const tier = context.urgency_tier;
  const h = context.deadline_hours_remaining;

  const tierMap = {
    gentle: variations.gentleMessages,
    reminder: variations.reminderMessages,
    concerned: variations.concernedMessages,
    nagging: variations.naggingMessages,
    urgent: variations.urgentMessagesFn(DISPLAY_NAME),
  };

  const pool = tierMap[tier];
  if (!pool) return null; // tier "overdue" ditangani terpisah lewat generateOverdueMessage

  // Kalau nagging dimatiin dari config, tetap kasih versi "concerned" biar nggak diam total
  if (!ENABLED.nagging && (tier === 'nagging' || tier === 'urgent')) {
    return pick(variations.concernedMessages)(task, h);
  }

  return pick(pool)(task, h);
}

function generateOverdueMessage(task) {
  if (!ENABLED.personality) return null;
  return pick(variations.overdueMessages)(task);
}

function generatePreparationMessage(task, uncheckedItems) {
  if (!ENABLED.personality) return null;
  return pick(variations.preparationMessages)(task, uncheckedItems);
}

function generateStagnationMessage(task, days) {
  if (!ENABLED.personality) return null;
  return pick(variations.stagnationMessages)(task, days);
}

// early / on-time / late ditentukan dari selisih completedAt vs currentDeadline
function generateCompletionMessage(task) {
  if (!ENABLED.praise) return null;

  const deadline = new Date(task.currentDeadline);
  const completedAt = task.completedAt ? new Date(task.completedAt) : new Date();
  const marginHours = (deadline.getTime() - completedAt.getTime()) / 3600000;

  if (marginHours < 0) return pick(variations.praiseLateMessages)(task);
  if (marginHours >= 24) return pick(variations.praiseEarlyMessages)(task);
  return pick(variations.praiseOnTimeMessages)(task);
}

function pickAffirmation(type) {
  if (!ENABLED.affirmation) return null;
  const pool = variations.affirmations[type];
  if (!pool) return null;
  return pick(pool);
}

function pickIntro(pool) {
  return pick(pool);
}

module.exports = {
  STYLE,
  ENABLED,
  generateDeadlineMessage,
  generateOverdueMessage,
  generatePreparationMessage,
  generateStagnationMessage,
  generateCompletionMessage,
  pickAffirmation,
  pickIntro,
};