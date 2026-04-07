import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createCrudRouter, filterValidColumns } from '../utils/crud.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { 
  notifyLeadAssigned, 
  notifyLeadStageChanged, 
  notifyLeadComment,
  notifyVisitScheduled,
  notifyLeadPJAssigned,
  notifyReferralAssigned,
  notifyProposalStatus
} from '../services/notificationService.js';
import { executeLeadCreatedAutomation } from '../services/automationService.js';
import { createGoogleEvent, updateGoogleEvent, deleteGoogleEvent } from '../services/googleCalendarService.js';

const router = Router();

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function convertKeysToCamel(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToCamel);
  if (obj instanceof Date) return obj.toISOString();
  
  return Object.keys(obj).reduce((acc, key) => {
    const camelKey = snakeToCamel(key);
    acc[camelKey] = convertKeysToCamel(obj[key]);
    return acc;
  }, {});
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function convertKeysToSnake(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(convertKeysToSnake);
  
  return Object.keys(obj).reduce((acc, key) => {
    const snakeKey = camelToSnake(key);
    acc[snakeKey] = convertKeysToSnake(obj[key]);
    return acc;
  }, {});
}

const entities = {
  teams: { searchFields: ['name'] },
  'agent-types': { tableName: 'agent_types', searchFields: ['key', 'label'], allowedFilters: ['active'] },
  // sales-agents removido - agora usa agents diretamente (tabelas unificadas)
  queues: { searchFields: ['name'], allowedFilters: ['active', 'team_id'] },
  territories: { searchFields: ['name'] },
  accounts: { searchFields: ['name', 'cnpj'] },
  contacts: { searchFields: ['name', 'email', 'document'], allowedFilters: ['account_id'] },
  contracts: { searchFields: ['contract_number'], allowedFilters: ['contact_id', 'account_id', 'status'] },
  dependents: { searchFields: ['name'], allowedFilters: ['contract_id'] },
  'ticket-types': { tableName: 'ticket_types', searchFields: ['name'], allowedFilters: ['active', 'category'] },
  'sla-policies': { tableName: 'sla_policies', searchFields: ['name'] },
  tickets: { searchFields: ['subject'], allowedFilters: ['status', 'priority', 'agent_id', 'queue_id', 'contact_id'] },
  'ticket-messages': { tableName: 'ticket_messages', searchFields: ['body'], allowedFilters: ['ticket_id'] },
  macros: { searchFields: ['name'] },
  templates: { searchFields: ['name', 'category'], allowedFilters: ['category', 'active'] },
  'csat-surveys': { tableName: 'csat_surveys', allowedFilters: ['ticket_id'] },
  'kb-categories': { tableName: 'kb_categories', searchFields: ['name'] },
  'kb-articles': { tableName: 'kb_articles', searchFields: ['title', 'content'], allowedFilters: ['category_id', 'status'] },
  'kb-article-versions': { tableName: 'kb_article_versions', allowedFilters: ['article_id'] },
  'kb-feedback': { tableName: 'kb_feedback', allowedFilters: ['article_id'] },
    'sales-goals': { tableName: 'sales_goals', allowedFilters: ['agent_id', 'year', 'month'] },
  'lead-automations': { tableName: 'lead_automations', searchFields: ['name'] },
    'activities-pj': { tableName: 'activities_pj', allowedFilters: ['lead_id', 'type'] },
  'lead-pj-automations': { tableName: 'lead_pj_automations', searchFields: ['name'] },
  'referral-automations': { tableName: 'referral_automations', searchFields: ['name'] },
  'referral-channel-automations': { tableName: 'referral_channel_automations', searchFields: ['name'], allowedFilters: ['channel_token', 'active'] },
  'referral-channel-config': { tableName: 'referral_channel_config', searchFields: ['channel_label'] },
  'automation-logs': { tableName: 'automation_logs', allowedFilters: ['automation_id', 'automation_type', 'lead_id', 'referral_id'] },
  'proposal-templates': { tableName: 'proposal_templates', searchFields: ['name'] },
  sales: { allowedFilters: ['lead_id', 'agent_id', 'status'] },
    'referral-activities': { tableName: 'referral_activities', allowedFilters: ['referral_id'] },
  'quick-services': { tableName: 'quick_services', searchFields: ['contact_name'], allowedFilters: ['agent_id', 'service_type'] },
  'distribution-rules': { tableName: 'distribution_rules', searchFields: ['name'] },
  'portal-sessions': { tableName: 'portal_sessions', allowedFilters: ['contact_id'] },
  'system-settings': { tableName: 'system_settings', searchFields: ['setting_key'] },
  notifications: { allowedFilters: ['user_email', 'read', 'type'] },
  'notification-preferences': { tableName: 'notification_preferences', allowedFilters: ['user_email'] },
  'quality-checklists': { tableName: 'quality_checklists', searchFields: ['name'] },
  'call-audits': { tableName: 'call_audits', allowedFilters: ['agent_id', 'ticket_id', 'status'] },
};

