import { query } from '../config/database.js';

export const DISTRIBUTION_ALGORITHMS = {
  ROUND_ROBIN: 'round_robin',
  LEAST_ACTIVE: 'least_active'
};

export async function getEligibleAgents(queueId, considerOnlineStatus = true, workingHoursOnly = false) {
  let sql = `
    SELECT a.* FROM agents a
    WHERE a.active = true
    AND ($1::uuid IS NULL OR $1::uuid = ANY(a.queue_ids))
  `;
  
  const params = [queueId];
  
  if (considerOnlineStatus) {
    sql += ` AND a.online = true`;
  }
  
  sql += ` ORDER BY a.name`;
  
  const result = await query(sql, params);
  let agents = result.rows;
  
  if (workingHoursOnly) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinutes.toString().padStart(2, '0')}`;
    const currentDay = now.getDay();
    
    agents = agents.filter(agent => {
      if (!agent.working_hours) return true;
      
      const wh = agent.working_hours;
      const startTime = wh.start || '08:00';
      const endTime = wh.end || '18:00';
      const workDays = wh.days || [1, 2, 3, 4, 5];
      
      if (!workDays.includes(currentDay)) return false;
      if (currentTime < startTime || currentTime > endTime) return false;
      
      return true;
    });
  }
  
  return agents;
}

export async function getAgentTicketCount(agentId) {
  const result = await query(`
    SELECT COUNT(*) as count FROM tickets 
    WHERE assigned_agent_id = $1 
    AND status NOT IN ('resolved', 'closed')
  `, [agentId]);
  
  return parseInt(result.rows[0]?.count || 0);
}

export async function getQueueDistributionRule(queueId) {
  const result = await query(`
    SELECT dr.* FROM distribution_rules dr
    WHERE dr.queue_id = $1 AND dr.active = true
    LIMIT 1
  `, [queueId]);
  
  return result.rows[0] || {
    algorithm: DISTRIBUTION_ALGORITHMS.ROUND_ROBIN,
    consider_online_status: true,
    working_hours_only: false,
    agent_sequence: [],
    last_assigned_agent_id: null
  };
}

export async function updateLastAssignedAgent(queueId, agentId) {
  const result = await query(`
    UPDATE distribution_rules 
    SET last_assigned_agent_id = $2, updated_at = NOW()
    WHERE queue_id = $1
    RETURNING id
  `, [queueId, agentId]);
  
  if (result.rows.length === 0 && queueId) {
    await query(`
      INSERT INTO distribution_rules (queue_id, algorithm, last_assigned_agent_id, consider_online_status, working_hours_only, active, created_at)
      VALUES ($1, 'round_robin', $2, true, false, true, NOW())
      ON CONFLICT (queue_id) DO UPDATE SET last_assigned_agent_id = $2, updated_at = NOW()
    `, [queueId, agentId]);
  }
}

export async function checkAgentCapacity(agentId, priority) {
  const agentResult = await query(`SELECT capacity FROM agents WHERE id = $1`, [agentId]);
  const capacity = agentResult.rows[0]?.capacity || { P1: 2, P2: 5, P3: 10, P4: 20 };
  const maxCapacityForPriority = capacity[priority] || 10;
  const maxTotalCapacity = (capacity.P1 || 2) + (capacity.P2 || 5) + (capacity.P3 || 10) + (capacity.P4 || 20);
  
  const priorityCountResult = await query(`
    SELECT COUNT(*) as count FROM tickets 
    WHERE assigned_agent_id = $1 
    AND priority = $2
    AND status NOT IN ('resolved', 'closed')
  `, [agentId, priority]);
  
  const totalCountResult = await query(`
    SELECT COUNT(*) as count FROM tickets 
    WHERE assigned_agent_id = $1 
    AND status NOT IN ('resolved', 'closed')
  `, [agentId]);
  
  const priorityCount = parseInt(priorityCountResult.rows[0]?.count || 0);
  const totalCount = parseInt(totalCountResult.rows[0]?.count || 0);
  
  return priorityCount < maxCapacityForPriority && totalCount < maxTotalCapacity;
}

export async function assignTicketRoundRobin(ticketId, queueId) {
  const rule = await getQueueDistributionRule(queueId);
  const agents = await getEligibleAgents(
    queueId, 
    rule.consider_online_status, 
    rule.working_hours_only
  );
  
  if (agents.length === 0) {
    return { success: false, message: 'No eligible agents available' };
  }
  
  const ticketResult = await query(`SELECT priority FROM tickets WHERE id = $1`, [ticketId]);
  const priority = ticketResult.rows[0]?.priority || 'P3';
  
  let nextAgent;
  
  if (rule.agent_sequence && rule.agent_sequence.length > 0) {
    const sequence = rule.agent_sequence;
    const lastIndex = sequence.indexOf(rule.last_assigned_agent_id);
    const nextIndex = (lastIndex + 1) % sequence.length;
    
    for (let i = 0; i < sequence.length; i++) {
      const candidateIndex = (nextIndex + i) % sequence.length;
      const candidateId = sequence[candidateIndex];
      const candidate = agents.find(a => a.id === candidateId);
      if (candidate && await checkAgentCapacity(candidate.id, priority)) {
        nextAgent = candidate;
        break;
      }
    }
  }
  
  if (!nextAgent) {
    const lastIndex = agents.findIndex(a => a.id === rule.last_assigned_agent_id);
    
    for (let i = 0; i < agents.length; i++) {
      const candidateIndex = (lastIndex + 1 + i) % agents.length;
      const candidate = agents[candidateIndex];
      if (await checkAgentCapacity(candidate.id, priority)) {
        nextAgent = candidate;
        break;
      }
    }
  }
  
  if (!nextAgent) {
    return { success: false, message: 'All agents at capacity for this priority' };
  }
  
  await query(`
    UPDATE tickets 
    SET assigned_agent_id = $2, 
        assigned_at = NOW(),
        status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
        updated_at = NOW()
    WHERE id = $1
  `, [ticketId, nextAgent.id]);
  
  await updateLastAssignedAgent(queueId, nextAgent.id);
  
  return { 
    success: true, 
    agentId: nextAgent.id, 
    agentName: nextAgent.name 
  };
}

export async function assignTicketLeastActive(ticketId, queueId) {
  const rule = await getQueueDistributionRule(queueId);
  const agents = await getEligibleAgents(
    queueId, 
    rule.consider_online_status, 
    rule.working_hours_only
  );
  
  if (agents.length === 0) {
    return { success: false, message: 'No eligible agents available' };
  }
  
  const ticketResult = await query(`SELECT priority FROM tickets WHERE id = $1`, [ticketId]);
  const priority = ticketResult.rows[0]?.priority || 'P3';
  
  let minCount = Infinity;
  let leastActiveAgent = null;
  
  for (const agent of agents) {
    const hasCapacity = await checkAgentCapacity(agent.id, priority);
    if (!hasCapacity) continue;
    
    const count = await getAgentTicketCount(agent.id);
    if (count < minCount) {
      minCount = count;
      leastActiveAgent = agent;
    }
  }
  
  if (!leastActiveAgent) {
    return { success: false, message: 'All agents at capacity' };
  }
  
  await query(`
    UPDATE tickets 
    SET assigned_agent_id = $2, 
        assigned_at = NOW(),
        status = CASE WHEN status = 'new' THEN 'open' ELSE status END,
        updated_at = NOW()
    WHERE id = $1
  `, [ticketId, leastActiveAgent.id]);
  
  return { 
    success: true, 
    agentId: leastActiveAgent.id, 
    agentName: leastActiveAgent.name,
    currentLoad: minCount 
  };
}

export async function assignTicket(ticketId, queueId = null, algorithm = null) {
  if (!queueId) {
    const ticketResult = await query(`SELECT queue_id FROM tickets WHERE id = $1`, [ticketId]);
    queueId = ticketResult.rows[0]?.queue_id;
  }
  
  if (!algorithm) {
    const rule = await getQueueDistributionRule(queueId);
    algorithm = rule.algorithm || DISTRIBUTION_ALGORITHMS.ROUND_ROBIN;
  }
  
  switch (algorithm) {
    case DISTRIBUTION_ALGORITHMS.LEAST_ACTIVE:
      return assignTicketLeastActive(ticketId, queueId);
    case DISTRIBUTION_ALGORITHMS.ROUND_ROBIN:
    default:
      return assignTicketRoundRobin(ticketId, queueId);
  }
}

export async function distributeUnassignedTickets() {
  const result = await query(`
    SELECT id, queue_id FROM tickets 
    WHERE assigned_agent_id IS NULL 
    AND status NOT IN ('resolved', 'closed')
    ORDER BY 
      CASE priority 
        WHEN 'P1' THEN 1 
        WHEN 'P2' THEN 2 
        WHEN 'P3' THEN 3 
        ELSE 4 
      END,
      created_at ASC
    LIMIT 50
  `);
  
  const results = [];
  
  for (const ticket of result.rows) {
    const assignResult = await assignTicket(ticket.id, ticket.queue_id);
    results.push({ ticketId: ticket.id, ...assignResult });
  }
  
  return results;
}
