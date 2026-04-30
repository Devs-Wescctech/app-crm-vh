export const TEMPERATURE_RULES_KEY = 'lead_temperature_rules';

// Settings key controlling how often the backend cold-lead monitor runs.
// Stored as a plain integer in minutes. Mirrors the backend constant in
// backend/src/services/leadTemperatureMonitor.js.
export const TEMPERATURE_MONITOR_INTERVAL_KEY = 'lead_temperature_monitor_interval_minutes';

export const DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES = 60;
export const MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES = 1;
export const MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES = 24 * 60;

export function getTemperatureMonitorIntervalFromSettings(settings) {
  if (!Array.isArray(settings)) return DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES;
  const setting = settings.find(
    (s) =>
      (s.setting_key || s.settingKey) === TEMPERATURE_MONITOR_INTERVAL_KEY
  );
  if (!setting) return DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES;
  const raw = setting.setting_value ?? setting.settingValue;
  if (raw === null || raw === undefined || raw === '') {
    return DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES;
  const rounded = Math.round(n);
  if (rounded < MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES) return MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES;
  if (rounded > MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES) return MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES;
  return rounded;
}

// Settings key controlling how many days of monitor run history are kept
// before the periodic cleanup deletes older rows. Mirrors the backend constant
// in backend/src/services/leadTemperatureMonitor.js.
export const TEMPERATURE_MONITOR_RETENTION_DAYS_KEY = 'lead_temperature_monitor_retention_days';

export const DEFAULT_TEMPERATURE_MONITOR_RETENTION_DAYS = 30;
export const MIN_TEMPERATURE_MONITOR_RETENTION_DAYS = 1;
export const MAX_TEMPERATURE_MONITOR_RETENTION_DAYS = 365;

export function getTemperatureMonitorRetentionDaysFromSettings(settings) {
  if (!Array.isArray(settings)) return DEFAULT_TEMPERATURE_MONITOR_RETENTION_DAYS;
  const setting = settings.find(
    (s) =>
      (s.setting_key || s.settingKey) === TEMPERATURE_MONITOR_RETENTION_DAYS_KEY
  );
  if (!setting) return DEFAULT_TEMPERATURE_MONITOR_RETENTION_DAYS;
  const raw = setting.setting_value ?? setting.settingValue;
  if (raw === null || raw === undefined || raw === '') {
    return DEFAULT_TEMPERATURE_MONITOR_RETENTION_DAYS;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TEMPERATURE_MONITOR_RETENTION_DAYS;
  const rounded = Math.round(n);
  if (rounded < MIN_TEMPERATURE_MONITOR_RETENTION_DAYS) return MIN_TEMPERATURE_MONITOR_RETENTION_DAYS;
  if (rounded > MAX_TEMPERATURE_MONITOR_RETENTION_DAYS) return MAX_TEMPERATURE_MONITOR_RETENTION_DAYS;
  return rounded;
}

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

// Opções da temperatura manual exibidas no seletor — a ordem aqui controla
// a ordem visual no popover/menu. Inclui um "limpar" para remover a marcação.
export const MANUAL_TEMPERATURE_OPTIONS = [
  { key: 'hot', ...TEMPERATURE_META.hot },
  { key: 'warm', ...TEMPERATURE_META.warm },
  { key: 'cold', ...TEMPERATURE_META.cold },
];

// Normaliza qualquer valor vindo da API/UI para uma das chaves válidas
// ('hot' | 'warm' | 'cold') ou null. Útil para tolerar legados ou envios
// vazios sem renderizar um badge "Sem temperatura" como se fosse uma opção.
export function normalizeManualTemperature(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).toLowerCase();
  if (normalized === 'hot' || normalized === 'warm' || normalized === 'cold') {
    return normalized;
  }
  return null;
}

// Constrói o objeto de meta esperado pelo TemperatureBadge a partir de uma
// temperatura manual. Devolve null quando não há temperatura definida — o
// chamador decide se renderiza um placeholder ("Definir temperatura") ou nada.
export function buildManualTemperature(value) {
  const key = normalizeManualTemperature(value);
  if (!key) return null;
  const meta = TEMPERATURE_META[key];
  return {
    key,
    label: meta.label,
    short: meta.short,
    badgeClass: meta.badgeClass,
    softClass: meta.softClass,
    dotClass: meta.dotClass,
    days: null,
    interactions: null,
    value: null,
    triggers: {},
    manual: true,
  };
}

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

function formatBRL(value) {
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  } catch (e) {
    return `R$ ${value}`;
  }
}

