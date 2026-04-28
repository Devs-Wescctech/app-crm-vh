import { query } from '../config/database.js';
import {
  TEMPERATURE_RULES_KEY,
  parseTemperatureRules,
  computeLeadTemperature,
} from '../utils/temperature.js';
import {
  createNotification,
  getNotificationChannelPrefs,
  sendNotificationEmail,
  sendPushNotification,
} from './notificationService.js';

const NOTIF_TYPE_COLD = 'lead_pj_cold';
const NOTIF_TYPE_HOT = 'lead_pj_hot';

// Settings key admins use to control how often the cold-lead monitor runs.
// Stored as a plain integer (minutes). See loadMonitorIntervalMinutes for the
// accepted range and defaults.
export const MONITOR_INTERVAL_KEY = 'lead_temperature_monitor_interval_minutes';

// Default cadence when the setting is missing/invalid: once an hour.
export const DEFAULT_MONITOR_INTERVAL_MINUTES = 60;

// Guardrails so a typo in Settings can't pin the loop to 1ms or push it out
// past a week. 1 minute lower bound keeps the database load sane; 1 day upper
// bound keeps the monitor responsive enough to be useful.
export const MIN_MONITOR_INTERVAL_MINUTES = 1;
export const MAX_MONITOR_INTERVAL_MINUTES = 24 * 60;

export function normalizeMonitorIntervalMinutes(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_MONITOR_INTERVAL_MINUTES;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MONITOR_INTERVAL_MINUTES;
  const rounded = Math.round(n);
  if (rounded < MIN_MONITOR_INTERVAL_MINUTES) return MIN_MONITOR_INTERVAL_MINUTES;
  if (rounded > MAX_MONITOR_INTERVAL_MINUTES) return MAX_MONITOR_INTERVAL_MINUTES;
  return rounded;
}

