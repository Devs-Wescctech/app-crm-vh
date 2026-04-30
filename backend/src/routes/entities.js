import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createCrudRouter, filterValidColumns } from '../utils/crud.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { loadAgentMiddleware, requireRole } from '../middleware/permissions.js';
import { query, pool } from '../config/database.js';
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
import { enqueueGcalOp } from '../services/gcalOutboxService.js';

const router = Router();

/**
 * Defesa em profundidade: resolve a lista de agent_ids que o usuário logado
 * pode enxergar, espelhando a regra do frontend (src/components/utils/permissions.jsx).
 *
 * Regras:
 *  - admin / coordinator: null  → significa "sem filtro" (vê tudo)
 *  - supervisor / *_supervisor: subordinados (agents.supervisor_id == eu)
 *      + se o supervisor for o "dono" de algum time (teams.supervisor_id == eu),
 *        inclui também os membros desses times
 *      + sempre inclui o próprio id
 *  - demais perfis: apenas o próprio id
 *
 * Retorna null para "sem restrição" e [] explicitamente quando o usuário
 * não tem visibilidade alguma.
 */
async function resolveVisibleAgentIds(userId) {
  if (!userId) return [];
  const me = await query('SELECT id, agent_type FROM agents WHERE id = $1', [userId]);
  if (me.rows.length === 0) return [];
  const agentType = me.rows[0].agent_type;

  if (agentType === 'admin' || agentType === 'coordinator') return null;

  const isSupervisor =
    agentType === 'supervisor' ||
    agentType === 'sales_supervisor' ||
    (typeof agentType === 'string' && agentType.endsWith('_supervisor'));

  if (isSupervisor) {
    const subs = await query('SELECT id FROM agents WHERE supervisor_id = $1', [userId]);
    const ids = new Set(subs.rows.map(r => r.id));
    const ownedTeams = await query('SELECT id FROM teams WHERE supervisor_id = $1', [userId]);
    if (ownedTeams.rows.length > 0) {
      const teamIds = ownedTeams.rows.map(r => r.id);
      const placeholders = teamIds.map((_, i) => `$${i + 1}`).join(',');
      const teamMembers = await query(
        `SELECT id FROM agents WHERE team_id IN (${placeholders})`,
        teamIds
      );
      teamMembers.rows.forEach(r => ids.add(r.id));
    }
    ids.add(userId);
    return Array.from(ids);
  }

  return [userId];
}

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
  notifications: {
    allowedFilters: ['user_email', 'read', 'type'],
    // Hide rows that were inserted purely to act as the cross-channel dedupe
    // ledger when the user disabled the in-app preference. This matches the
    // filter used by the legacy /check-notifications endpoint.
    extraWhere: ['COALESCE(in_app_visible, true) = true'],
  },
  'notification-preferences': { tableName: 'notification_preferences', allowedFilters: ['user_email'] },
  'quality-checklists': { tableName: 'quality_checklists', searchFields: ['name'] },
  'call-audits': { tableName: 'call_audits', allowedFilters: ['agent_id', 'ticket_id', 'status'] },
  // Task #63 — catálogo de produtos selecionáveis nos itens da proposta.
  products: { searchFields: ['name', 'description'], allowedFilters: ['active'] },
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
    // Defesa em profundidade: filtra atividades pelos leads cujo agent_id é
    // visível ao supervisor logado. Admin/coordenador → sem filtro.
    router.get(`/${route}`, authMiddleware, async (req, res) => {
      try {
        const visibleIds = await resolveVisibleAgentIds(req.user?.id);
        const { sort = '-scheduled_at', limit = 10000 } = req.query;
        const { field: sortField, dir: sortDir } = normalizeSort(sort);

        let sql = 'SELECT * FROM activities_pj';
        const params = [];
        if (visibleIds === null) {
          // sem restrição
        } else if (visibleIds.length === 0) {
          return res.json([]);
        } else {
          const placeholders = visibleIds.map((_, i) => `$${i + 1}`).join(',');
          sql += ` WHERE lead_id IN (SELECT id FROM leads_pj WHERE agent_id::text IN (${placeholders}))`;
          params.push(...visibleIds);
        }
        params.push(parseInt(limit));
        sql += ` ORDER BY ${sortField} ${sortDir} LIMIT $${params.length}`;
        const result = await query(sql, params);
        res.json(result.rows.map(convertKeysToCamel));
      } catch (error) {
        console.error('Error listing activities-pj with visibility:', error);
        res.status(500).json({ message: error.message });
      }
    });
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
                  // Phase 2.1 — enqueue instead of calling Google directly.
                  enqueueGcalOp({
                    agentId,
                    activityId: data.id,
                    activityTable: 'activities_pj',
                    op: 'create',
                    payload: {
                      type: data.type || data.Type,
                      description: data.description,
                      scheduled_at: data.scheduledAt || data.scheduled_at,
                    },
                  });
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
        // Task #65 — para notas comuns na timeline (type='note'), só o autor
        // ou admin/coordenador podem editar. Demais tipos seguem o
        // comportamento original (necessário para fluxos como marcar tarefa
        // como concluída pelo agente responsável).
        const existingForGate = await query(
          'SELECT type, created_by FROM activities_pj WHERE id = $1',
          [req.params.id]
        );
        if (existingForGate.rows.length === 0) {
          return res.status(404).json({ message: 'Activity not found' });
        }
        const { type: existingType, created_by: existingCreatedBy } = existingForGate.rows[0];
        if (existingType === 'note') {
          const visibleIds = await resolveVisibleAgentIds(req.user?.id);
          const isFullVisibility = visibleIds === null;
          if (!isFullVisibility && String(existingCreatedBy) !== String(req.user?.id)) {
            return res.status(403).json({ message: 'Only the author can edit this note' });
          }
        }

        const originalJson = res.json.bind(res);
        await crud.update(req, {
          ...res,
          json: async (data) => {
            const agentId = data?.createdBy || data?.created_by;
            if (data && data.id && agentId) {
              // Phase 2.1 — enqueue update. Worker will resolve the
              // google_event_id from the activity row at execution time.
              enqueueGcalOp({
                agentId,
                activityId: data.id,
                activityTable: 'activities_pj',
                op: 'update',
                payload: {
                  type: data.type || data.Type,
                  description: data.description,
                  scheduled_at: data.scheduledAt || data.scheduled_at,
                  completed: data.completed,
                },
              });
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
        const existing = await query('SELECT type, created_by, google_event_id FROM activities_pj WHERE id = $1', [req.params.id]);
        const row = existing.rows[0];
        if (!row) {
          return res.status(404).json({ message: 'Activity not found' });
        }
        // Task #65 — mesma regra do PUT: notas só podem ser excluídas pelo
        // autor ou admin/coordenador.
        if (row.type === 'note') {
          const visibleIds = await resolveVisibleAgentIds(req.user?.id);
          const isFullVisibility = visibleIds === null;
          if (!isFullVisibility && String(row.created_by) !== String(req.user?.id)) {
            return res.status(403).json({ message: 'Only the author can delete this note' });
          }
        }

        const originalJson = res.json.bind(res);
        await crud.delete(req, {
          ...res,
          json: async (data) => {
            if (row && row.google_event_id && row.created_by) {
              // Phase 2.1 — enqueue deletion. activity_id is null because
              // the row was just deleted; payload carries the event id.
              enqueueGcalOp({
                agentId: row.created_by,
                activityId: null,
                activityTable: 'activities_pj',
                op: 'delete',
                payload: { google_event_id: row.google_event_id },
              });
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

  if (route === 'products') {
    // Task #63 — leitura disponível para qualquer usuário autenticado (o
    // vendedor precisa listar produtos para selecionar no item da proposta),
    // mas escrita é restrita a admin/coordenador, mesmo set que controla a
    // aba "Produtos" em Configurações no frontend (SystemsProducts).
    const productsAdminGuard = [authMiddleware, loadAgentMiddleware, requireRole('admin', 'coordinator')];
    router.get(`/${route}`, authMiddleware, crud.list);
    router.get(`/${route}/:id`, authMiddleware, crud.get);
    router.post(`/${route}`, productsAdminGuard, crud.create);
    router.put(`/${route}/:id`, productsAdminGuard, crud.update);
    router.delete(`/${route}/:id`, productsAdminGuard, crud.delete);
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
      SELECT id, name, cpf, email, agent_type, team_id, supervisor_id, skills, active, 
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
      SELECT id, name, cpf, email, agent_type, team_id, supervisor_id, skills, active, 
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

    if (req.user?.id) {
      const requestor = await query('SELECT agent_type, team_id FROM agents WHERE id = $1', [req.user.id]);
      if (requestor.rows.length > 0) {
        const reqType = requestor.rows[0].agent_type;
        const reqTeamId = requestor.rows[0].team_id;

        if (!['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(reqType)) {
          return res.status(403).json({ message: 'Sem permissão para criar agentes' });
        }

        if (reqType === 'coordinator' && data.agent_type === 'admin') {
          return res.status(403).json({ message: 'Coordenadores não podem criar agentes do tipo admin' });
        }

        if (reqType === 'supervisor' || reqType === 'sales_supervisor') {
          if (['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(data.agent_type)) {
            return res.status(403).json({ message: 'Supervisores só podem criar agentes do tipo vendedor' });
          }
          const supTeam = await query('SELECT id FROM teams WHERE supervisor_id = $1', [req.user.id]);
          const supervisorTeamId = supTeam.rows.length > 0 ? supTeam.rows[0].id : reqTeamId;
          if (supervisorTeamId) {
            data.team_id = supervisorTeamId;
          }
          data.supervisor_id = req.user.id;
        }
      }
    }
    
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
    
    for (const key of Object.keys(data)) {
      if ((key.endsWith('_id') || key === 'id') && data[key] === '') {
        data[key] = null;
      }
    }

    let password_hash = null;
    if (data.password) {
      password_hash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }
    
    const nonAgentFields = ['coordinator_id', 'allowed_submenus', 'modules'];
    for (const f of nonAgentFields) {
      delete data[f];
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

    if (req.user?.id) {
      const requestor = await query('SELECT agent_type, team_id FROM agents WHERE id = $1', [req.user.id]);
      if (requestor.rows.length > 0) {
        const reqType = requestor.rows[0].agent_type;
        const reqTeamId = requestor.rows[0].team_id;

        if (!['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(reqType) && id !== req.user.id) {
          return res.status(403).json({ message: 'Sem permissão para editar agentes' });
        }

        if (reqType === 'coordinator' && data.agent_type === 'admin') {
          return res.status(403).json({ message: 'Coordenadores não podem alterar agentes para o tipo admin' });
        }

        if (reqType === 'supervisor' || reqType === 'sales_supervisor') {
          if (data.agent_type && ['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(data.agent_type)) {
            return res.status(403).json({ message: 'Supervisores não podem promover agentes para este tipo' });
          }
          const targetAgent = await query('SELECT supervisor_id, agent_type FROM agents WHERE id = $1', [id]);
          if (targetAgent.rows.length > 0) {
            if (targetAgent.rows[0].supervisor_id !== req.user.id) {
              return res.status(403).json({ message: 'Supervisores só podem editar seus próprios vendedores' });
            }
            if (['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(targetAgent.rows[0].agent_type)) {
              return res.status(403).json({ message: 'Supervisores não podem editar agentes deste tipo' });
            }
          }
          delete data.team_id;
          data.supervisor_id = req.user.id;
        }
      }
    }
    
    const uuidFields = ['team_id', 'supervisor_id', 'coordinator_id'];
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
    
    const nonAgentFields = ['coordinator_id', 'allowed_submenus', 'modules'];
    for (const f of nonAgentFields) {
      delete data[f];
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

    if (req.user?.id) {
      const requestor = await query('SELECT agent_type, team_id FROM agents WHERE id = $1', [req.user.id]);
      if (requestor.rows.length > 0) {
        const reqType = requestor.rows[0].agent_type;
        const reqTeamId = requestor.rows[0].team_id;

        if (!['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(reqType)) {
          return res.status(403).json({ message: 'Sem permissão para excluir agentes' });
        }

        if (reqType === 'supervisor' || reqType === 'sales_supervisor') {
          const targetAgent = await query('SELECT supervisor_id, agent_type FROM agents WHERE id = $1', [id]);
          if (targetAgent.rows.length > 0) {
            if (targetAgent.rows[0].supervisor_id !== req.user.id) {
              return res.status(403).json({ message: 'Supervisores só podem excluir seus próprios vendedores' });
            }
            if (['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(targetAgent.rows[0].agent_type)) {
              return res.status(403).json({ message: 'Supervisores não podem excluir agentes deste tipo' });
            }
          }
        }
      }
    }

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
      SELECT id, name, cpf, email, agent_type, team_id, supervisor_id, skills, active, 
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

    if (req.user?.id) {
      const requestor = await query('SELECT agent_type, team_id FROM agents WHERE id = $1', [req.user.id]);
      if (requestor.rows.length > 0) {
        const reqType = requestor.rows[0].agent_type;
        if (!['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(reqType)) {
          return res.status(403).json({ message: 'Sem permissão para redefinir senhas' });
        }
        if (reqType === 'supervisor' || reqType === 'sales_supervisor') {
          const targetAgent = await query('SELECT supervisor_id, agent_type FROM agents WHERE id = $1', [id]);
          if (targetAgent.rows.length > 0) {
            if (targetAgent.rows[0].supervisor_id !== req.user.id) {
              return res.status(403).json({ message: 'Supervisores só podem redefinir senhas de seus próprios vendedores' });
            }
            if (['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(targetAgent.rows[0].agent_type)) {
              return res.status(403).json({ message: 'Supervisores não podem redefinir senhas de agentes deste tipo' });
            }
          }
        }
      }
    }
    
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

const ALLOWED_SORT_FIELDS = new Set([
  'created_at', 'updated_at', 'name', 'email', 'stage', 'status', 'priority',
  'contact_name', 'razao_social', 'nome_fantasia', 'value', 'monthly_value',
  'scheduled_at', 'due_date', 'agent_id', 'team_id', 'id'
]);

function normalizeSort(sort) {
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  const dir = sort.startsWith('-') ? 'DESC' : 'ASC';
  const aliases = {
    'createdDate': 'created_at', 'createdAt': 'created_at', 'created_date': 'created_at',
    'updatedDate': 'updated_at', 'updatedAt': 'updated_at', 'updated_date': 'updated_at',
    'scheduledAt': 'scheduled_at', 'dueDate': 'due_date'
  };
  const resolved = aliases[field] || field.replace(/([A-Z])/g, '_$1').toLowerCase();
  const safeField = ALLOWED_SORT_FIELDS.has(resolved) ? resolved : 'created_at';
  return { field: safeField, dir };
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

    const visibleIds = await resolveVisibleAgentIds(req.user?.id);
    let sql = `SELECT * FROM leads_pj`;
    const params = [];
    if (visibleIds === null) {
      // admin/coordenador → sem filtro
    } else if (visibleIds.length === 0) {
      return res.json([]);
    } else {
      const placeholders = visibleIds.map((_, i) => `$${i + 1}`).join(',');
      sql += ` WHERE agent_id::text IN (${placeholders})`;
      params.push(...visibleIds);
    }

    sql += ` ORDER BY ${sortField} ${sortDir} LIMIT $${params.length + 1}`;
    params.push(parseInt(limit));

    const result = await query(sql, params);
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/leads-pj/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM leads_pj WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const lead = result.rows[0];

    // Defesa em profundidade: o usuário só pode acessar o lead se o agent_id
    // dele estiver na sua lista de visíveis (admin/coord = sem restrição).
    const visibleIds = await resolveVisibleAgentIds(req.user?.id);
    if (visibleIds !== null) {
      const owner = lead.agent_id ? String(lead.agent_id) : null;
      if (!owner || !visibleIds.includes(owner)) {
        return res.status(404).json({ message: 'Not found' });
      }
    }

    res.json(convertKeysToCamel(lead));
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

// =====================
// LEAD NOTES PJ (Timeline de notas dentro do lead)
// =====================
async function assertLeadVisibleForUser(leadId, userId) {
  const visibleIds = await resolveVisibleAgentIds(userId);
  const result = await query('SELECT agent_id FROM leads_pj WHERE id = $1', [leadId]);
  if (result.rows.length === 0) return { ok: false, status: 404, message: 'Lead not found' };
  if (visibleIds === null) return { ok: true };
  const owner = result.rows[0].agent_id ? String(result.rows[0].agent_id) : null;
  if (!owner || !visibleIds.includes(owner)) return { ok: false, status: 404, message: 'Lead not found' };
  return { ok: true };
}

router.get('/lead-notes-pj', authMiddleware, async (req, res) => {
  try {
    const leadId = req.query.lead_id || req.query.leadId;
    if (!leadId) return res.status(400).json({ message: 'lead_id is required' });
    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });
    const result = await query(
      'SELECT * FROM lead_notes_pj WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error listing lead-notes-pj:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/lead-notes-pj/filter', authMiddleware, async (req, res) => {
  try {
    const filters = req.body || {};
    const leadId = filters.lead_id || filters.leadId;
    if (!leadId) return res.status(400).json({ message: 'lead_id is required' });
    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });
    const result = await query(
      'SELECT * FROM lead_notes_pj WHERE lead_id = $1 ORDER BY created_at DESC',
      [leadId]
    );
    res.json(result.rows.map(convertKeysToCamel));
  } catch (error) {
    console.error('Error filtering lead-notes-pj:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/lead-notes-pj', authMiddleware, async (req, res) => {
  try {
    const data = convertKeysToSnake(req.body);
    const leadId = data.lead_id;
    const content = (data.content || '').trim();
    if (!leadId) return res.status(400).json({ message: 'lead_id is required' });
    if (!content) return res.status(400).json({ message: 'content is required' });
    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const userId = req.user?.id || null;
    let userName = null;
    if (userId) {
      const a = await query('SELECT name FROM agents WHERE id = $1', [userId]);
      userName = a.rows[0]?.name || null;
    }

    const result = await query(
      `INSERT INTO lead_notes_pj (lead_id, content, created_by, created_by_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [leadId, content, userId, userName]
    );
    res.status(201).json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    console.error('Error creating lead-notes-pj:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/lead-notes-pj/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const data = convertKeysToSnake(req.body);
    const content = (data.content || '').trim();
    if (!content) return res.status(400).json({ message: 'content is required' });

    const existing = await query('SELECT lead_id, created_by FROM lead_notes_pj WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
    const { lead_id, created_by } = existing.rows[0];

    const visibility = await assertLeadVisibleForUser(lead_id, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    // Apenas o autor da nota ou admin/coordenador pode editar.
    const visibleIds = await resolveVisibleAgentIds(req.user?.id);
    const isFullVisibility = visibleIds === null;
    if (!isFullVisibility && String(created_by) !== String(req.user?.id)) {
      return res.status(403).json({ message: 'Only the author can edit this note' });
    }

    const result = await query(
      `UPDATE lead_notes_pj SET content = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [content, id]
    );
    res.json(convertKeysToCamel(result.rows[0]));
  } catch (error) {
    console.error('Error updating lead-notes-pj:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/lead-notes-pj/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT lead_id, created_by FROM lead_notes_pj WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Note not found' });
    const { lead_id, created_by } = existing.rows[0];

    const visibility = await assertLeadVisibleForUser(lead_id, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const visibleIds = await resolveVisibleAgentIds(req.user?.id);
    const isFullVisibility = visibleIds === null;
    if (!isFullVisibility && String(created_by) !== String(req.user?.id)) {
      return res.status(403).json({ message: 'Only the author can delete this note' });
    }

    await query('DELETE FROM lead_notes_pj WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead-notes-pj:', error);
    res.status(500).json({ message: error.message });
  }
});

// =====================================================================
// LEAD PJ PROPOSAL ITEMS (múltiplos produtos por proposta)
// =====================================================================
async function recomputeLeadPjValueFromItems(leadId, executor = query) {
  const sumResult = await executor(
    `SELECT COALESCE(SUM(quantidade * valor_unitario), 0) AS total
       FROM lead_pj_proposal_items
      WHERE lead_id = $1`,
    [leadId]
  );
  const total = Number(sumResult.rows[0]?.total || 0);
  await executor('UPDATE leads_pj SET value = $1, updated_at = NOW() WHERE id = $2', [total, leadId]);
  return total;
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exec = (text, params) => client.query(text, params);
    const result = await fn(exec);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

async function fetchProposalItemsByLead(leadId) {
  const result = await query(
    `SELECT * FROM lead_pj_proposal_items
       WHERE lead_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
    [leadId]
  );
  return result.rows.map(convertKeysToCamel);
}

router.get('/lead-pj-proposal-items', authMiddleware, async (req, res) => {
  try {
    const leadId = req.query.lead_id || req.query.leadId;
    if (!leadId) return res.status(400).json({ message: 'lead_id is required' });
    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });
    res.json(await fetchProposalItemsByLead(leadId));
  } catch (error) {
    console.error('Error listing lead-pj-proposal-items:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/lead-pj-proposal-items/filter', authMiddleware, async (req, res) => {
  try {
    const filters = req.body || {};
    const leadId = filters.lead_id || filters.leadId;
    if (!leadId) return res.status(400).json({ message: 'lead_id is required' });
    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });
    res.json(await fetchProposalItemsByLead(leadId));
  } catch (error) {
    console.error('Error filtering lead-pj-proposal-items:', error);
    res.status(500).json({ message: error.message });
  }
});

function parseItemPayload(body) {
  const data = convertKeysToSnake(body || {});
  const descricao = (data.descricao || '').toString().trim();
  const quantidadeRaw = data.quantidade;
  const valorUnitarioRaw = data.valor_unitario;
  const sortOrderRaw = data.sort_order;
  const quantidade = quantidadeRaw === undefined || quantidadeRaw === null || quantidadeRaw === ''
    ? 1
    : Number(quantidadeRaw);
  const valorUnitario = valorUnitarioRaw === undefined || valorUnitarioRaw === null || valorUnitarioRaw === ''
    ? 0
    : Number(valorUnitarioRaw);
  const sortOrderProvided = !(sortOrderRaw === undefined || sortOrderRaw === null || sortOrderRaw === '');
  const sortOrder = sortOrderProvided ? Number(sortOrderRaw) : null;
  // Task #63 — product_id é opcional. Tratamos string vazia como null para
  // permitir itens em texto livre (descrição manual sem catálogo).
  const productIdRaw = data.product_id;
  const productId = (productIdRaw === undefined || productIdRaw === null || productIdRaw === '')
    ? null
    : String(productIdRaw);
  return {
    lead_id: data.lead_id,
    descricao,
    quantidade,
    valor_unitario: valorUnitario,
    sort_order: sortOrder,
    sort_order_provided: sortOrderProvided,
    product_id: productId,
  };
}

function validateItem({ descricao, quantidade, valor_unitario }) {
  if (!descricao) return 'descricao is required';
  if (!Number.isFinite(quantidade) || quantidade <= 0) return 'quantidade must be greater than 0';
  if (!Number.isFinite(valor_unitario) || valor_unitario < 0) return 'valor_unitario must be >= 0';
  return null;
}

router.post('/lead-pj-proposal-items', authMiddleware, async (req, res) => {
  try {
    const payload = parseItemPayload(req.body);
    if (!payload.lead_id) return res.status(400).json({ message: 'lead_id is required' });
    const validationError = validateItem(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const visibility = await assertLeadVisibleForUser(payload.lead_id, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const sortOrder = payload.sort_order_provided ? payload.sort_order : 0;

    const inserted = await withTransaction(async (exec) => {
      const result = await exec(
        `INSERT INTO lead_pj_proposal_items (lead_id, descricao, quantidade, valor_unitario, sort_order, product_id)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [payload.lead_id, payload.descricao, payload.quantidade, payload.valor_unitario, sortOrder, payload.product_id]
      );
      await recomputeLeadPjValueFromItems(payload.lead_id, exec);
      return result.rows[0];
    });
    res.status(201).json(convertKeysToCamel(inserted));
  } catch (error) {
    console.error('Error creating lead-pj-proposal-items:', error);
    res.status(500).json({ message: error.message });
  }
});

router.put('/lead-pj-proposal-items/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query(
      'SELECT lead_id, sort_order FROM lead_pj_proposal_items WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Item not found' });
    const leadId = existing.rows[0].lead_id;
    const existingSortOrder = existing.rows[0].sort_order;

    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    const payload = parseItemPayload({ ...req.body, lead_id: leadId });
    const validationError = validateItem(payload);
    if (validationError) return res.status(400).json({ message: validationError });

    const sortOrder = payload.sort_order_provided ? payload.sort_order : existingSortOrder;

    const updated = await withTransaction(async (exec) => {
      const result = await exec(
        `UPDATE lead_pj_proposal_items
            SET descricao = $1,
                quantidade = $2,
                valor_unitario = $3,
                sort_order = $4,
                product_id = $5,
                updated_at = NOW()
          WHERE id = $6
          RETURNING *`,
        [payload.descricao, payload.quantidade, payload.valor_unitario, sortOrder, payload.product_id, id]
      );
      await recomputeLeadPjValueFromItems(leadId, exec);
      return result.rows[0];
    });
    res.json(convertKeysToCamel(updated));
  } catch (error) {
    console.error('Error updating lead-pj-proposal-items:', error);
    res.status(500).json({ message: error.message });
  }
});

router.delete('/lead-pj-proposal-items/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await query('SELECT lead_id FROM lead_pj_proposal_items WHERE id = $1', [id]);
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Item not found' });
    const leadId = existing.rows[0].lead_id;

    const visibility = await assertLeadVisibleForUser(leadId, req.user?.id);
    if (!visibility.ok) return res.status(visibility.status).json({ message: visibility.message });

    await withTransaction(async (exec) => {
      await exec('DELETE FROM lead_pj_proposal_items WHERE id = $1', [id]);
      await recomputeLeadPjValueFromItems(leadId, exec);
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting lead-pj-proposal-items:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/leads-pj/filter', authMiddleware, async (req, res) => {
  try {
    // Allowlist via filterValidColumns: descarta qualquer chave que não exista
    // como coluna real em leads_pj, fechando vetor de SQL injection por nome
    // de coluna controlado pelo cliente.
    const rawFilters = convertKeysToSnake(req.body);
    const filters = await filterValidColumns('leads_pj', rawFilters);
    const keys = Object.keys(filters);
    const values = Object.values(filters);
    let sql = 'SELECT * FROM leads_pj';
    const conditions = [];
    if (keys.length > 0) {
      conditions.push(keys.map((key, i) => `${key} = $${i + 1}`).join(' AND '));
    }

    // Defesa em profundidade: aplica visibilidade por supervisor.
    const visibleIds = await resolveVisibleAgentIds(req.user?.id);
    if (visibleIds === null) {
      // sem restrição
    } else if (visibleIds.length === 0) {
      return res.json([]);
    } else {
      const startIdx = values.length + 1;
      const placeholders = visibleIds.map((_, i) => `$${startIdx + i}`).join(',');
      conditions.push(`agent_id::text IN (${placeholders})`);
      values.push(...visibleIds);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
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

    // Flag opcional vinda do front para transferir (ou não) as atividades
    // pendentes do lead em conjunto com a reatribuição. Default = true.
    // Aceita boolean ou string ("true"/"false"); qualquer outro valor cai no
    // default (true) para manter o comportamento esperado pela UI.
    const transferPendingRaw = data.transfer_pending_activities;
    let transferPendingActivities;
    if (transferPendingRaw === undefined || transferPendingRaw === null) {
      transferPendingActivities = true;
    } else if (typeof transferPendingRaw === 'boolean') {
      transferPendingActivities = transferPendingRaw;
    } else if (typeof transferPendingRaw === 'string') {
      transferPendingActivities = transferPendingRaw.toLowerCase() !== 'false';
    } else {
      transferPendingActivities = Boolean(transferPendingRaw);
    }
    delete data.transfer_pending_activities;

    const oldLeadResult = await query('SELECT * FROM leads_pj WHERE id = $1', [id]);
    const oldLead = oldLeadResult.rows[0];
    
    if (!oldLead) {
      return res.status(404).json({ message: 'Lead PJ not found' });
    }

    // Persistir o instante exato em que a venda foi ganha. Sem isso a
    // atribuição de comissão (`getWonAtTimestamp`) ficava dependente do
    // `stage_history` e do `updated_at`, que podem ser sobrescritos por
    // edições posteriores. Em TODA transição para `fechado_ganho` (inclusive
    // re-ganho: ganho -> outro stage -> ganho de novo) gravamos
    // `concluded_at` com o instante atual, salvo quando o frontend já
    // mandou um valor explícito (ex.: `concludeSaleMutation` em
    // `LeadPJDetail.jsx`). `converted_at` recebe o mesmo timestamp para
    // manter compatibilidade com relatórios legados.
    const stageProvided = Object.prototype.hasOwnProperty.call(data, 'stage');
    const newStage = stageProvided ? data.stage : oldLead.stage;
    const isWinningTransition =
      newStage === 'fechado_ganho' && oldLead.stage !== 'fechado_ganho';
    if (isWinningTransition) {
      const closedAt = data.concluded_at || new Date().toISOString();
      data.concluded_at = closedAt;
      data.converted_at = data.converted_at || closedAt;
    }

    // Reatribuição: se o agente responsável está mudando, somente admin/coordenador
    // (e nunca o próprio vendedor) pode efetuar a troca.
    const isAgentReassignment =
      Object.prototype.hasOwnProperty.call(data, 'agent_id') &&
      String(data.agent_id ?? '') !== String(oldLead.agent_id ?? '');

    let actingAgent = null;
    if (isAgentReassignment) {
      const meRes = await query(
        'SELECT id, name, email, agent_type FROM agents WHERE id = $1',
        [req.user.id]
      );
      actingAgent = meRes.rows[0];
      const actingType = actingAgent?.agent_type;
      const canReassign = actingType === 'admin' || actingType === 'coordinator';
      if (!canReassign) {
        return res.status(403).json({
          message: 'Apenas admin ou coordenador podem reatribuir o agente responsável deste lead.',
        });
      }
    }
    
    const filteredData = await filterValidColumns('leads_pj', data);
    delete filteredData.id;
    delete filteredData.created_at;
    if (!filteredData.updated_at) {
      filteredData.updated_at = new Date().toISOString();
    }
    const keys = Object.keys(filteredData);
    
    if (keys.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }
    
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
    const sql = `UPDATE leads_pj SET ${setClause} WHERE id = $${values.length} RETURNING *`;

    let lead;
    let reassignmentSummary = null;
    // Snapshot das atividades transferidas (com o created_by e google_event_id
    // anteriores) para que, depois do COMMIT, possamos enfileirar a remoção
    // do evento na agenda do vendedor antigo e a recriação na agenda do novo
    // responsável.
    let transferredActivitySnapshots = [];

    if (isAgentReassignment) {
      // Para reatribuição, o update do lead, a transferência das atividades
      // pendentes e o log de agent_change rodam na mesma transação para evitar
      // estados inconsistentes (ex.: lead trocado mas atividades órfãs).
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updateRes = await client.query(sql, values);
        lead = updateRes.rows[0];

        let transferredCount = 0;
        if (transferPendingActivities && lead.agent_id) {
          // Bloqueia e captura o estado anterior das atividades pendentes
          // antes de transferi-las, para podermos sincronizar o Google
          // Calendar fora da transação sem perder informação do dono antigo.
          const snapshotRes = await client.query(
            `SELECT id, type, description, scheduled_at, duration_minutes,
                    created_by, google_event_id
               FROM activities_pj
              WHERE lead_id = $1
                AND completed = FALSE
                AND type <> 'agent_change'
                AND (assigned_to IS DISTINCT FROM $2)
              FOR UPDATE`,
            [lead.id, String(lead.agent_id)]
          );
          transferredActivitySnapshots = snapshotRes.rows;

          if (transferredActivitySnapshots.length > 0) {
            // Atualiza assigned_to (e original_assigned_to/reassigned_at para
            // auditoria), mas também troca created_by para o novo responsável
            // e zera google_event_id. O created_by é usado pelos hooks de
            // gcal como dono da agenda, e zerar google_event_id evita que a
            // criação seja considerada idempotente pelo worker.
            await client.query(
              `UPDATE activities_pj
                  SET original_assigned_to = COALESCE(original_assigned_to, assigned_to),
                      assigned_to = $1,
                      reassigned_at = NOW(),
                      created_by = $1,
                      google_event_id = NULL
                WHERE id = ANY($2::uuid[])`,
              [String(lead.agent_id), transferredActivitySnapshots.map(r => r.id)]
            );
          }
          transferredCount = transferredActivitySnapshots.length;
        }

        const agentLookup = await client.query(
          'SELECT id, name FROM agents WHERE id = ANY($1::uuid[])',
          [[oldLead.agent_id, lead.agent_id].filter(Boolean)]
        );
        const nameById = new Map(agentLookup.rows.map(a => [String(a.id), a.name]));
        const fromName = oldLead.agent_id ? (nameById.get(String(oldLead.agent_id)) || 'Sem agente') : 'Sem agente';
        const toName = lead.agent_id ? (nameById.get(String(lead.agent_id)) || 'Agente removido') : 'Sem agente';
        const actorName = actingAgent?.name || actingAgent?.email || 'Sistema';

        let logDescription = `${actorName} reatribuiu o lead de "${fromName}" para "${toName}".`;
        if (transferPendingActivities) {
          if (transferredCount > 0) {
            logDescription += ` ${transferredCount} ${transferredCount === 1 ? 'atividade pendente foi transferida' : 'atividades pendentes foram transferidas'} para o novo responsável.`;
          } else {
            logDescription += ' Nenhuma atividade pendente para transferir.';
          }
        } else {
          logDescription += ' As atividades pendentes foram mantidas com o agente anterior.';
        }

        const reassignmentMetadata = {
          from_agent_id: oldLead.agent_id ? String(oldLead.agent_id) : null,
          to_agent_id: lead.agent_id ? String(lead.agent_id) : null,
          from_agent_name: fromName,
          to_agent_name: toName,
          actor_id: actingAgent?.id ? String(actingAgent.id) : null,
          actor_name: actorName,
          transfer_requested: transferPendingActivities,
          transferred_count: transferredCount,
        };

        await client.query(
          `INSERT INTO activities_pj (lead_id, type, title, description, created_by, assigned_to, completed, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            lead.id,
            'agent_change',
            'Agente responsável alterado',
            logDescription,
            actingAgent?.id || null,
            lead.agent_id ? String(lead.agent_id) : null,
            true,
            JSON.stringify(reassignmentMetadata),
          ]
        );

        await client.query('COMMIT');

        reassignmentSummary = {
          transferRequested: transferPendingActivities,
          transferApplied: transferPendingActivities,
          transferredCount,
          transferError: null,
        };
      } catch (txErr) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        console.error('[leads-pj] Falha na transação de reatribuição:', txErr.message);
        return res.status(500).json({
          message: 'Não foi possível concluir a reatribuição. Nenhuma alteração foi salva.',
          error: txErr.message,
        });
      } finally {
        client.release();
      }

      if (lead.agent_id) {
        try {
          await notifyLeadPJAssigned(lead, lead.agent_id);
        } catch (notifyErr) {
          console.error('[leads-pj] Falha ao notificar reatribuição:', notifyErr.message);
        }
      }

      // Sincroniza Google Calendar das atividades transferidas: remove o
      // evento da agenda do vendedor antigo e o recria na do novo. Usamos o
      // outbox para que falhas transitórias sejam apenas logadas e
      // automaticamente reprocessadas, sem bloquear a reatribuição.
      for (const snapshot of transferredActivitySnapshots) {
        if (snapshot.created_by && snapshot.google_event_id) {
          try {
            await enqueueGcalOp({
              agentId: snapshot.created_by,
              activityId: null, // a atividade não foi excluída; só transferida
              activityTable: 'activities_pj',
              op: 'delete',
              payload: { google_event_id: snapshot.google_event_id },
            });
          } catch (gcalErr) {
            console.error(
              '[leads-pj] Falha ao enfileirar remoção do evento do Google Calendar do vendedor anterior:',
              gcalErr.message
            );
          }
        }

        if (lead.agent_id && snapshot.scheduled_at) {
          try {
            await enqueueGcalOp({
              agentId: String(lead.agent_id),
              activityId: snapshot.id,
              activityTable: 'activities_pj',
              op: 'create',
              payload: {
                type: snapshot.type,
                description: snapshot.description,
                scheduled_at: snapshot.scheduled_at,
                duration_minutes: snapshot.duration_minutes,
              },
            });
          } catch (gcalErr) {
            console.error(
              '[leads-pj] Falha ao enfileirar criação do evento do Google Calendar para o novo responsável:',
              gcalErr.message
            );
          }
        }
      }
    } else {
      const result = await query(sql, values);
      lead = result.rows[0];
    }

    const responseBody = convertKeysToCamel(lead);
    if (reassignmentSummary) {
      responseBody.reassignmentSummary = reassignmentSummary;
    }
    res.json(responseBody);
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
      enqueueGcalOp({
        agentId: existing.rows[0].created_by,
        activityId: null,
        activityTable: 'activities',
        op: 'delete',
        payload: { google_event_id: existing.rows[0].google_event_id },
      });
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

    if (activity.id && activity.created_by) {
      enqueueGcalOp({
        agentId: activity.created_by,
        activityId: activity.id,
        activityTable: 'activities',
        op: 'update',
        payload: {
          type: activity.type,
          description: activity.title || activity.description,
          scheduled_at: activity.scheduled_at,
          completed: activity.completed,
        },
      });
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
      enqueueGcalOp({
        agentId: activity.created_by,
        activityId: activity.id,
        activityTable: 'activities',
        op: 'create',
        payload: {
          type: activity.type,
          description: activity.title || activity.description,
          scheduled_at: activity.scheduled_at,
        },
      });
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

/**
 * Relatório consolidado de períodos de responsabilidade por lead PJ
 * (para auditoria de comissão entre vendedores/filiais).
 *
 * Retorna, respeitando visibilidade do usuário logado:
 *  - leads:      [{ id, razao_social, nome_fantasia, stage, value, agent_id, created_at, ... }]
 *  - activities: [{ id, lead_id, type:'agent_change', created_at, metadata, assigned_to, created_by }]
 *
 * Filtros opcionais (querystring):
 *  - stage    : filtra leads por stage atual
 *  - agent_id : inclui leads em que o agente foi responsável em
 *               *qualquer momento* (atual OU em algum período histórico)
 *  - team_id  : inclui leads em que algum agente do time foi responsável
 *               em qualquer momento (atual OU histórico)
 *
 * Importante: agent_id e team_id NÃO se restringem ao dono atual do lead,
 * pois o objetivo do relatório é auditoria de comissão histórica. O front
 * é quem refina cada período mostrado (e o intervalo de datas).
 */
const LEAD_PJ_PERIODS_DEFAULT_PAGE_SIZE = 50;
const LEAD_PJ_PERIODS_MAX_PAGE_SIZE = 500;

router.get('/reports/lead-pj-agent-periods', authMiddleware, async (req, res) => {
  try {
    const visibleIds = await resolveVisibleAgentIds(req.user?.id);
    const { stage, agent_id: agentId, team_id: teamId } = req.query;

    const rawPage = parseInt(req.query.page, 10);
    const rawPageSize = parseInt(req.query.page_size ?? req.query.pageSize, 10);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
    const pageSize = Math.min(
      LEAD_PJ_PERIODS_MAX_PAGE_SIZE,
      Number.isFinite(rawPageSize) && rawPageSize > 0
        ? rawPageSize
        : LEAD_PJ_PERIODS_DEFAULT_PAGE_SIZE
    );

    const whereParts = [];
    const params = [];

    if (visibleIds === null) {
      // sem restrição
    } else if (visibleIds.length === 0) {
      return res.json({
        leads: [],
        activities: [],
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        hasMore: false,
      });
    } else {
      const placeholders = visibleIds.map((_, i) => `$${params.length + i + 1}`).join(',');
      whereParts.push(`l.agent_id::text IN (${placeholders})`);
      params.push(...visibleIds);
    }

    if (stage) {
      params.push(stage);
      whereParts.push(`l.stage = $${params.length}`);
    }

    if (agentId) {
      // Inclui leads em que o agente foi responsável em qualquer momento:
      // dono atual OU aparece em algum agent_change como from/to.
      params.push(agentId);
      const idx = params.length;
      whereParts.push(`(
        l.agent_id::text = $${idx}
        OR EXISTS (
          SELECT 1 FROM activities_pj a
          WHERE a.lead_id = l.id
            AND a.type = 'agent_change'
            AND (
              a.metadata->>'from_agent_id' = $${idx}
              OR a.metadata->>'to_agent_id' = $${idx}
              OR a.assigned_to::text = $${idx}
            )
        )
      )`);
    }

    if (teamId) {
      // Inclui leads em que algum agente do time foi responsável em
      // qualquer momento — atual ou histórico.
      params.push(teamId);
      const idx = params.length;
      whereParts.push(`(
        l.agent_id IN (SELECT id FROM agents WHERE team_id = $${idx})
        OR EXISTS (
          SELECT 1 FROM activities_pj a
          WHERE a.lead_id = l.id
            AND a.type = 'agent_change'
            AND (
              a.metadata->>'from_agent_id' IN (SELECT id::text FROM agents WHERE team_id = $${idx})
              OR a.metadata->>'to_agent_id' IN (SELECT id::text FROM agents WHERE team_id = $${idx})
              OR a.assigned_to IN (SELECT id FROM agents WHERE team_id = $${idx})
            )
        )
      )`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*)::int AS total FROM leads_pj l ${whereSql}`;
    const countResult = await query(countSql, params);
    const total = countResult.rows[0]?.total || 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    if (total === 0 || offset >= total) {
      return res.json({
        leads: [],
        activities: [],
        page,
        pageSize,
        total,
        totalPages,
        hasMore: false,
      });
    }

    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;
    const leadsSql = `
      SELECT l.id, l.razao_social, l.nome_fantasia, l.cnpj, l.stage, l.value,
             l.monthly_value, l.agent_id, l.created_at, l.updated_at, l.concluded
      FROM leads_pj l
      ${whereSql}
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
    `;
    const leadsResult = await query(leadsSql, [...params, pageSize, offset]);
    const leads = leadsResult.rows;

    let activities = [];
    if (leads.length > 0) {
      const leadIdPlaceholders = leads.map((_, i) => `$${i + 1}`).join(',');
      const activitiesSql = `
        SELECT id, lead_id, type, created_at, scheduled_at, assigned_to,
               created_by, metadata, description
        FROM activities_pj
        WHERE type = 'agent_change' AND lead_id IN (${leadIdPlaceholders})
        ORDER BY created_at ASC
      `;
      const activitiesResult = await query(
        activitiesSql,
        leads.map(l => l.id)
      );
      activities = activitiesResult.rows;
    }

    res.json({
      leads: leads.map(convertKeysToCamel),
      activities: activities.map(convertKeysToCamel),
      page,
      pageSize,
      total,
      totalPages,
      hasMore: page < totalPages,
    });
  } catch (error) {
    console.error('Error in lead-pj-agent-periods report:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;
