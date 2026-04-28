export const TEMPERATURE_RULES_KEY = 'lead_temperature_rules';

export const DEFAULT_TEMPERATURE_RULES = {
  hot: {
    maxDaysSinceContact: 2,
    minRecentInteractions: 3,
    interactionWindowHours: 48,
    minValue: null,
  },
  cold: {
    minDaysSinceContact: 7,
  },
};

export const TEMPERATURE_META = {
  hot: {
    key: 'hot',
    label: 'Quente',
    short: 'Q',
    badgeClass:
      'bg-gradient-to-r from-red-500 to-orange-500 text-white',
    softClass:
      'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    dotClass: 'bg-red-500',
  },
  warm: {
    key: 'warm',
    label: 'Morno',
    short: 'M',
    badgeClass:
      'bg-gradient-to-r from-yellow-400 to-amber-500 text-white',
    softClass:
      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    dotClass: 'bg-amber-500',
  },
  cold: {
    key: 'cold',
    label: 'Frio',
    short: 'F',
    badgeClass:
      'bg-gradient-to-r from-blue-400 to-cyan-500 text-white',
    softClass:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    dotClass: 'bg-blue-500',
  },
};

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

function mergeRules(custom) {
  const safe = custom && typeof custom === 'object' ? custom : {};
  const hot = { ...DEFAULT_TEMPERATURE_RULES.hot, ...(safe.hot || {}) };
  const cold = { ...DEFAULT_TEMPERATURE_RULES.cold, ...(safe.cold || {}) };
  return {
    hot: {
      maxDaysSinceContact: toNumberOrNull(hot.maxDaysSinceContact),
      minRecentInteractions: toNumberOrNull(hot.minRecentInteractions),
      interactionWindowHours: toNumberOrNull(hot.interactionWindowHours) ?? 48,
      minValue: toNumberOrNull(hot.minValue),
    },
    cold: {
      minDaysSinceContact: toNumberOrNull(cold.minDaysSinceContact),
    },
  };
}

export function parseTemperatureRules(settingValue) {
  if (!settingValue) return mergeRules(null);
  if (typeof settingValue === 'object') return mergeRules(settingValue);
  try {
    const parsed = JSON.parse(settingValue);
    return mergeRules(parsed);
  } catch (e) {
    return mergeRules(null);
  }
}

export function getTemperatureRulesFromSettings(settings) {
  if (!Array.isArray(settings)) return mergeRules(null);
  const setting = settings.find(
    (s) =>
      (s.setting_key || s.settingKey) === TEMPERATURE_RULES_KEY
  );
  if (!setting) return mergeRules(null);
  return parseTemperatureRules(setting.setting_value ?? setting.settingValue);
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getLeadValue(lead) {
  if (!lead) return 0;
  return Number(
    lead.value ?? lead.monthly_value ?? lead.monthlyValue ?? 0
  ) || 0;
}

function getLeadId(lead) {
  return lead?.id ?? lead?._id ?? null;
}

function getActivityLeadId(activity) {
  return activity?.lead_id ?? activity?.leadId ?? null;
}

function getActivityEffectiveTimestamp(activity) {
  const completedAt = safeDate(activity?.completed_at ?? activity?.completedAt);
  if (completedAt) return completedAt;
  const createdAt = safeDate(activity?.created_at ?? activity?.createdAt);
  if (createdAt) return createdAt;
  const scheduledAt = safeDate(activity?.scheduled_at ?? activity?.scheduledAt);
  return scheduledAt;
}

function isActivityCompleted(activity) {
  if (!activity) return false;
  if (activity.completed === true) return true;
  if (activity.completed_at || activity.completedAt) return true;
  return false;
}

function isInteractionType(activity) {
  if (!activity) return false;
  const type = String(activity.type ?? activity.activity_type ?? '').toLowerCase();
  if (!type) return true;
  return type !== 'task' && type !== 'tarefa';
}

export function countRecentInteractions(lead, activities, windowHours, now = new Date()) {
  if (!Array.isArray(activities) || activities.length === 0) return 0;
  const window = Number(windowHours) || 48;
  const nowMs = now.getTime();
  const cutoff = new Date(nowMs - window * 60 * 60 * 1000);
  const id = String(getLeadId(lead) ?? '');
  if (!id) return 0;
  let count = 0;
  for (const a of activities) {
    if (String(getActivityLeadId(a)) !== id) continue;
    if (!isInteractionType(a) && !isActivityCompleted(a)) continue;
    const ts = getActivityEffectiveTimestamp(a);
    if (!ts) continue;
    if (ts.getTime() > nowMs) continue;
    if (ts < cutoff) continue;
    count++;
  }
  return count;
}

export function computeLeadTemperature(lead, activities, rules, now = new Date()) {
  const safeRules = rules && rules.hot && rules.cold ? rules : mergeRules(rules);
  const reference = safeDate(lead?.last_contact_at ?? lead?.lastContactAt) ||
    safeDate(lead?.created_at ?? lead?.createdAt ?? lead?.createdDate);
  const days = reference
    ? Math.max(0, Math.floor((now - reference) / (1000 * 60 * 60 * 24)))
    : null;

  const window = safeRules.hot.interactionWindowHours || 48;
  const interactions = countRecentInteractions(lead, activities, window, now);
  const value = getLeadValue(lead);

  const hotRule = safeRules.hot;
  const coldRule = safeRules.cold;

  const hotByDays =
    hotRule.maxDaysSinceContact !== null && days !== null && days <= hotRule.maxDaysSinceContact;
  const hotByInteractions =
    hotRule.minRecentInteractions !== null && hotRule.minRecentInteractions > 0 &&
    interactions >= hotRule.minRecentInteractions;
  const hotByValue =
    hotRule.minValue !== null && hotRule.minValue > 0 && value >= hotRule.minValue;

  const isHot = hotByDays || hotByInteractions || hotByValue;

  const coldByDays =
    coldRule.minDaysSinceContact !== null && days !== null && days >= coldRule.minDaysSinceContact;

  let key;
  if (isHot) key = 'hot';
  else if (coldByDays) key = 'cold';
  else key = 'warm';

  const meta = TEMPERATURE_META[key];

  return {
    key,
    label: meta.label,
    short: meta.short,
    badgeClass: meta.badgeClass,
    softClass: meta.softClass,
    dotClass: meta.dotClass,
    days,
    interactions,
    value,
    triggers: {
      hotByDays,
      hotByInteractions,
      hotByValue,
      coldByDays,
    },
  };
}
