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