export async function loadMonitorIntervalMinutes() {
  try {
    const result = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`,
      [MONITOR_INTERVAL_KEY]
    );
    if (result.rows.length === 0) return DEFAULT_MONITOR_INTERVAL_MINUTES;
    return normalizeMonitorIntervalMinutes(result.rows[0].setting_value);
  } catch (err) {
    console.error('[Lead Temperature] Falha ao ler cadência configurada:', err.message);
    return DEFAULT_MONITOR_INTERVAL_MINUTES;
  }
}

// Settings key admins use to control how long monitor-run summaries are kept
// in `lead_temperature_monitor_runs`. Stored as a plain integer (days). See
// loadMonitorRetentionDays for the accepted range and defaults.
export const MONITOR_RETENTION_DAYS_KEY = 'lead_temperature_monitor_retention_days';

// Default retention: 30 days. Even at the 1-minute cadence this keeps the
// table at ~43k rows, well within what a single indexed DELETE can handle.
export const DEFAULT_MONITOR_RETENTION_DAYS = 30;

// Guardrails so a typo in Settings can't drop history within minutes or let
// it grow unbounded. 1 day lower bound preserves at least a day of debugging
// context; 365 day upper bound keeps the table from growing without limit.
export const MIN_MONITOR_RETENTION_DAYS = 1;
export const MAX_MONITOR_RETENTION_DAYS = 365;

export function normalizeMonitorRetentionDays(value) {
  if (value === null || value === undefined || value === '') {
    return DEFAULT_MONITOR_RETENTION_DAYS;
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_MONITOR_RETENTION_DAYS;
  const rounded = Math.round(n);
  if (rounded < MIN_MONITOR_RETENTION_DAYS) return MIN_MONITOR_RETENTION_DAYS;
  if (rounded > MAX_MONITOR_RETENTION_DAYS) return MAX_MONITOR_RETENTION_DAYS;
  return rounded;
}

export async function loadMonitorRetentionDays() {
  try {
    const result = await query(
      `SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`,
      [MONITOR_RETENTION_DAYS_KEY]
    );
    if (result.rows.length === 0) return DEFAULT_MONITOR_RETENTION_DAYS;
    return normalizeMonitorRetentionDays(result.rows[0].setting_value);
  } catch (err) {
    console.error('[Lead Temperature] Falha ao ler retenção do histórico:', err.message);
    return DEFAULT_MONITOR_RETENTION_DAYS;
  }
}

async function loadTemperatureRules() {
  const result = await query(
    `SELECT setting_value FROM system_settings WHERE setting_key = $1 LIMIT 1`,
    [TEMPERATURE_RULES_KEY]
  );
  if (result.rows.length === 0) return parseTemperatureRules(null);
  return parseTemperatureRules(result.rows[0].setting_value);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildAlertEmailHtml({ title, message, link }) {
  const baseUrl = (process.env.APP_BASE_URL || '').replace(/\/+$/, '');
  const fullLink = link ? (baseUrl ? `${baseUrl}${link}` : link) : null;
  const ctaHtml = fullLink
    ? `<p style="margin:24px 0;"><a href="${escapeHtml(fullLink)}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-family:Arial,sans-serif;font-size:14px;">Abrir lead</a></p>`
    : '';
  return `<div style="font-family:Arial,sans-serif;color:#0f172a;max-width:560px;">
  <h2 style="margin:0 0 12px;font-size:18px;">${escapeHtml(title)}</h2>
  <p style="margin:0;font-size:14px;line-height:1.5;">${escapeHtml(message)}</p>
  ${ctaHtml}
  <p style="margin:24px 0 0;font-size:12px;color:#64748b;">Você está recebendo este e-mail porque a notificação por e-mail está ativada nas suas preferências.</p>
</div>`;
}

/**
 * Fan an alert out across the channels the recipient has enabled. The in-app
 * notification row is the dedupe ledger — it is always inserted when at least
 * one channel is on, even if the user disabled the in-app preference (in that
 * case `in_app_visible` is set to false so the bell hides it). This way the
 * dedupe queries below stay correct regardless of which channels delivered.
 */
async function deliverAlert({
  userEmail,
  type,
  title,
  message,
  link,
  entityType,
  entityId,
  priority,
}) {
  const prefs = await getNotificationChannelPrefs(userEmail, type);
  if (!prefs.inApp && !prefs.email && !prefs.push) {
    return { delivered: false };
  }

  // The notifications row is the cross-channel dedupe ledger. If we can't
  // record it, we deliberately do NOT send email/push: a transient DB error
  // would otherwise let the same alert go out every poll until the row
  // finally lands. Fail-closed protects the dedupe guarantee.
  const ledger = await createNotification({
    userEmail,
    type,
    title,
    message,
    link,
    entityType,
    entityId,
    priority,
    inAppVisible: prefs.inApp,
  });
  if (!ledger || ledger.success === false) {
    console.error(`[Lead Temperature] Skipping fan-out for ${type} → ${userEmail}: ledger insert failed (${ledger?.error || 'unknown'}).`);
    return { delivered: false };
  }

  if (prefs.email) {
    try {
      await sendNotificationEmail({
        userEmail,
        subject: title,
        html: buildAlertEmailHtml({ title, message, link }),
        text: `${title}\n\n${message}`,
      });
    } catch (error) {
      console.error(`[Lead Temperature] Email delivery failed for ${userEmail}:`, error.message);
    }
  }

  if (prefs.push) {
    try {
      await sendPushNotification({
        userEmail,
        title,
        body: message,
        link,
        data: { type, entityType, entityId },
      });
    } catch (error) {
      console.error(`[Lead Temperature] Push delivery failed for ${userEmail}:`, error.message);
    }
  }

  return { delivered: true };
}

/**
 * Iterates over active PJ leads, recomputes temperature using the saved rules
 * and fires off notifications for warm→cold transitions (and optionally for
 * warm/cold→hot transitions, which alert the assigned agent's supervisor).
 *
 * Channel fan-out:
 *  - In-app: a row in `notifications` (gated on `in_app_visible` so users who
 *    turned the in-app preference off don't see them in the bell).
 *  - Email: SMTP via `notificationService.sendNotificationEmail`.
 *  - Push: Web Push via `notificationService.sendPushNotification`.
 *
 * Dedupe strategy (unchanged across channels — the `notifications` table is
 * the cross-channel ledger):
 *  - Cold: do not notify if a `lead_pj_cold` notification for this lead exists
 *    that was created AFTER the lead's contact reference (last_contact_at, or
 *    created_at when last_contact_at is null). Once the agent records a new
 *    contact, the reference advances and the lead becomes eligible to alert
 *    again the next time it cools down.
 *  - Hot: do not notify the same supervisor twice within 24h for the same lead.
 */
export async function checkLeadTemperatures({ now = new Date() } = {}) {
  const rules = await loadTemperatureRules();

  // Skip cold entirely if the rule is disabled (null/0).
  const coldThreshold = rules.cold?.minDaysSinceContact;
  const coldEnabled = coldThreshold !== null && coldThreshold !== undefined && coldThreshold > 0;

  if (!coldEnabled && !rules.hot) {
    return { checked: 0, coldNotified: 0, hotNotified: 0 };
  }

  const leadsResult = await query(
    `SELECT id, agent_id, razao_social, nome_fantasia, contact_name,
            last_contact_at, created_at, value, monthly_value
     FROM leads_pj
     WHERE agent_id IS NOT NULL
       AND COALESCE(status, 'active') = 'active'
       AND COALESCE(concluded, false) = false
       AND COALESCE(lost, false) = false`
  );
  const leads = leadsResult.rows;
  if (leads.length === 0) {
    return { checked: 0, coldNotified: 0, hotNotified: 0 };
  }

  // Pull the recent activities once (within the hot window) for all leads.
  const windowHours = rules.hot?.interactionWindowHours || 48;
  const since = new Date(now.getTime() - windowHours * 60 * 60 * 1000);
  const leadIds = leads.map(l => l.id);
  const placeholders = leadIds.map((_, i) => `$${i + 1}`).join(',');
  // Match the precedence used by computeLeadTemperature
  // (completed_at → created_at → scheduled_at) so this prefilter doesn't
  // accidentally drop activities the temperature logic would have counted.
  const activitiesResult = await query(
    `SELECT id, lead_id, type, completed, completed_at, created_at, scheduled_at
     FROM activities_pj
     WHERE lead_id IN (${placeholders})
       AND COALESCE(completed_at, created_at, scheduled_at) >= $${leadIds.length + 1}`,
    [...leadIds, since.toISOString()]
  );
  const activitiesByLead = new Map();
  for (const a of activitiesResult.rows) {
    const arr = activitiesByLead.get(a.lead_id) || [];
    arr.push(a);
    activitiesByLead.set(a.lead_id, arr);
  }

  // Resolve agent + supervisor info in one pass.
  const agentIds = Array.from(new Set(leads.map(l => l.agent_id).filter(Boolean)));
  const agentMap = new Map();
  if (agentIds.length > 0) {
    const agentPlaceholders = agentIds.map((_, i) => `$${i + 1}`).join(',');
    const agentsResult = await query(
      `SELECT a.id, a.email, a.name, a.supervisor_id,
              s.email AS supervisor_email, s.name AS supervisor_name
       FROM agents a
       LEFT JOIN agents s ON s.id = a.supervisor_id
       WHERE a.id IN (${agentPlaceholders})`,
      agentIds
    );
    for (const row of agentsResult.rows) {
      agentMap.set(row.id, row);
    }
  }

  let coldNotified = 0;
  let hotNotified = 0;

  for (const lead of leads) {
    const agent = agentMap.get(lead.agent_id);
    if (!agent || !agent.email) continue;

    const activities = activitiesByLead.get(lead.id) || [];
    const temp = computeLeadTemperature(lead, activities, rules, now);

    const leadLabel = lead.razao_social || lead.nome_fantasia || lead.contact_name || 'Lead PJ';

    if (coldEnabled && temp.key === 'cold') {
      const referenceTs =
        (lead.last_contact_at ? new Date(lead.last_contact_at) : null) ||
        (lead.created_at ? new Date(lead.created_at) : null);
      const referenceIso = referenceTs ? referenceTs.toISOString() : new Date(0).toISOString();

      // Dedupe per recipient so a reassignment within the same cold cycle
      // still alerts the newly assigned agent.
      const existing = await query(
        `SELECT 1 FROM notifications
         WHERE type = $1 AND entity_id = $2 AND user_email = $3 AND created_at >= $4
         LIMIT 1`,
        [NOTIF_TYPE_COLD, lead.id, agent.email, referenceIso]
      );
      if (existing.rows.length === 0) {
        const daysLabel = temp.days != null
          ? (temp.days === 1 ? '1 dia' : `${temp.days} dias`)
          : 'muitos dias';
        const result = await deliverAlert({
          userEmail: agent.email,
          type: NOTIF_TYPE_COLD,
          title: 'Lead esfriou',
          message: `O lead "${leadLabel}" está sem contato há ${daysLabel}. Retome o atendimento antes que esfrie de vez.`,
          link: `/LeadsPJ/${lead.id}`,
          entityType: 'lead_pj',
          entityId: lead.id,
          priority: 'high',
        });
        if (result.delivered) coldNotified++;
      }
    }

    if (temp.key === 'hot' && agent.supervisor_id && agent.supervisor_email) {
      const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const existing = await query(
        `SELECT 1 FROM notifications
         WHERE type = $1 AND entity_id = $2 AND user_email = $3 AND created_at >= $4
         LIMIT 1`,
        [NOTIF_TYPE_HOT, lead.id, agent.supervisor_email, cutoff]
      );
      if (existing.rows.length === 0) {
        const result = await deliverAlert({
          userEmail: agent.supervisor_email,
          type: NOTIF_TYPE_HOT,
          title: 'Lead quente na equipe',
          message: `O lead "${leadLabel}", com ${agent.name || 'vendedor'}, está quente. Boa hora para acompanhar.`,
          link: `/LeadsPJ/${lead.id}`,
          entityType: 'lead_pj',
          entityId: lead.id,
          priority: 'normal',
        });
        if (result.delivered) hotNotified++;
      }
    }
  }

  return { checked: leads.length, coldNotified, hotNotified };
}

/**
 * Runs the cold-lead monitor and persists a small summary row so admins can
 * see (in Settings → Temperatura de Leads) when it last ran, what it did,
 * and whether it failed. Always returns the same shape as
 * checkLeadTemperatures so callers can keep their existing logging.
 *
 * Recording failures are swallowed: we never want a problem with the history
 * table to take down the actual monitor.
 *
 * History pruning is handled by the periodic `pruneOldMonitorRuns` job
 * scheduled in server.js — keeping that out of the hot path means a chatty
 * cadence (1-minute) doesn't pay an O(n) DELETE per insert and a temporary
 * cleanup failure can't bleed into the monitor's success rate.
 */
export async function runMonitorAndRecord({ now = new Date() } = {}) {
  const startedAt = now instanceof Date ? now : new Date();
  const startMs = Date.now();
  let result = { checked: 0, coldNotified: 0, hotNotified: 0 };
  let status = 'success';
  let errorMessage = null;
  let thrown = null;

  try {
    result = await checkLeadTemperatures({ now: startedAt });
  } catch (err) {
    status = 'error';
    errorMessage = err && err.message ? String(err.message).slice(0, 1000) : String(err).slice(0, 1000);
    thrown = err;
  }

  const finishedAt = new Date();
  const durationMs = Date.now() - startMs;

  try {
    await query(
      `INSERT INTO lead_temperature_monitor_runs
         (started_at, finished_at, duration_ms,
          leads_checked, cold_notified, hot_notified,
          status, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        startedAt.toISOString(),
        finishedAt.toISOString(),
        durationMs,
        result.checked || 0,
        result.coldNotified || 0,
        result.hotNotified || 0,
        status,
        errorMessage,
      ]
    );
  } catch (recordErr) {
    console.error('[Lead Temperature] Falha ao registrar histórico do monitor:', recordErr.message);
  }

  if (thrown) throw thrown;
  return result;
}

