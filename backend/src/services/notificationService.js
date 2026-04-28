import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { query } from '../config/database.js';

/**
 * Returns true if the user has explicitly disabled in-app notifications for the
 * given notification type. Absent rows = enabled (consistent with the legacy
 * behavior of every other notify* helper in this file, which never gated).
 */
export async function isInAppNotificationEnabled(userEmail, notificationType) {
  if (!userEmail || !notificationType) return true;
  try {
    const result = await query(
      `SELECT in_app_enabled FROM notification_preferences
       WHERE user_email = $1 AND notification_type = $2
       LIMIT 1`,
      [userEmail, notificationType]
    );
    if (result.rows.length === 0) return true;
    return result.rows[0].in_app_enabled !== false;
  } catch (error) {
    console.error('[Notification] preference lookup failed, defaulting to enabled:', error.message);
    return true;
  }
}

/**
 * Whether to deliver email for this user/type. Schema default is TRUE, mirroring
 * the in-app helper.
 */
export async function isEmailNotificationEnabled(userEmail, notificationType) {
  if (!userEmail || !notificationType) return true;
  try {
    const result = await query(
      `SELECT email_enabled FROM notification_preferences
       WHERE user_email = $1 AND notification_type = $2
       LIMIT 1`,
      [userEmail, notificationType]
    );
    if (result.rows.length === 0) return true;
    return result.rows[0].email_enabled !== false;
  } catch (error) {
    console.error('[Notification] email preference lookup failed, defaulting to enabled:', error.message);
    return true;
  }
}

/**
 * Whether to deliver push for this user/type. Schema default is TRUE.
 */
export async function isPushNotificationEnabled(userEmail, notificationType) {
  if (!userEmail || !notificationType) return true;
  try {
    const result = await query(
      `SELECT push_enabled FROM notification_preferences
       WHERE user_email = $1 AND notification_type = $2
       LIMIT 1`,
      [userEmail, notificationType]
    );
    if (result.rows.length === 0) return true;
    return result.rows[0].push_enabled !== false;
  } catch (error) {
    console.error('[Notification] push preference lookup failed, defaulting to enabled:', error.message);
    return true;
  }
}

/**
 * Convenience: fetch all three channel flags in a single query.
 * Defaults each missing flag to TRUE (matches schema defaults).
 */
export async function getNotificationChannelPrefs(userEmail, notificationType) {
  const fallback = { inApp: true, email: true, push: true };
  if (!userEmail || !notificationType) return fallback;
  try {
    const result = await query(
      `SELECT in_app_enabled, email_enabled, push_enabled
       FROM notification_preferences
       WHERE user_email = $1 AND notification_type = $2
       LIMIT 1`,
      [userEmail, notificationType]
    );
    if (result.rows.length === 0) return fallback;
    const row = result.rows[0];
    return {
      inApp: row.in_app_enabled !== false,
      email: row.email_enabled !== false,
      push: row.push_enabled !== false,
    };
  } catch (error) {
    console.error('[Notification] channel preference lookup failed, defaulting to enabled:', error.message);
    return fallback;
  }
}

