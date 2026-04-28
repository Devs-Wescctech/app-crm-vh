// Backend port of src/components/utils/temperature.js
// Keeps the temperature key/setting in sync with the frontend so we evaluate
// lead temperature using the same rules the kanban / detail page render with.

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
  } catch (_e) {
    return mergeRules(null);
  }
}

function safeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getLeadValue(lead) {
  if (!lead) return 0;
  return Number(lead.value ?? lead.monthly_value ?? 0) || 0;
}

/**
 * Compute the temperature for a single lead given its recent activities and
 * the configured rules. Mirrors computeLeadTemperature from the frontend.
 *
 * @param {object} lead       leads_pj row (snake_case columns)
 * @param {Array}  activities activities_pj rows for this lead
 * @param {object} rules      result of parseTemperatureRules
 * @param {Date}   now
 */
export function computeLeadTemperature(lead, activities, rules, now = new Date()) {
  const safeRules = rules && rules.hot && rules.cold ? rules : mergeRules(rules);
  const reference = safeDate(lead?.last_contact_at) || safeDate(lead?.created_at);
  const days = reference
    ? Math.max(0, Math.floor((now.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const windowHours = safeRules.hot.interactionWindowHours || 48;
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const leadId = String(lead?.id ?? '');

  let interactions = 0;
  if (Array.isArray(activities) && leadId) {
    for (const a of activities) {
      if (String(a.lead_id ?? '') !== leadId) continue;
      const type = String(a.type ?? '').toLowerCase();
      const isInteraction = !type || (type !== 'task' && type !== 'tarefa');
      const completed = a.completed === true || !!a.completed_at;
      if (!isInteraction && !completed) continue;
      const ts =
        safeDate(a.completed_at) ||
        safeDate(a.created_at) ||
        safeDate(a.scheduled_at);
      if (!ts) continue;
      if (ts.getTime() > now.getTime()) continue;
      if (ts < cutoff) continue;
      interactions++;
    }
  }

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

  return { key, days, interactions, value, reference };
}