/**
 * Returns the most recent monitor-run summaries (newest first), capped at
 * `limit`. Used by the admin Settings panel.
 */
export async function listRecentMonitorRuns({ limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(100, Math.round(Number(limit) || 10)));
  const result = await query(
    `SELECT id, started_at, finished_at, duration_ms,
            leads_checked, cold_notified, hot_notified,
            status, error_message
     FROM lead_temperature_monitor_runs
     ORDER BY started_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    leadsChecked: row.leads_checked,
    coldNotified: row.cold_notified,
    hotNotified: row.hot_notified,
    status: row.status,
    errorMessage: row.error_message,
  }));
}

/**
 * Deletes monitor-run summaries older than the configured retention window.
 *
 * Uses a time-based predicate (`started_at < now() - interval`) backed by the
 * `idx_lead_temperature_monitor_runs_started_at` index, so the cost is
 * proportional to the rows actually being deleted — not to the table size.
 * That makes it safe to run on a fixed cadence regardless of how chatty the
 * monitor is.
 *
 * Resolution order for retention days (in days):
 *   1. explicit `retentionDays` argument (used by tests / one-off jobs)
 *   2. `system_settings.lead_temperature_monitor_retention_days`
 *   3. DEFAULT_MONITOR_RETENTION_DAYS
 *
 * Returns `{ deleted, retentionDays }`. Errors are not swallowed here — the
 * scheduler in server.js logs them so a recurring failure is visible.
 */
export async function pruneOldMonitorRuns({ retentionDays } = {}) {
  const days =
    retentionDays !== undefined
      ? normalizeMonitorRetentionDays(retentionDays)
      : await loadMonitorRetentionDays();
  // Multiply a bound integer by `INTERVAL '1 day'` instead of interpolating
  // the count into the INTERVAL literal. `days` is already clamped to
  // [1, 365] by normalize, but a bind parameter keeps the query free of
  // any dynamically-constructed SQL.
  const result = await query(
    `DELETE FROM lead_temperature_monitor_runs
     WHERE started_at < NOW() - ($1::int * INTERVAL '1 day')`,
    [days]
  );
  return { deleted: result.rowCount || 0, retentionDays: days };
}