async function syncAutomationTeams(automationId, teamIds) {
  await query('DELETE FROM lead_automation_teams WHERE automation_id = $1', [automationId]);
  if (teamIds && teamIds.length > 0) {
    const valuePlaceholders = teamIds.map((_, i) => `(gen_random_uuid(), $1, $${i + 2}, now())`).join(', ');
    await query(
      `INSERT INTO lead_automation_teams (id, automation_id, team_id, created_at) VALUES ${valuePlaceholders} ON CONFLICT (automation_id, team_id) DO NOTHING`,
      [automationId, ...teamIds]
    );
  }
}

async function enrichAutomationsWithTeams(automations) {
  if (!automations || automations.length === 0) return automations;
  const ids = automations.map(a => a.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const teamsResult = await query(
    `SELECT automation_id, team_id FROM lead_automation_teams WHERE automation_id IN (${placeholders})`,
    ids
  );
  const teamMap = {};
  for (const row of teamsResult.rows) {
    if (!teamMap[row.automation_id]) teamMap[row.automation_id] = [];
    teamMap[row.automation_id].push(row.team_id);
  }
  return automations.map(a => {
    const fromJunction = teamMap[a.id] || [];
    if (fromJunction.length > 0) {
      return { ...a, team_ids: fromJunction };
    } else if (a.teamId) {
      return { ...a, team_ids: [a.teamId] };
    }
    return { ...a, team_ids: [] };
  });
}

for (const [route, options] of Object.entries(entities)) {
  const tableName = options.tableName || route.replace(/-/g, '_');
  const crud = createCrudRouter(tableName, options);
  
  if (route === 'lead-automations') {
    router.get(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.list(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams(data);
            const result = enriched.map(a => ({ ...a, teamIds: a.team_ids }));
            result.forEach(r => delete r.team_ids);
            originalJson(result);
          }
        });
      } catch (error) {
        console.error('Error listing lead-automations with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.get(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.get(req, {
          ...res,
          json: async (data) => {
            const enriched = await enrichAutomationsWithTeams([data]);
            const result = { ...enriched[0], teamIds: enriched[0].team_ids };
            delete result.team_ids;
            originalJson(result);
          }
        });
      } catch (error) {
        console.error('Error getting lead-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.post(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const teamIds = req.body.team_ids || req.body.teamIds || [];
        delete req.body.team_ids;
        delete req.body.teamIds;
        const originalStatus = res.status.bind(res);
        await crud.create(req, {
          ...res,
          status: (code) => {
            const statusRes = originalStatus(code);
            const origStatusJson = statusRes.json.bind(statusRes);
            return {
              ...statusRes,
              json: async (data) => {
                try {
                  if (data && data.id && teamIds.length > 0) {
                    await syncAutomationTeams(data.id, teamIds);
                    data.teamIds = teamIds;
                  }
                } catch (err) {
                  console.error('Error syncing teams on create:', err);
                }
                origStatusJson(data);
              }
            };
          }
        });
      } catch (error) {
        console.error('Error creating lead-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.put(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const hasTeamIds = 'team_ids' in req.body || 'teamIds' in req.body;
        const teamIds = hasTeamIds ? (req.body.team_ids || req.body.teamIds || []) : null;
        delete req.body.team_ids;
        delete req.body.teamIds;
        delete req.body.team_id;
        delete req.body.teamId;
        const originalJson = res.json.bind(res);
        await crud.update(req, {
          ...res,
          json: async (data) => {
            try {
              if (hasTeamIds) {
                await syncAutomationTeams(req.params.id, teamIds);
                data.teamIds = teamIds;
              }
            } catch (err) {
              console.error('Error syncing teams on update:', err);
            }
            originalJson(data);
          }
        });
      } catch (error) {
        console.error('Error updating lead-automation with teams:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.delete(`/${route}/:id`, authMiddleware, crud.delete);
    router.post(`/${route}/filter`, authMiddleware, crud.filter);
    continue;
  }

  if (route === 'activities-pj') {
    router.get(`/${route}`, authMiddleware, crud.list);
    router.get(`/${route}/:id`, authMiddleware, crud.get);

    router.post(`/${route}`, authMiddleware, async (req, res) => {
      try {
        if (!req.body.created_by && !req.body.createdBy && req.user?.id) {
          req.body.created_by = req.user.id;
        }
        const originalStatus = res.status.bind(res);
        await crud.create(req, {
          ...res,
          status: (code) => {
            const statusRes = originalStatus(code);
            const origStatusJson = statusRes.json.bind(statusRes);
            return {
              ...statusRes,
              json: async (data) => {
                const agentId = data?.createdBy || data?.created_by;
                if (data && data.id && agentId) {
                  console.log('[GCal Hook] Creating Google event for agent', agentId, 'activity', data.id);
                  createGoogleEvent(agentId, {
                    id: data.id,
                    type: data.type || data.Type,
                    description: data.description,
                    scheduled_at: data.scheduledAt || data.scheduled_at,
                  }).catch(err => console.error('[GCal Hook] create error:', err.message));
                }
                origStatusJson(data);
              }
            };
          }
        });
      } catch (error) {
        console.error('Error creating activity-pj with gcal hook:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.put(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const originalJson = res.json.bind(res);
        await crud.update(req, {
          ...res,
          json: async (data) => {
            const googleEventId = data?.googleEventId || data?.google_event_id;
            const agentId = data?.createdBy || data?.created_by;
            if (data && googleEventId && agentId) {
              console.log('[GCal Hook] Updating Google event', googleEventId, 'for agent', agentId);
              updateGoogleEvent(agentId, googleEventId, {
                type: data.type || data.Type,
                description: data.description,
                scheduled_at: data.scheduledAt || data.scheduled_at,
                completed: data.completed,
              }).catch(err => console.error('[GCal Hook] update error:', err.message));
            }
            originalJson(data);
          }
        });
      } catch (error) {
        console.error('Error updating activity-pj with gcal hook:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.delete(`/${route}/:id`, authMiddleware, async (req, res) => {
      try {
        const existing = await query('SELECT created_by, google_event_id FROM activities_pj WHERE id = $1', [req.params.id]);
        const row = existing.rows[0];

        const originalJson = res.json.bind(res);
        await crud.delete(req, {
          ...res,
          json: async (data) => {
            if (row && row.google_event_id && row.created_by) {
              deleteGoogleEvent(row.created_by, row.google_event_id)
                .catch(err => console.error('[GCal Hook] delete error:', err.message));
            }
            originalJson(data);
          }
        });
      } catch (error) {
        console.error('Error deleting activity-pj with gcal hook:', error);
        res.status(500).json({ message: error.message });
      }
    });

    router.post(`/${route}/filter`, authMiddleware, crud.filter);
    continue;
  }

  router.get(`/${route}`, authMiddleware, crud.list);
  router.get(`/${route}/:id`, authMiddleware, crud.get);
  router.post(`/${route}`, authMiddleware, crud.create);
  if (route === 'referral-channel-config') {
    router.put(`/${route}/:id`, authMiddleware, (req, res) => {
      if (req.body.channel_token === null || req.body.channel_token === undefined || req.body.channel_token === '' ||
          req.body.channelToken === null || req.body.channelToken === undefined || req.body.channelToken === '') {
        delete req.body.channel_token;
        delete req.body.channelToken;
      }
      return crud.update(req, res);
    });
  } else {
    router.put(`/${route}/:id`, authMiddleware, crud.update);
  }
  router.delete(`/${route}/:id`, authMiddleware, crud.delete);
  router.post(`/${route}/filter`, authMiddleware, crud.filter);
}

router.get('/agents', authMiddleware, async (req, res) => {
  try {
    const result = await query(`
      SELECT id, name, cpf, email, agent_type, team_id, skills, active, 
             photo_url, permissions, level, online, capacity, working_hours, 
             queue_ids, work_unit, role, must_reset_password, erp_agent_id,
             whatsapp_access_token, whatsapp_token_expires_at, created_at, updated_at
      FROM agents 
      ORDER BY created_at DESC 
      LIMIT 100
    `);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error listing agents:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/agents/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query(`
      SELECT id, name, cpf, email, agent_type, team_id, skills, active, 
             photo_url, permissions, level, online, capacity, working_hours, 
             queue_ids, work_unit, role, must_reset_password, erp_agent_id,
             whatsapp_access_token, whatsapp_token_expires_at, created_at, updated_at
      FROM agents WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    console.error('Error getting agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/agents', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    
    if (!data.email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    
    if (!data.password || data.password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    
    const existing = await query('SELECT id FROM agents WHERE email = $1', [data.email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }
    
    let password_hash = null;
    if (data.password) {
      password_hash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    
    const keys = Object.keys(data).filter(k => k !== 'password');
    const values = keys.map(k => data[k]);
    
    if (password_hash) {
      keys.push('password_hash');
      values.push(password_hash);
    }
    
    if (!keys.includes('role')) {
      keys.push('role');
      values.push('agent');
    }
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO agents (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const agent = result.rows[0];
    delete agent.password_hash;
    
    res.status(201).json(convertKeysToCamel(agent));
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/agents/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    // Convert empty strings to null for UUID fields
    const uuidFields = ['team_id'];
    for (const field of uuidFields) {
      if (data[field] === '' || data[field] === undefined) {
        data[field] = null;
      }
    }
    
    if (data.email) {
      const existing = await query('SELECT id FROM agents WHERE email = $1 AND id != $2', [data.email, id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: 'Email already in use by another agent' });
      }
    }
    
    if (data.password) {
      if (data.password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }
      data.password_hash = await bcrypt.hash(data.password, 10);
      data.password_updated_at = new Date();
      data.must_reset_password = false;
      delete data.password;
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => data[k]);
    
    if (keys.length === 0) {
      return res.status(400).json({ message: 'No data provided' });
    }
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE agents SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    const agent = result.rows[0];
    delete agent.password_hash;
    
    res.json(convertKeysToCamel(agent));
  } catch (error) {
    console.error('Error updating agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/agents/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM agents WHERE id = $1 RETURNING id, name, email', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ success: true, deleted: convertKeysToCamel(result.rows[0]) });
  } catch (error) {
    console.error('Error deleting agent:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/agents/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    
    let sql = `
      SELECT id, name, cpf, email, agent_type, team_id, skills, active, 
             photo_url, permissions, level, online, capacity, working_hours, 
             queue_ids, work_unit, role, erp_agent_id, created_at, updated_at
      FROM agents
    `;
    
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error filtering agents:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/agents/:id/reset-password', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ message: 'New password is required' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'New password must be at least 6 characters' });
    }
    
    const password_hash = await bcrypt.hash(newPassword, 10);
    
    const result = await query(
      `UPDATE agents SET password_hash = $1, password_updated_at = NOW(), must_reset_password = true, updated_at = NOW() 
       WHERE id = $2 RETURNING id, name, email`,
      [password_hash, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Agent not found' });
    }
    
    res.json({ success: true, message: 'Password reset successfully', agent: convertKeysToCamel(result.rows[0]) });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/system-settings', optionalAuth, async (req, res, next) => {
  const crud = createCrudRouter('system_settings', {});
  return crud.list(req, res);
});

function normalizeSort(sort) {
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  const dir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const aliases = {
    'createdDate': 'created_at', 'createdAt': 'created_at', 'created_date': 'created_at',
    'updatedDate': 'updated_at', 'updatedAt': 'updated_at', 'updated_date': 'updated_at'
  };
  return { field: aliases[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase(), dir };
}

router.get('/leads', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM leads ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM leads WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM leads';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['birth_date', 'first_contact_date', 'next_contact_date', 'scheduled_visit_date', 'created_at', 'updated_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.whatsapp || data.phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupCheck = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupCheck.rows.length > 0) {
        const dup = dupCheck.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO leads (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    if (lead.agent_id || lead.assigned_agent_id) {
      await notifyLeadAssigned(lead, lead.agent_id || lead.assigned_agent_id);
    }
    
    executeLeadCreatedAutomation(lead, 'lead').catch(err => {
      console.error('[Automation] Error in lead_created automation:', err.message);
    });
    
    res.status(201).json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error creating lead:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    const oldLeadResult = await query('SELECT * FROM leads WHERE id = $1', [id]);
    const oldLead = oldLeadResult.rows[0];
    
    if (!oldLead) {
      return res.status(404).json({ message: 'Lead not found' });
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          JSON.parse(val);
          return val;
        } catch (e) {
          return val;
        }
      }
      return val;
    });
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE leads SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    const currentUserId = req.user?.id;
    
    if (data.stage && data.stage !== oldLead.stage) {
      await notifyLeadStageChanged(lead, oldLead.stage, data.stage, currentUserId);
    }
    
    const newAgentId = data.agent_id || data.assigned_agent_id;
    const oldAgentId = oldLead.agent_id || oldLead.assigned_agent_id;
    if (newAgentId && newAgentId !== oldAgentId) {
      await notifyLeadAssigned(lead, newAgentId);
    }
    
    if (data.proposal_status && data.proposal_status !== oldLead.proposal_status) {
      if (data.proposal_status === 'accepted' || data.proposal_status === 'rejected') {
        await notifyProposalStatus(lead, data.proposal_status);
      }
    }
    
    res.json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error updating lead:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-pj', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM leads_pj ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads_pj WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM leads_pj WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-pj/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM leads_pj';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-pj', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['foundation_date', 'first_contact_date', 'next_contact_date', 'scheduled_visit_date', 'created_at', 'updated_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupPF = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPF.rows.length > 0) {
        const dup = dupPF.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    const filteredData = await filterValidColumns('leads_pj', data);
    const keys = Object.keys(filteredData).filter(k => filteredData[k] !== null && filteredData[k] !== undefined && filteredData[k] !== '');
    const values = keys.map(k => {
      const val = filteredData[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO leads_pj (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    if (lead.agent_id) {
      await notifyLeadPJAssigned(lead, lead.agent_id);
    }
    
    executeLeadCreatedAutomation(lead, 'lead_pj').catch(err => {
      console.error('[Automation] Error in lead_pj_created automation:', err.message);
    });
    
    res.status(201).json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error creating lead PJ:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    const oldLeadResult = await query('SELECT * FROM leads_pj WHERE id = $1', [id]);
    const oldLead = oldLeadResult.rows[0];
    
    if (!oldLead) {
      return res.status(404).json({ message: 'Lead PJ not found' });
    }
    
    const filteredData = await filterValidColumns('leads_pj', data);
    const keys = Object.keys(filteredData);
    const values = keys.map(k => {
      const val = filteredData[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          JSON.parse(val);
          return val;
        } catch (e) {
          return val;
        }
      }
      return val;
    });
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE leads_pj SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    const lead = result.rows[0];
    
    if (data.agent_id && data.agent_id !== oldLead.agent_id) {
      await notifyLeadPJAssigned(lead, data.agent_id);
    }
    
    res.json(convertKeysToCamel(lead));
  } catch (error) {
    console.error('Error updating lead PJ:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/referrals', authMiddleware, async (req, res) => {
  try {
    const { sort = '-created_at', limit = 10000 } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    const result = await query(`SELECT * FROM referrals ORDER BY ${sortField} ${sortDir} LIMIT $1`, [parseInt(limit)]);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/referrals/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM referrals WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/referrals/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM referrals WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/referrals/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM referrals';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/referrals', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const dateFields = ['birth_date', 'referred_birth_date', 'created_at', 'updated_at', 'converted_at', 'commission_paid_at'];
    dateFields.forEach(field => {
      if (data[field] === '' || data[field] === 'Invalid Date') {
        data[field] = null;
      }
    });

    const phoneToCheck = data.referred_phone;
    if (phoneToCheck) {
      const cleanPhone = phoneToCheck.replace(/\D/g, '');
      const dupPF = await query(
        `SELECT l.id, l.name, a.name as agent_name FROM leads l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.whatsapp, l.phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPF.rows.length > 0) {
        const dup = dupPF.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PF. Lead "${dup.name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupPJ = await query(
        `SELECT l.id, COALESCE(l.nome_fantasia, l.razao_social, l.contact_name) as display_name, a.name as agent_name FROM leads_pj l LEFT JOIN agents a ON l.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(l.contact_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupPJ.rows.length > 0) {
        const dup = dupPJ.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Vendas PJ. Lead "${dup.display_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
      const dupRef = await query(
        `SELECT r.id, r.referred_name, a.name as agent_name FROM referrals r LEFT JOIN agents a ON r.agent_id::text = a.id::text WHERE REGEXP_REPLACE(COALESCE(r.referred_phone, ''), '[^0-9]', '', 'g') = $1`,
        [cleanPhone]
      );
      if (dupRef.rows.length > 0) {
        const dup = dupRef.rows[0];
        return res.status(409).json({ message: `WhatsApp ja cadastrado em Indicacoes. Lead "${dup.referred_name}" com o agente ${dup.agent_name || 'nao atribuido'}.` });
      }
    }

    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined && data[k] !== '');
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO referrals (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const referral = result.rows[0];
    
    if (referral.agent_id) {
      await notifyReferralAssigned(referral, referral.agent_id);
    }
    
    // TEMPORARIAMENTE DESATIVADO — template incorreto
    // Reativar após correção do template
    // executeLeadCreatedAutomation(referral, 'referral').catch(err => {
    //   console.error('[Automation] Error in referral_created automation:', err.message);
    // });
    
    res.status(201).json(convertKeysToCamel(referral));
  } catch (error) {
    console.error('Error creating referral:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/referrals/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    
    const oldResult = await query('SELECT * FROM referrals WHERE id = $1', [id]);
    const oldReferral = oldResult.rows[0];
    
    if (!oldReferral) {
      return res.status(404).json({ message: 'Referral not found' });
    }
    
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (val === null || val === undefined) return val;
      if (Array.isArray(val)) return JSON.stringify(val);
      if (typeof val === 'object') return JSON.stringify(val);
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          JSON.parse(val);
          return val;
        } catch (e) {
          return val;
        }
      }
      return val;
    });
    
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE referrals SET ${setClause}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(sql, values);
    const referral = result.rows[0];
    
    if (data.agent_id && data.agent_id !== oldReferral.agent_id) {
      await notifyReferralAssigned(referral, data.agent_id);
    }
    
    res.json(convertKeysToCamel(referral));
  } catch (error) {
    console.error('Error updating referral:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/activities', authMiddleware, async (req, res) => {
  try {
    const { sort = '-scheduled_at', limit = 100, lead_id } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    let sql = `SELECT * FROM activities`;
    const params = [];
    if (lead_id) {
      params.push(lead_id);
      sql += ` WHERE lead_id = $1`;
    }
    sql += ` ORDER BY ${sortField} ${sortDir} LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM activities WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const existing = await query('SELECT created_by, google_event_id FROM activities WHERE id = $1', [req.params.id]);
    if (existing.rows.length > 0 && existing.rows[0].google_event_id && existing.rows[0].created_by) {
      console.log('[GCal Hook] Deleting Google event (PF)', existing.rows[0].google_event_id);
      deleteGoogleEvent(existing.rows[0].created_by, existing.rows[0].google_event_id)
        .catch(err => console.error('[GCal Hook] delete error (PF):', err.message));
    }
    const result = await query('DELETE FROM activities WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/activities/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM activities';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/activities/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) return JSON.stringify(val);
      return val;
    });
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE activities SET ${setClause} WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const activity = result.rows[0];

    if (activity.google_event_id && activity.created_by) {
      console.log('[GCal Hook] Updating Google event (PF)', activity.google_event_id);
      updateGoogleEvent(activity.created_by, activity.google_event_id, {
        type: activity.type,
        description: activity.title || activity.description,
        scheduled_at: activity.scheduled_at,
        completed: activity.completed,
      }).catch(err => console.error('[GCal Hook] update error (PF):', err.message));
    }

    res.json(convertKeysToCamel(activity));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/activities', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    if (!data.created_by && req.user?.id) {
      data.created_by = req.user.id;
    }
    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO activities (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const activity = result.rows[0];
    
    if (activity.type === 'comment' && activity.lead_id) {
      const leadResult = await query('SELECT * FROM leads WHERE id = $1', [activity.lead_id]);
      const lead = leadResult.rows[0];
      if (lead) {
        await notifyLeadComment(lead, activity.agent_id, activity.description || activity.notes || '');
      }
    }

    if (activity.created_by && activity.scheduled_at) {
      console.log('[GCal Hook] Creating Google event for activity (PF)', activity.id);
      createGoogleEvent(activity.created_by, {
        id: activity.id,
        type: activity.type,
        description: activity.title || activity.description,
        scheduled_at: activity.scheduled_at,
      }, 'activities').catch(err => console.error('[GCal Hook] create error (PF):', err.message));
    }
    
    res.status(201).json(convertKeysToCamel(activity));
  } catch (error) {
    console.error('Error creating activity:', error);
    res.status(500).json({ message: error.message });
  }
});

router.get('/visits', authMiddleware, async (req, res) => {
  try {
    const { sort = '-visited_at', limit = 100, lead_id } = req.query;
    const { field: sortField, dir: sortDir } = normalizeSort(sort);
    let sql = `SELECT * FROM visits`;
    const params = [];
    if (lead_id) {
      params.push(lead_id);
      sql += ` WHERE lead_id = $1`;
    }
    sql += ` ORDER BY ${sortField} ${sortDir} LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));
    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/visits/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM visits WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/visits/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM visits WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/visits/filter', authMiddleware, async (req, res) => {
  try {
    const filters = convertKeysToSnake(req.body);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM visits';
    if (keys.length > 0) {
      const conditions = keys.map((key, i) => `${key} = $${i + 1}`).join(' AND ');
      sql += ` WHERE ${conditions}`;
    }
    sql += ' ORDER BY visited_at DESC';
    const result = await query(sql, values);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/visits/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    const keys = Object.keys(data);
    const values = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) return JSON.stringify(val);
      return val;
    });
    const setClause = keys.map((key, i) => `${key} = $${i + 1}`).join(', ');
    values.push(id);
    const sql = `UPDATE visits SET ${setClause} WHERE id = $${values.length} RETURNING *`;
    const result = await query(sql, values);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/visits', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const currentUserId = req.user?.id;
    
    const keys = Object.keys(data).filter(k => data[k] !== null && data[k] !== undefined);
    const values = keys.map(k => {
      const val = data[k];
      // Serialize both objects and arrays as JSON for JSONB fields
      if (typeof val === 'object' && val !== null) return JSON.stringify(val);
      return val;
    });
    
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO visits (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`;
    
    const result = await query(sql, values);
    const visit = result.rows[0];
    
    if (visit.lead_id) {
      const leadResult = await query('SELECT * FROM leads WHERE id = $1', [visit.lead_id]);
      const lead = leadResult.rows[0];
      await notifyVisitScheduled(visit, lead, currentUserId);
    }
    
    res.status(201).json(convertKeysToCamel(visit));
  } catch (error) {
    console.error('Error creating visit:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