export async function createNotification({
  userEmail,
  type,
  title,
  message,
  link = null,
  entityType = null,
  entityId = null,
  priority = 'normal',
  inAppVisible = true,
}) {
  try {
    await query(`
      INSERT INTO notifications (user_email, type, title, message, link, entity_type, entity_id, priority, in_app_visible, read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, false, NOW())
    `, [userEmail, type, title, message, link, entityType, entityId, priority, inAppVisible !== false]);

    return { success: true };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================================
// Email delivery (uses the same SMTP settings the commission report uses)
// =====================================================================

let cachedSmtpSettings = null;
let cachedSmtpAt = 0;
const SMTP_CACHE_MS = 60 * 1000;

async function loadSmtpSettings() {
  const now = Date.now();
  if (cachedSmtpSettings && now - cachedSmtpAt < SMTP_CACHE_MS) {
    return cachedSmtpSettings;
  }
  try {
    const result = await query(
      'SELECT * FROM email_commission_settings ORDER BY id DESC LIMIT 1'
    );
    cachedSmtpSettings = result.rows[0] || null;
    cachedSmtpAt = now;
    return cachedSmtpSettings;
  } catch (error) {
    console.error('[Notification] Failed to load SMTP settings:', error.message);
    return null;
  }
}

/**
 * Sends a transactional email to `userEmail` using the SMTP settings already
 * stored in `email_commission_settings`. No-ops with a warning when SMTP is
 * not configured so we never bring down the caller.
 *
 * Returns { success: bool, skipped?: bool, error?: string }.
 */
export async function sendNotificationEmail({
  userEmail,
  subject,
  html,
  text,
}) {
  if (!userEmail || !subject) {
    return { success: false, skipped: true, error: 'missing recipient or subject' };
  }
  const settings = await loadSmtpSettings();
  if (!settings || !settings.smtp_server || !settings.smtp_user || !settings.smtp_password) {
    console.warn('[Notification] Email not delivered: SMTP settings are not configured.');
    return { success: false, skipped: true, error: 'smtp not configured' };
  }
  try {
    const transporter = nodemailer.createTransport({
      host: settings.smtp_server,
      port: settings.smtp_port,
      secure: true,
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
      tls: { rejectUnauthorized: false },
    });
    await transporter.sendMail({
      from: settings.email_from || settings.smtp_user,
      to: userEmail,
      subject,
      html: html || undefined,
      text: text || undefined,
    });
    return { success: true };
  } catch (error) {
    console.error(`[Notification] Email to ${userEmail} failed:`, error.message);
    return { success: false, error: error.message };
  }
}

// =====================================================================
// Push delivery (Web Push / VAPID)
// =====================================================================

let vapidConfigured = false;
let vapidWarned = false;

function ensureVapidConfigured() {
  if (vapidConfigured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:no-reply@localhost';
  if (!publicKey || !privateKey) {
    if (!vapidWarned) {
      console.warn('[Notification] VAPID keys are not configured (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); push delivery is disabled.');
      vapidWarned = true;
    }
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
    return true;
  } catch (error) {
    if (!vapidWarned) {
      console.error('[Notification] Invalid VAPID configuration:', error.message);
      vapidWarned = true;
    }
    return false;
  }
}

/**
 * Sends a Web Push notification to every subscription that `userEmail` has
 * registered. Stale endpoints (HTTP 404/410) are pruned automatically; other
 * delivery errors are recorded on the row but otherwise swallowed so a single
 * bad device never blocks the others.
 *
 * Returns { success: bool, skipped?: bool, delivered?: number, error?: string }.
 */
export async function sendPushNotification({
  userEmail,
  title,
  body,
  link = null,
  data = null,
}) {
  if (!userEmail || !title) {
    return { success: false, skipped: true, error: 'missing recipient or title' };
  }
  if (!ensureVapidConfigured()) {
    return { success: false, skipped: true, error: 'vapid not configured' };
  }

  let subs;
  try {
    const result = await query(
      `SELECT id, endpoint, p256dh_key, auth_key FROM push_subscriptions WHERE user_email = $1`,
      [userEmail]
    );
    subs = result.rows;
  } catch (error) {
    console.error('[Notification] push subscription lookup failed:', error.message);
    return { success: false, error: error.message };
  }

  if (!subs || subs.length === 0) {
    return { success: true, skipped: true, delivered: 0 };
  }

  const payload = JSON.stringify({
    title,
    body: body || '',
    link: link || null,
    data: data || null,
  });

  let delivered = 0;
  for (const sub of subs) {
    const subscription = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
    };
    try {
      await webpush.sendNotification(subscription, payload);
      delivered++;
      try {
        await query(
          `UPDATE push_subscriptions SET last_used_at = NOW(), last_error = NULL, last_error_at = NULL WHERE id = $1`,
          [sub.id]
        );
      } catch (_) { /* best effort */ }
    } catch (error) {
      const status = error?.statusCode;
      if (status === 404 || status === 410) {
        // Subscription is dead — drop it so we don't keep trying.
        try {
          await query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]);
        } catch (_) { /* best effort */ }
      } else {
        console.error(`[Notification] push delivery failed for ${userEmail} (${status || 'no status'}):`, error.message);
        try {
          await query(
            `UPDATE push_subscriptions SET last_error = $2, last_error_at = NOW() WHERE id = $1`,
            [sub.id, String(error.message || error).slice(0, 500)]
          );
        } catch (_) { /* best effort */ }
      }
    }
  }

  return { success: true, delivered };
}

export async function notifyLeadAssigned(lead, agentId) {
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [agentId]);
  const agent = agentResult.rows[0];
  
  if (!agent) return;
  
  await createNotification({
    userEmail: agent.email,
    type: 'lead_assigned',
    title: 'Novo lead atribuído',
    message: `O lead "${lead.name}" foi atribuído a você.`,
    link: `/Leads/${lead.id}`,
    entityType: 'lead',
    entityId: lead.id
  });
}

