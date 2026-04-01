import { query } from '../config/database.js';

export const AUTOMATION_TRIGGERS = {
  STAGE_DURATION: 'stage_duration',
  NO_ACTIVITY: 'no_activity',
  SCHEDULED: 'scheduled'
};

export const AUTOMATION_ACTIONS = {
  MOVE_STAGE: 'move_stage',
  CREATE_TASK: 'create_task',
  NOTIFY: 'notify',
  SEND_WHATSAPP: 'send_whatsapp'
};

export async function getActiveAutomations() {
  const result = await query(`
    SELECT * FROM lead_automations
    WHERE active = true
    ORDER BY priority ASC
  `);
  return result.rows;
}

export async function checkStageDuration(lead, automation) {
  const stageChangedAt = new Date(lead.stage_changed_at || lead.created_at);
  const now = new Date();
  const hoursSinceChange = (now.getTime() - stageChangedAt.getTime()) / (1000 * 60 * 60);
  
  const triggerHours = automation.trigger_config?.hours || 24;
  const triggerStage = automation.trigger_config?.stage;
  
  if (triggerStage && lead.stage !== triggerStage) {
    return false;
  }
  
  return hoursSinceChange >= triggerHours;
}

export async function checkNoActivity(lead, automation) {
  const result = await query(`
    SELECT MAX(created_at) as last_activity 
    FROM activities 
    WHERE lead_id = $1
  `, [lead.id]);
  
  const lastActivity = result.rows[0]?.last_activity || lead.created_at;
  const now = new Date();
  const hoursSinceActivity = (now.getTime() - new Date(lastActivity).getTime()) / (1000 * 60 * 60);
  
  const triggerHours = automation.trigger_config?.hours || 48;
  
  return hoursSinceActivity >= triggerHours;
}

export async function executeAction(lead, automation) {
  const action = automation.action_type;
  const config = automation.action_config || {};
  
  switch (action) {
    case AUTOMATION_ACTIONS.MOVE_STAGE:
      return await moveLeadStage(lead, config.targetStage);
    
    case AUTOMATION_ACTIONS.CREATE_TASK:
      return await createLeadTask(lead, config);
    
    case AUTOMATION_ACTIONS.NOTIFY:
      return await createNotification(lead, config);
    
    case AUTOMATION_ACTIONS.SEND_WHATSAPP:
      return await sendWhatsApp(lead, config);
    
    default:
      return { success: false, message: `Unknown action: ${action}` };
  }
}

async function moveLeadStage(lead, targetStage) {
  await query(`
    UPDATE leads 
    SET stage = $2, stage_changed_at = NOW(), updated_at = NOW()
    WHERE id = $1
  `, [lead.id, targetStage]);
  
  await query(`
    INSERT INTO lead_history (lead_id, action, old_value, new_value, created_at)
    VALUES ($1, 'stage_change', $2, $3, NOW())
  `, [lead.id, lead.stage, targetStage]);
  
  return { success: true, action: 'moved', newStage: targetStage };
}

async function createLeadTask(lead, config) {
  const dueDate = new Date();
  dueDate.setHours(dueDate.getHours() + (config.dueDateHours || 24));
  
  await query(`
    INSERT INTO activities (lead_id, agent_id, type, title, description, due_date, status, created_at)
    VALUES ($1, $2, 'task', $3, $4, $5, 'pending', NOW())
  `, [
    lead.id, 
    lead.assigned_agent_id,
    config.taskTitle || 'Tarefa automática',
    config.taskDescription || `Tarefa criada automaticamente para o lead ${lead.name}`,
    dueDate
  ]);
  
  return { success: true, action: 'task_created' };
}

async function createNotification(lead, config) {
  const agentResult = await query(`SELECT user_email FROM agents WHERE id = $1`, [lead.assigned_agent_id]);
  const userEmail = agentResult.rows[0]?.user_email;
  
  if (!userEmail) {
    return { success: false, action: 'notification_failed', reason: 'No agent email found' };
  }
  
  await query(`
    INSERT INTO notifications (user_email, type, title, message, entity_type, entity_id, read, created_at)
    VALUES ($1, 'automation', $2, $3, 'lead', $4, false, NOW())
  `, [
    userEmail,
    config.title || 'Alerta de Lead',
    config.message?.replace('{{lead_name}}', lead.name) || `Lead ${lead.name} requer atenção`,
    lead.id
  ]);
  
  return { success: true, action: 'notification_sent' };
}

async function sendWhatsApp(lead, config) {
  return { 
    success: false, 
    action: 'whatsapp_pending',
    message: 'WhatsApp integration not configured' 
  };
}

export async function runAutomationsForLead(leadId) {
  const leadResult = await query(`SELECT * FROM leads WHERE id = $1`, [leadId]);
  const lead = leadResult.rows[0];
  
  if (!lead || lead.status === 'converted' || lead.status === 'lost') {
    return { skipped: true, reason: 'Lead not active' };
  }
  
  const automations = await getActiveAutomations();
  const results = [];
  
  for (const automation of automations) {
    let triggered = false;
    
    switch (automation.trigger_type) {
      case AUTOMATION_TRIGGERS.STAGE_DURATION:
        triggered = await checkStageDuration(lead, automation);
        break;
      case AUTOMATION_TRIGGERS.NO_ACTIVITY:
        triggered = await checkNoActivity(lead, automation);
        break;
    }
    
    if (triggered) {
      const result = await executeAction(lead, automation);
      results.push({
        automationId: automation.id,
        automationName: automation.name,
        ...result
      });
      
      if (automation.stop_on_trigger) {
        break;
      }
    }
  }
  
  return { leadId, results };
}

export async function runAllAutomations() {
  const leadsResult = await query(`
    SELECT id FROM leads 
    WHERE status NOT IN ('converted', 'lost')
    ORDER BY updated_at ASC
    LIMIT 100
  `);
  
  const results = [];
  
  for (const lead of leadsResult.rows) {
    const result = await runAutomationsForLead(lead.id);
    if (result.results?.length > 0) {
      results.push(result);
    }
  }
  
  return { 
    processedLeads: leadsResult.rows.length,
    triggeredAutomations: results.length,
    details: results 
  };
}
