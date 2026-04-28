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

export async function createNotification({ 
  userEmail, 
  type, 
  title, 
  message, 
  link = null,
  entityType = null,
  entityId = null,
  priority = 'normal'
}) {
  try {
    await query(`
      INSERT INTO notifications (user_email, type, title, message, link, entity_type, entity_id, priority, read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())
    `, [userEmail, type, title, message, link, entityType, entityId, priority]);
    
    return { success: true };
  } catch (error) {
    console.error('Error creating notification:', error);
    return { success: false, error: error.message };
  }
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