export async function notifyLeadStageChanged(lead, oldStage, newStage, changedByAgentId) {
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [lead.assigned_agent_id || lead.agent_id]);
  const agent = agentResult.rows[0];
  
  if (!agent) return;
  
  if (changedByAgentId && changedByAgentId === (lead.assigned_agent_id || lead.agent_id)) {
    return;
  }
  
  const stageNames = {
    'new': 'Novo',
    'contacted': 'Contatado',
    'qualified': 'Qualificado',
    'proposal': 'Proposta',
    'negotiation': 'Negociação',
    'closed_won': 'Fechado (Ganho)',
    'closed_lost': 'Fechado (Perdido)'
  };
  
  await createNotification({
    userEmail: agent.email,
    type: 'lead_stage_changed',
    title: 'Lead movido de estágio',
    message: `O lead "${lead.name}" foi movido de "${stageNames[oldStage] || oldStage}" para "${stageNames[newStage] || newStage}".`,
    link: `/Leads/${lead.id}`,
    entityType: 'lead',
    entityId: lead.id
  });
}

export async function notifyProposalStatus(lead, status) {
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [lead.assigned_agent_id || lead.agent_id]);
  const agent = agentResult.rows[0];
  
  if (!agent) return;
  
  const statusMessages = {
    'accepted': { title: 'Proposta aceita!', message: `A proposta do lead "${lead.name}" foi aceita!`, priority: 'high' },
    'rejected': { title: 'Proposta rejeitada', message: `A proposta do lead "${lead.name}" foi rejeitada.`, priority: 'normal' }
  };
  
  const info = statusMessages[status];
  if (!info) return;
  
  await createNotification({
    userEmail: agent.email,
    type: 'proposal_status',
    title: info.title,
    message: info.message,
    link: `/Leads/${lead.id}`,
    entityType: 'lead',
    entityId: lead.id,
    priority: info.priority
  });
}

export async function notifyLeadComment(lead, commentAuthorId, commentText) {
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [lead.assigned_agent_id || lead.agent_id]);
  const agent = agentResult.rows[0];
  
  if (!agent) return;
  
  if (commentAuthorId === (lead.assigned_agent_id || lead.agent_id)) {
    return;
  }
  
  const authorResult = await query(`SELECT name FROM agents WHERE id = $1`, [commentAuthorId]);
  const authorName = authorResult.rows[0]?.name || 'Alguém';
  
  await createNotification({
    userEmail: agent.email,
    type: 'lead_comment',
    title: 'Novo comentário no lead',
    message: `${authorName} comentou no lead "${lead.name}": "${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}"`,
    link: `/Leads/${lead.id}`,
    entityType: 'lead',
    entityId: lead.id
  });
}

export async function notifyVisitScheduled(visit, lead, scheduledByAgentId) {
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [visit.agent_id]);
  const agent = agentResult.rows[0];
  
  if (!agent) return;
  
  if (scheduledByAgentId === visit.agent_id) {
    return;
  }
  
  const schedulerResult = await query(`SELECT name FROM agents WHERE id = $1`, [scheduledByAgentId]);
  const schedulerName = schedulerResult.rows[0]?.name || 'Alguém';
  
  const visitDate = new Date(visit.scheduled_date).toLocaleDateString('pt-BR');
  
  await createNotification({
    userEmail: agent.email,
    type: 'visit_scheduled',
    title: 'Nova visita agendada',
    message: `${schedulerName} agendou uma visita para ${visitDate} no lead "${lead?.name || 'Lead'}".`,
    link: `/Leads/${lead?.id || ''}`,
    entityType: 'visit',
    entityId: visit.id
  });
}

export async function notifyLeadPJAssigned(lead, agentId) {
  console.log('[Notification] notifyLeadPJAssigned called:', { leadId: lead?.id, agentId });
  
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [agentId]);
  const agent = agentResult.rows[0];
  
  console.log('[Notification] Agent found:', agent ? { email: agent.email, name: agent.name } : 'NOT FOUND');
  
  if (!agent) return;
  
  const result = await createNotification({
    userEmail: agent.email,
    type: 'lead_pj_assigned',
    title: 'Novo lead PJ atribuído',
    message: `O lead PJ "${lead.razao_social || lead.nome_fantasia}" foi atribuído a você.`,
    link: `/LeadsPJ/${lead.id}`,
    entityType: 'lead_pj',
    entityId: lead.id
  });
  
  console.log('[Notification] Created:', result);
}

export async function notifyReferralAssigned(referral, agentId) {
  const agentResult = await query(`SELECT email, name FROM agents WHERE id = $1`, [agentId]);
  const agent = agentResult.rows[0];
  
  if (!agent) return;
  
  await createNotification({
    userEmail: agent.email,
    type: 'referral_assigned',
    title: 'Nova indicação atribuída',
    message: `A indicação de "${referral.referrer_name}" para "${referral.referred_name}" foi atribuída a você.`,
    link: `/Referrals/${referral.id}`,
    entityType: 'referral',
    entityId: referral.id
  });
}
