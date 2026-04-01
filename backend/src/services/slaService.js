import { query } from '../config/database.js';
import { TICKET_PRIORITIES } from '../config/permissions.js';

export const SLA_PAUSE_STATUSES = ['awaiting_customer', 'awaiting_third_party', 'on_hold'];

export async function getSLAPolicy(ticketId) {
  const result = await query(`
    SELECT sp.* FROM sla_policies sp
    JOIN tickets t ON t.sla_policy_id = sp.id
    WHERE t.id = $1
  `, [ticketId]);
  
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  
  const ticketResult = await query(`SELECT priority FROM tickets WHERE id = $1`, [ticketId]);
  const priority = ticketResult.rows[0]?.priority || 'P3';
  
  return {
    first_response_minutes: TICKET_PRIORITIES[priority]?.firstResponseMinutes || 240,
    resolution_minutes: TICKET_PRIORITIES[priority]?.resolutionMinutes || 480,
    pause_on_statuses: SLA_PAUSE_STATUSES
  };
}

export async function calculateSLADeadlines(ticketId) {
  const ticketResult = await query(`
    SELECT created_at, priority, status, first_response_at FROM tickets WHERE id = $1
  `, [ticketId]);
  
  const ticket = ticketResult.rows[0];
  if (!ticket) return null;
  
  const slaPolicy = await getSLAPolicy(ticketId);
  
  const pausedTime = await calculatePausedTime(ticketId);
  
  const createdAt = new Date(ticket.created_at);
  const firstResponseDeadline = new Date(createdAt.getTime() + 
    (slaPolicy.first_response_minutes * 60 * 1000) + pausedTime);
  const resolutionDeadline = new Date(createdAt.getTime() + 
    (slaPolicy.resolution_minutes * 60 * 1000) + pausedTime);
  
  return {
    firstResponseDeadline,
    resolutionDeadline,
    firstResponseMinutes: slaPolicy.first_response_minutes,
    resolutionMinutes: slaPolicy.resolution_minutes,
    pausedTimeMs: pausedTime,
    hasFirstResponse: !!ticket.first_response_at
  };
}

export async function calculatePausedTime(ticketId) {
  const result = await query(`
    SELECT 
      status,
      created_at as changed_at,
      LAG(status) OVER (ORDER BY created_at) as prev_status,
      LAG(created_at) OVER (ORDER BY created_at) as prev_changed_at
    FROM ticket_status_history
    WHERE ticket_id = $1
    ORDER BY created_at
  `, [ticketId]);
  
  let pausedTime = 0;
  let pauseStart = null;
  
  for (const row of result.rows) {
    if (SLA_PAUSE_STATUSES.includes(row.status) && !pauseStart) {
      pauseStart = new Date(row.changed_at);
    } else if (!SLA_PAUSE_STATUSES.includes(row.status) && pauseStart) {
      pausedTime += new Date(row.changed_at).getTime() - pauseStart.getTime();
      pauseStart = null;
    }
  }
  
  if (pauseStart) {
    pausedTime += Date.now() - pauseStart.getTime();
  }
  
  return pausedTime;
}

export async function checkSLABreach(ticketId) {
  const deadlines = await calculateSLADeadlines(ticketId);
  if (!deadlines) return null;
  
  const now = new Date();
  
  const firstResponseBreached = !deadlines.hasFirstResponse && now > deadlines.firstResponseDeadline;
  const resolutionBreached = now > deadlines.resolutionDeadline;
  
  return {
    ticketId,
    firstResponse: {
      breached: firstResponseBreached,
      deadline: deadlines.firstResponseDeadline,
      minutesRemaining: Math.floor((deadlines.firstResponseDeadline.getTime() - now.getTime()) / 60000)
    },
    resolution: {
      breached: resolutionBreached,
      deadline: deadlines.resolutionDeadline,
      minutesRemaining: Math.floor((deadlines.resolutionDeadline.getTime() - now.getTime()) / 60000)
    }
  };
}

export async function checkAllSLAWarnings(warningMinutes = 30) {
  const result = await query(`
    SELECT id, assigned_agent_id, priority, subject, created_at, first_response_at
    FROM tickets
    WHERE status NOT IN ('resolved', 'closed')
    AND sla_breached = false
  `);
  
  const warnings = [];
  const breaches = [];
  
  for (const ticket of result.rows) {
    const slaStatus = await checkSLABreach(ticket.id);
    if (!slaStatus) continue;
    
    if (slaStatus.firstResponse.breached || slaStatus.resolution.breached) {
      await query(`UPDATE tickets SET sla_breached = true, updated_at = NOW() WHERE id = $1`, [ticket.id]);
      breaches.push({
        ticketId: ticket.id,
        agentId: ticket.assigned_agent_id,
        subject: ticket.subject,
        type: slaStatus.firstResponse.breached ? 'first_response' : 'resolution'
      });
    } else if (
      slaStatus.firstResponse.minutesRemaining <= warningMinutes ||
      slaStatus.resolution.minutesRemaining <= warningMinutes
    ) {
      warnings.push({
        ticketId: ticket.id,
        agentId: ticket.assigned_agent_id,
        subject: ticket.subject,
        firstResponseMinutes: slaStatus.firstResponse.minutesRemaining,
        resolutionMinutes: slaStatus.resolution.minutesRemaining
      });
    }
  }
  
  return { warnings, breaches };
}

export async function recordFirstResponse(ticketId) {
  const result = await query(`
    SELECT first_response_at FROM tickets WHERE id = $1
  `, [ticketId]);
  
  if (result.rows[0]?.first_response_at) {
    return { alreadyRecorded: true };
  }
  
  await query(`
    UPDATE tickets 
    SET first_response_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [ticketId]);
  
  return { recorded: true };
}

export async function recordStatusChange(ticketId, oldStatus, newStatus, changedBy) {
  await query(`
    INSERT INTO ticket_status_history (ticket_id, old_status, new_status, changed_by, created_at)
    VALUES ($1, $2, $3, $4, NOW())
  `, [ticketId, oldStatus, newStatus, changedBy]);
}