function pluralDays(n) {
  return `${n} dia${n === 1 ? '' : 's'}`;
}

function pluralInteractions(n) {
  return `${n} ${n === 1 ? 'interação' : 'interações'}`;
}

export function describeTemperatureReasons(temperature, rules) {
  if (!temperature) return [];
  const safeRules = rules && rules.hot && rules.cold ? rules : mergeRules(rules);
  const triggers = temperature.triggers || {};
  const reasons = [];
  const window = safeRules.hot.interactionWindowHours || 48;

  if (triggers.hotByDays) {
    const d = temperature.days ?? 0;
    reasons.push({
      key: 'hotByDays',
      category: 'hot',
      text: `Contato há ${pluralDays(d)} (regra: ≤ ${pluralDays(safeRules.hot.maxDaysSinceContact)})`,
    });
  }
  if (triggers.hotByInteractions) {
    reasons.push({
      key: 'hotByInteractions',
      category: 'hot',
      text: `${pluralInteractions(temperature.interactions ?? 0)} nas últimas ${window}h (regra: ≥ ${safeRules.hot.minRecentInteractions})`,
    });
  }
  if (triggers.hotByValue) {
    reasons.push({
      key: 'hotByValue',
      category: 'hot',
      text: `Valor de ${formatBRL(temperature.value)} (regra: ≥ ${formatBRL(safeRules.hot.minValue)})`,
    });
  }
  if (triggers.coldByDays) {
    const d = temperature.days ?? 0;
    reasons.push({
      key: 'coldByDays',
      category: 'cold',
      text: `${pluralDays(d)} sem contato (regra: ≥ ${pluralDays(safeRules.cold.minDaysSinceContact)})`,
    });
  }
  return reasons;
}

export function describeTemperatureThresholds(rules, triggers) {
  const safeRules = rules && rules.hot && rules.cold ? rules : mergeRules(rules);
  const t = triggers || {};
  const window = safeRules.hot.interactionWindowHours || 48;
  const rows = [];

  if (safeRules.hot.maxDaysSinceContact !== null && safeRules.hot.maxDaysSinceContact !== undefined) {
    rows.push({
      key: 'hotByDays',
      category: 'hot',
      text: `Quente se contato nos últimos ${pluralDays(safeRules.hot.maxDaysSinceContact)}`,
      active: !!t.hotByDays,
    });
  }
  if (safeRules.hot.minRecentInteractions && safeRules.hot.minRecentInteractions > 0) {
    rows.push({
      key: 'hotByInteractions',
      category: 'hot',
      text: `Quente se ${safeRules.hot.minRecentInteractions}+ ${safeRules.hot.minRecentInteractions === 1 ? 'interação' : 'interações'} nas últimas ${window}h`,
      active: !!t.hotByInteractions,
    });
  }
  if (safeRules.hot.minValue && safeRules.hot.minValue > 0) {
    rows.push({
      key: 'hotByValue',
      category: 'hot',
      text: `Quente se valor ≥ ${formatBRL(safeRules.hot.minValue)}`,
      active: !!t.hotByValue,
    });
  }
  if (safeRules.cold.minDaysSinceContact !== null && safeRules.cold.minDaysSinceContact !== undefined) {
    rows.push({
      key: 'coldByDays',
      category: 'cold',
      text: `Frio após ${pluralDays(safeRules.cold.minDaysSinceContact)} sem contato`,
      active: !!t.coldByDays,
    });
  }
  return rows;
}

export function getTemperatureSummary(temperature, rules) {
  if (!temperature) return '';
  const reasons = describeTemperatureReasons(temperature, rules);
  if (reasons.length > 0) {
    return `${temperature.label}: ${reasons.map((r) => r.text).join('; ')}`;
  }
  if (temperature.key === 'warm') {
    return `${temperature.label}: nenhuma regra de quente ou frio foi atingida`;
  }
  return temperature.label;
}
