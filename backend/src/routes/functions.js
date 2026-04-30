import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';
import { query } from '../config/database.js';
import { authMiddleware, optionalAuth } from '../middleware/auth.js';
import { loadAgentMiddleware, requirePermission, requireRole } from '../middleware/permissions.js';
import { assignTicket, distributeUnassignedTickets, DISTRIBUTION_ALGORITHMS } from '../services/ticketDistribution.js';
import { checkAllSLAWarnings, checkSLABreach, recordFirstResponse, recordStatusChange } from '../services/slaService.js';
import { runAllAutomations, runAutomationsForLead } from '../services/leadAutomation.js';
// `checkLeadTemperatures` foi removido — temperatura é manual desde a Task #62.
import { generateProposalPDF } from '../services/pdfService.js';
import { sendWhatsAppMessage, sendDocument, sendTextMessage } from '../services/whatsappService.js';
import { v4 as uuidv4 } from 'uuid';
import ExcelJS from 'exceljs';
import { enqueueLeads, processQueue, retryFailed, getQueueStatus, getDashboardMetrics, getLogsWithPagination, normalizePhone, checkConversions, getConversionMetrics, getConversionsList } from '../services/whatsappQueueService.js';
import { getEnvioRegulamentoConfig } from '../services/automationService.js';
import { getAgentByErpId, getErpAgentMap, resolveAgentFromErp } from '../services/erpIntegrationService.js';
import OpenAI from 'openai';
import FormData from 'form-data';
import axios from 'axios';
import https from 'https';
import {
  getConnectionStatus,
  getAgentConnectionStatus,
  getAuthUrl,
  validateOAuthState,
  handleCallback,
  disconnectAgent,
  fetchGoogleEvents,
  fetchGoogleEventsMultiAgent,
  getConnectedAgentIds,
  syncGoogleToSalesTwo,
  syncAllAgents,
  listWritableCalendars,
  setTargetCalendar,
  getTargetCalendarForAgent,
} from '../services/googleCalendarService.js';
import {
  getMaskedConfig as getGCalMaskedConfig,
  saveConfig as saveGCalConfig,
} from '../services/googleCalendarConfigService.js';
import { listRecentMonitorRuns } from '../services/leadTemperatureMonitor.js';

const router = Router();

const AUTENTIQUE_API_URL = 'https://api.autentique.com.br/v2/graphql';

router.post('/portal-auth', async (req, res) => {
  try {
    const { document, phone } = req.body;
    
    const result = await query(
      'SELECT * FROM contacts WHERE document = $1 OR phone = $2 OR whatsapp = $2',
      [document, phone]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Contact not found' });
    }
    
    const contact = result.rows[0];
    const token = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await query(
      'INSERT INTO portal_sessions (contact_id, token, expires_at) VALUES ($1, $2, $3)',
      [contact.id, token, expiresAt]
    );
    
    res.json({ success: true, token, contact });
  } catch (error) {
    console.error('Error in portal auth:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/validate-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    const result = await query(
      `SELECT ps.*, c.* FROM portal_sessions ps 
       JOIN contacts c ON ps.contact_id = c.id 
       WHERE ps.token = $1 AND ps.expires_at > NOW()`,
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ valid: false, message: 'Invalid or expired token' });
    }
    
    res.json({ valid: true, contact: result.rows[0] });
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/assign-ticket-round-robin', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id, queue_id, algorithm } = req.body;
    
    const result = await assignTicket(ticket_id, queue_id, algorithm);
    
    if (!result.success) {
      return res.status(400).json(result);
    }
    
    res.json(result);
  } catch (error) {
    console.error('Error assigning ticket:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/distribute-tickets', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const results = await distributeUnassignedTickets();
    res.json({ 
      success: true, 
      distributed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      details: results 
    });
  } catch (error) {
    console.error('Error distributing tickets:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/check-sla', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id } = req.body;
    
    if (ticket_id) {
      const slaStatus = await checkSLABreach(ticket_id);
      return res.json(slaStatus);
    }
    
    const result = await checkAllSLAWarnings();
    res.json(result);
  } catch (error) {
    console.error('Error checking SLA:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/record-first-response', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id } = req.body;
    const result = await recordFirstResponse(ticket_id);
    res.json(result);
  } catch (error) {
    console.error('Error recording first response:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/run-lead-automations', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { lead_id } = req.body;
    
    if (lead_id) {
      const result = await runAutomationsForLead(lead_id);
      return res.json(result);
    }
    
    const result = await runAllAutomations();
    res.json(result);
  } catch (error) {
    console.error('Error running automations:', error);
    res.status(500).json({ message: error.message });
  }
});

// Endpoint legado: o monitor automático de temperatura foi desativado na
// Task #62 (temperatura é 100% manual agora). O endpoint continua respondendo
// para evitar 404 em integrações antigas, mas não roda nada.
router.post('/run-lead-temperature-check', authMiddleware, loadAgentMiddleware, requireRole('admin'), async (req, res) => {
  res.status(410).json({
    success: false,
    deprecated: true,
    message: 'O monitor automático de temperatura foi desativado. A temperatura do lead agora é definida manualmente pelo vendedor.',
  });
});

router.post('/record-status-change', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const { ticket_id, old_status, new_status } = req.body;
    await recordStatusChange(ticket_id, old_status, new_status, req.user?.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error recording status change:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/create-notification', authMiddleware, async (req, res) => {
  try {
    const { user_email, title, message, type, link } = req.body;
    
    const result = await query(
      'INSERT INTO notifications (user_email, title, message, type, link) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_email, title, message, type, link]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating notification:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/check-notifications', authMiddleware, async (req, res) => {
  try {
    const { user_email } = req.body;
    
    const result = await query(
      `SELECT * FROM notifications
       WHERE user_email = $1
         AND read = false
         AND COALESCE(in_app_visible, true) = true
       ORDER BY created_at DESC LIMIT 50`,
      [user_email]
    );
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error checking notifications:', error);
    res.status(500).json({ message: error.message });
  }
});

// =====================================================================
// Web Push subscription lifecycle. The frontend (PushManager.subscribe)
// posts the subscription object here once per device. The backend uses
// `web-push` to deliver pushes to whatever endpoints the user has registered
// (see backend/src/services/notificationService.js#sendPushNotification).
// =====================================================================
router.get('/push/vapid-public-key', authMiddleware, async (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || '';
  res.json({ publicKey: key, configured: Boolean(key) });
});

router.post('/push/subscribe', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email || req.user?.userEmail;
    if (!userEmail) {
      return res.status(401).json({ success: false, error: 'unauthenticated' });
    }
    const { endpoint, keys, userAgent, user_agent } = req.body || {};
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ success: false, error: 'subscription requires endpoint and keys.{p256dh,auth}' });
    }
    // Bound the payload sizes before they hit the DB. Real Web Push values are
    // tiny (URL ≤ ~512 chars, p256dh ≈ 88 chars, auth ≈ 24 chars) so anything
    // wildly bigger is malformed or hostile.
    if (typeof endpoint !== 'string' || endpoint.length > 2048 ||
        typeof p256dh !== 'string' || p256dh.length > 256 ||
        typeof auth !== 'string' || auth.length > 128) {
      return res.status(400).json({ success: false, error: 'subscription payload exceeds allowed sizes' });
    }
    const ua = (userAgent || user_agent || req.get('user-agent') || '').toString().slice(0, 500);
    // Upsert by endpoint so re-subscribing the same browser doesn't create dupes
    // and re-binds the endpoint to the currently logged-in user.
    await query(
      `INSERT INTO push_subscriptions (user_email, endpoint, p256dh_key, auth_key, user_agent, last_used_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (endpoint) DO UPDATE SET
         user_email = EXCLUDED.user_email,
         p256dh_key = EXCLUDED.p256dh_key,
         auth_key = EXCLUDED.auth_key,
         user_agent = COALESCE(EXCLUDED.user_agent, push_subscriptions.user_agent),
         last_used_at = NOW(),
         last_error = NULL,
         last_error_at = NULL`,
      [userEmail, endpoint, p256dh, auth, ua || null]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Push] subscribe failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/push/unsubscribe', authMiddleware, async (req, res) => {
  try {
    const userEmail = req.user?.email || req.user?.userEmail;
    const { endpoint } = req.body || {};
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'endpoint is required' });
    }
    // Scope deletion to the caller so a leaked endpoint can't be used to
    // unsubscribe someone else.
    await query(
      `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_email = $2`,
      [endpoint, userEmail]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('[Push] unsubscribe failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

let leadGeneratorOptionsCache = { data: null, timestamp: 0 };
const CACHE_TTL = 10 * 60 * 1000;

async function fetchLeadGeneratorFromERP(queryParams = {}) {
  const erpAuthToken = process.env.ERP_AUTH_TOKEN;
  if (!erpAuthToken) {
    throw new Error('Credenciais do ERP não configuradas.');
  }

  const params = new URLSearchParams();
  const allowedParams = ['canal', 'cidade', 'uf', 'produto', 'situacao_contrato'];
  for (const key of allowedParams) {
    if (queryParams[key]) {
      params.set(key, queryParams[key]);
    }
  }

  const erpUrl = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_BASE_LEADS${params.toString() ? '?' + params.toString() : ''}`;
  const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

  console.log(`[LeadGenerator] Fetching from ERP: ${erpUrl}`);

  const erpResponse = await fetch(erpUrl, {
    method: 'GET',
    headers: {
      'Authorization': authHeader,
      'Accept': 'application/json'
    }
  });

  if (!erpResponse.ok) {
    throw new Error(`ERP returned status ${erpResponse.status}`);
  }

  const data = await erpResponse.json();
  return Array.isArray(data) ? data : [];
}

const MIN_RECORDS_FOR_VALID_OPTIONS = 50;

router.get('/lead-generator-options', authMiddleware, async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const now = Date.now();

    if (!forceRefresh && leadGeneratorOptionsCache.data && (now - leadGeneratorOptionsCache.timestamp) < CACHE_TTL) {
      console.log('[LeadGenerator] Returning cached filter options');
      return res.json(leadGeneratorOptionsCache.data);
    }

    const allData = await fetchLeadGeneratorFromERP();
    console.log(`[LeadGenerator] Loaded ${allData.length} records for filter options`);

    if (allData.length < MIN_RECORDS_FOR_VALID_OPTIONS) {
      console.warn(`[LeadGenerator] ERP returned only ${allData.length} records — too few, likely incomplete response. Skipping cache update.`);

      if (leadGeneratorOptionsCache.data) {
        console.log('[LeadGenerator] Returning stale cache instead of incomplete data');
        return res.json(leadGeneratorOptionsCache.data);
      }

      let retryData = [];
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[LeadGenerator] Retry attempt ${attempt}...`);
        await new Promise(r => setTimeout(r, 2000));
        retryData = await fetchLeadGeneratorFromERP();
        console.log(`[LeadGenerator] Retry ${attempt} returned ${retryData.length} records`);
        if (retryData.length >= MIN_RECORDS_FOR_VALID_OPTIONS) break;
      }

      if (retryData.length >= MIN_RECORDS_FOR_VALID_OPTIONS) {
        const unique = (field) => [...new Set(retryData.map(d => d[field]).filter(Boolean))].sort();
        const options = {
          canal: unique('canal'),
          cidade: unique('cidade'),
          uf: unique('uf'),
          produto: unique('produto'),
          situacao_contrato: unique('situacao_contrato'),
        };
        leadGeneratorOptionsCache = { data: options, timestamp: now };
        return res.json(options);
      }

      const unique = (field) => [...new Set(allData.map(d => d[field]).filter(Boolean))].sort();
      return res.json({
        canal: unique('canal'),
        cidade: unique('cidade'),
        uf: unique('uf'),
        produto: unique('produto'),
        situacao_contrato: unique('situacao_contrato'),
        _partial: true,
        _recordCount: allData.length,
      });
    }

    const unique = (field) => [...new Set(allData.map(d => d[field]).filter(Boolean))].sort();

    const options = {
      canal: unique('canal'),
      cidade: unique('cidade'),
      uf: unique('uf'),
      produto: unique('produto'),
      situacao_contrato: unique('situacao_contrato'),
    };

    leadGeneratorOptionsCache = { data: options, timestamp: now };
    res.json(options);
  } catch (error) {
    console.error('Error fetching lead generator options:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-base', authMiddleware, async (req, res) => {
  try {
    let data = await fetchLeadGeneratorFromERP(req.query);
    console.log(`[LeadGenerator] Search returned ${data.length} leads from ERP`);

    const tempoAtivoMin = req.query.tempoAtivoMin ? parseInt(req.query.tempoAtivoMin, 10) : null;
    const tempoAtivoMax = req.query.tempoAtivoMax ? parseInt(req.query.tempoAtivoMax, 10) : null;

    if (tempoAtivoMin !== null || tempoAtivoMax !== null) {
      const before = data.length;
      data = data.filter(lead => {
        const val = lead.tempo_ativo_contrato;
        if (val === null || val === undefined) return false;
        const num = typeof val === 'number' ? val : parseInt(val, 10);
        if (isNaN(num)) return false;
        if (tempoAtivoMin !== null && num < tempoAtivoMin) return false;
        if (tempoAtivoMax !== null && num > tempoAtivoMax) return false;
        return true;
      });
      console.log(`[LeadGenerator] tempo_ativo_contrato filter: ${before} -> ${data.length} (min=${tempoAtivoMin}, max=${tempoAtivoMax})`);
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching lead generator base:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const DISPATCH_FORBIDDEN_TYPES = ['vendas', 'sales', 'bom_auto_atendente', 'support', 'collection', 'pre_sales', 'post_sales'];

async function getAgentForDispatchCheck(req) {
  const agentResult = await query('SELECT id, agent_type, team_id, email, name FROM agents WHERE id = $1', [req.user.id]);
  return agentResult.rows[0] || null;
}

async function logUnauthorizedAttempt(req, agent, action) {
  try {
    await query(
      `INSERT INTO gerador_leads_audit_log (user_id, user_email, agent_type, action, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        req.user?.id,
        req.user?.email || agent?.email,
        agent?.agent_type || 'unknown',
        action,
        JSON.stringify({ timestamp: new Date().toISOString(), path: req.originalUrl }),
        req.ip || req.headers['x-forwarded-for'] || null
      ]
    );
  } catch (err) {
    console.error('[WhatsAppQueue] Audit log error:', err.message);
  }
}

router.post('/lead-generator-whatsapp-send', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      await logUnauthorizedAttempt(req, agent, 'whatsapp_dispatch_attempt');
      return res.status(403).json({ success: false, error: 'Você não tem permissão para realizar disparos de WhatsApp.' });
    }

    let envioConfig;
    try {
      envioConfig = await getEnvioRegulamentoConfig();
    } catch (configErr) {
      return res.status(400).json({ success: false, error: configErr.message });
    }

    const { leads, filtersUsed } = req.body;
    const userId = req.user?.id || null;
    const userEmail = req.user?.email || agent?.email || null;
    const teamId = agent?.team_id || null;

    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum lead selecionado para envio.' });
    }

    if (leads.length > 1000) {
      return res.status(400).json({ success: false, error: 'Limite máximo de 1000 leads por disparo.' });
    }

    const batchId = uuidv4();

    console.log(`[WhatsAppQueue] Enqueuing batch ${batchId}: ${leads.length} leads by ${userEmail} | template=${envioConfig.templateId} (${envioConfig.templateName})`);

    const summary = await enqueueLeads({
      leads,
      userId,
      userEmail,
      teamId,
      templateId: envioConfig.templateId,
      channelToken: envioConfig.channelToken,
      templateName: envioConfig.templateName,
      automationName: envioConfig.automationName,
      agentId: agent?.id || null,
      agentName: agent?.name || null,
      filtersUsed,
      batchId,
    });

    processQueue(batchId).catch(err => {
      console.error(`[WhatsAppQueue] Processing error for batch ${batchId}:`, err.message);
    });

    res.json({
      success: true,
      batchId,
      summary,
    });
  } catch (error) {
    console.error('[WhatsAppQueue] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const LOG_SAFE_COLUMNS = `id, batch_id, disparado_em, processado_em, duracao_ms,
  lead_number, lead_name, lead_uf, lead_cidade, lead_produto, lead_situacao,
  agent_id, agent_name, agent_email, template_id, template_name, automation_name,
  tentativa_numero, status_envio, http_status, message_sent_id, motivo_bloqueio,
  convertido, data_conversao, created_at`;

const LOG_ALLOWED_TYPES = ['supervisor', 'admin', 'indicator', 'referral_manager'];

router.get('/lead-generator-log-estruturado', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || !LOG_ALLOWED_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para visualizar logs estruturados.' });
    }

    const { batchId, startDate, endDate, status, agentId, limit = 500, offset = 0 } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (batchId) {
      whereClause += ` AND batch_id = $${paramIndex}`;
      params.push(batchId);
      paramIndex++;
    }
    if (startDate) {
      whereClause += ` AND disparado_em >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereClause += ` AND disparado_em <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    if (status) {
      whereClause += ` AND status_envio = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (agentId) {
      whereClause += ` AND agent_id = $${paramIndex}`;
      params.push(agentId);
      paramIndex++;
    }

    const countResult = await query(`SELECT COUNT(*)::int as total FROM gerador_leads_log_estruturado ${whereClause}`, params);

    const dataResult = await query(
      `SELECT ${LOG_SAFE_COLUMNS} FROM gerador_leads_log_estruturado ${whereClause} ORDER BY disparado_em DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json({
      success: true,
      total: countResult.rows[0]?.total || 0,
      data: dataResult.rows,
    });
  } catch (error) {
    console.error('[LogEstruturado] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-log-estruturado/stats', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || !LOG_ALLOWED_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para visualizar stats de logs.' });
    }

    const { startDate, endDate, agentId } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      whereClause += ` AND disparado_em >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereClause += ` AND disparado_em <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    if (agentId) {
      whereClause += ` AND agent_id = $${paramIndex}`;
      params.push(agentId);
      paramIndex++;
    }

    const result = await query(`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status_envio = 'enviado')::int as enviados,
        COUNT(*) FILTER (WHERE status_envio = 'falha')::int as falhas,
        COUNT(*) FILTER (WHERE status_envio LIKE 'bloqueado%')::int as bloqueados,
        COUNT(*) FILTER (WHERE convertido = true)::int as convertidos,
        COALESCE(AVG(duracao_ms) FILTER (WHERE duracao_ms IS NOT NULL), 0)::int as avg_duracao_ms,
        COUNT(DISTINCT batch_id)::int as total_batches,
        COUNT(DISTINCT agent_id)::int as total_agents
      FROM gerador_leads_log_estruturado ${whereClause}
    `, params);

    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('[LogEstruturado] Stats error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-log-estruturado/export', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || !LOG_ALLOWED_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para exportar logs.' });
    }

    const { startDate, endDate, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      whereClause += ` AND disparado_em >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    if (endDate) {
      whereClause += ` AND disparado_em <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    if (status && status !== 'todos') {
      if (status === 'bloqueado') {
        whereClause += ` AND status_envio LIKE 'bloqueado%'`;
      } else {
        whereClause += ` AND status_envio = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    const dataResult = await query(
      `SELECT ${LOG_SAFE_COLUMNS} FROM gerador_leads_log_estruturado ${whereClause} ORDER BY disparado_em DESC LIMIT 50000`,
      params
    );

    const rows = dataResult.rows;

    const sanitizeCell = (val) => {
      if (typeof val !== 'string') return val;
      if (/^[=+\-@]/.test(val)) return `'${val}`;
      return val;
    };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Log Disparos');

    const columns = [
      { header: 'Data/Hora Disparo', key: 'disparado_em', width: 22 },
      { header: 'Data/Hora Processado', key: 'processado_em', width: 22 },
      { header: 'Duração (ms)', key: 'duracao_ms', width: 14 },
      { header: 'Telefone', key: 'lead_number', width: 18 },
      { header: 'Nome', key: 'lead_name', width: 28 },
      { header: 'UF', key: 'lead_uf', width: 6 },
      { header: 'Cidade', key: 'lead_cidade', width: 22 },
      { header: 'Produto', key: 'lead_produto', width: 18 },
      { header: 'Situação', key: 'lead_situacao', width: 16 },
      { header: 'Agente', key: 'agent_name', width: 24 },
      { header: 'E-mail Agente', key: 'agent_email', width: 28 },
      { header: 'Template', key: 'template_name', width: 30 },
      { header: 'Automação', key: 'automation_name', width: 22 },
      { header: 'Tentativa', key: 'tentativa_numero', width: 12 },
      { header: 'Status', key: 'status_envio', width: 20 },
      { header: 'HTTP Status', key: 'http_status', width: 14 },
      { header: 'ID Mensagem', key: 'message_sent_id', width: 28 },
      { header: 'Motivo Bloqueio', key: 'motivo_bloqueio', width: 40 },
      { header: 'Convertido', key: 'convertido', width: 12 },
      { header: 'Data Conversão', key: 'data_conversao', width: 22 },
    ];

    sheet.columns = columns;

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

    const formatDateExcel = (d) => {
      if (!d) return '';
      const dt = new Date(d);
      const dd = String(dt.getDate()).padStart(2, '0');
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const yyyy = dt.getFullYear();
      const hh = String(dt.getHours()).padStart(2, '0');
      const min = String(dt.getMinutes()).padStart(2, '0');
      const ss = String(dt.getSeconds()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
    };

    const statusColors = {
      bloqueado: 'FFFFF3CD',
      enviado: 'FFD4EDDA',
      reenvio_agendado: 'FFFFEEBA',
      falha: 'FFF8D7DA',
    };

    for (const row of rows) {
      const dataRow = sheet.addRow({
        disparado_em: formatDateExcel(row.disparado_em),
        processado_em: formatDateExcel(row.processado_em),
        duracao_ms: row.duracao_ms ?? '',
        lead_number: sanitizeCell(row.lead_number),
        lead_name: sanitizeCell(row.lead_name || ''),
        lead_uf: sanitizeCell(row.lead_uf || ''),
        lead_cidade: sanitizeCell(row.lead_cidade || ''),
        lead_produto: sanitizeCell(row.lead_produto || ''),
        lead_situacao: sanitizeCell(row.lead_situacao || ''),
        agent_name: sanitizeCell(row.agent_name || ''),
        agent_email: sanitizeCell(row.agent_email || ''),
        template_name: sanitizeCell(row.template_name || ''),
        automation_name: sanitizeCell(row.automation_name || ''),
        tentativa_numero: row.tentativa_numero,
        status_envio: sanitizeCell(row.status_envio),
        http_status: row.http_status ?? '',
        message_sent_id: sanitizeCell(row.message_sent_id || ''),
        motivo_bloqueio: sanitizeCell(row.motivo_bloqueio || ''),
        convertido: row.convertido ? 'Sim' : 'Não',
        data_conversao: formatDateExcel(row.data_conversao),
      });

      const bgColor = statusColors[row.status_envio];
      if (bgColor) {
        dataRow.eachCell((cell) => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const filename = `log_disparos_${today}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('[LogEstruturado] Export error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-queue-status/:batchId', authMiddleware, async (req, res) => {
  try {
    const status = await getQueueStatus(req.params.batchId);
    res.json({ success: true, ...status });
  } catch (error) {
    console.error('[WhatsAppQueue] Status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/lead-generator-whatsapp-retry', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      await logUnauthorizedAttempt(req, agent, 'whatsapp_retry_attempt');
      return res.status(403).json({ success: false, error: 'Você não tem permissão para reenviar disparos.' });
    }

    const { batchId } = req.body;
    if (!batchId) {
      return res.status(400).json({ success: false, error: 'batchId é obrigatório.' });
    }

    const result = await retryFailed(batchId, req.user?.id, req.user?.email, agent?.team_id);

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[WhatsAppQueue] Retry error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-whatsapp-dashboard', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar o painel de disparos.' });
    }

    const { from, to, userId: filterUserId, teamId: filterTeamId } = req.query;
    const metrics = await getDashboardMetrics({ from, to, userId: filterUserId, teamId: filterTeamId });

    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('[WhatsAppQueue] Dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function stripPhoneTo55Local(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

function parseBRCurrency(value) {
  if (value == null) return 0;
  const str = String(value).trim();
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(str) || 0;
}

router.get('/lead-generator-roi-metrics', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar métricas ROI.' });
    }

    const { from, to, userId: filterUserId, teamId: filterTeamId } = req.query;

    const logConditions = [];
    const logParams = [];

    if (from) {
      logParams.push(from);
      logConditions.push(`sent_at >= $${logParams.length}::timestamp`);
    }
    if (to) {
      logParams.push(to);
      logConditions.push(`sent_at <= $${logParams.length}::timestamp`);
    }
    if (filterUserId) {
      logParams.push(filterUserId);
      logConditions.push(`user_id = $${logParams.length}`);
    }
    if (filterTeamId) {
      logParams.push(filterTeamId);
      logConditions.push(`team_id = $${logParams.length}`);
    }

    const logWhere = logConditions.length > 0 ? `WHERE ${logConditions.join(' AND ')}` : '';

    const totalDisparosResult = await query(
      `SELECT COUNT(*)::int as total FROM gerador_leads_whatsapp_logs ${logWhere}`,
      logParams
    );
    const totalDisparos = totalDisparosResult.rows[0]?.total || 0;

    const successConditions = [...logConditions, 'success = true'];
    const successWhere = `WHERE ${successConditions.join(' AND ')}`;

    const successResult = await query(
      `SELECT
         COUNT(*)::int as total,
         COUNT(DISTINCT lead_number)::int as leads_unicos
       FROM gerador_leads_whatsapp_logs ${successWhere}`,
      logParams
    );
    const disparosSucesso = successResult.rows[0]?.total || 0;
    const leadsDisparadosSucesso = successResult.rows[0]?.leads_unicos || 0;

    const dispatchedPhonesResult = await query(
      `SELECT lead_number, MIN(sent_at) as first_sent
       FROM gerador_leads_whatsapp_logs
       ${successWhere}
       GROUP BY lead_number`,
      logParams
    );

    const dispatchMap = new Map();
    for (const row of dispatchedPhonesResult.rows) {
      const normalized = stripPhoneTo55Local(row.lead_number);
      if (normalized) {
        dispatchMap.set(normalized, row.first_sent);
      }
    }

    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES';

    console.log(`[ROI Metrics] Fetching ERP sales data from API_DADOS_VENDAS_INDICACOES...`);
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const vendasERP = Array.isArray(erpData) ? erpData : [];
    console.log(`[ROI Metrics] ERP returned ${vendasERP.length} sales records`);

    const matchedContracts = new Set();
    const convertedPhones = new Set();
    let valorTotalVendas = 0;
    const conversoesPorDia = {};
    const valorPorDia = {};

    for (const venda of vendasERP) {
      const celIndicador = venda.cel_indicador ? String(venda.cel_indicador).replace(/\D/g, '') : '';
      if (!celIndicador) continue;

      const celNormalized = celIndicador.startsWith('55') && celIndicador.length >= 12
        ? celIndicador.slice(2)
        : celIndicador;

      const dispatchDate = dispatchMap.get(celNormalized);
      if (!dispatchDate) continue;

      const dataContrato = venda.data_contrato ? new Date(venda.data_contrato) : null;
      if (!dataContrato || isNaN(dataContrato.getTime())) continue;

      if (dataContrato < new Date(dispatchDate)) continue;

      const contratoId = venda.contrato_servicos || '';
      const contratoKey = contratoId
        ? `${celNormalized}_${contratoId}`
        : `${celNormalized}_${venda.cpf_indicado || ''}_${venda.data_contrato || ''}`;
      if (matchedContracts.has(contratoKey)) continue;
      matchedContracts.add(contratoKey);

      const valorContrato = parseBRCurrency(venda.valor_contrato);

      convertedPhones.add(celNormalized);
      valorTotalVendas += valorContrato;

      const diaKey = dataContrato.toISOString().split('T')[0];
      conversoesPorDia[diaKey] = (conversoesPorDia[diaKey] || 0) + 1;
      valorPorDia[diaKey] = (valorPorDia[diaKey] || 0) + valorContrato;
    }

    const conversoes = matchedContracts.size;
    const leadsConvertidos = convertedPhones.size;
    const taxaConversao = leadsDisparadosSucesso > 0 ? Number(((leadsConvertidos / leadsDisparadosSucesso) * 100).toFixed(2)) : 0;
    const roi = totalDisparos > 0 ? Number((valorTotalVendas / totalDisparos).toFixed(2)) : 0;

    const allDays = new Set([...Object.keys(conversoesPorDia), ...Object.keys(valorPorDia)]);
    const sortedDays = Array.from(allDays).sort();

    res.json({
      success: true,
      totals: {
        total_disparos: totalDisparos,
        disparos_sucesso: disparosSucesso,
        conversoes,
        leads_convertidos: leadsConvertidos,
        valor_total_vendas: valorTotalVendas,
        taxa_conversao: taxaConversao,
        roi
      },
      series: {
        conversoes_por_dia: sortedDays.map(dia => ({ dia, conversoes: conversoesPorDia[dia] || 0 })),
        valor_vendas_por_dia: sortedDays.map(dia => ({ dia, valor: valorPorDia[dia] || 0 }))
      }
    });
  } catch (error) {
    console.error('[ROI Metrics] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function executeMetricsAudit({ from, to, userId, teamId } = {}) {
  const logConditions = [];
  const logParams = [];
  if (from) { logParams.push(from); logConditions.push(`sent_at >= $${logParams.length}::timestamp`); }
  if (to) { logParams.push(to); logConditions.push(`sent_at <= $${logParams.length}::timestamp`); }
  if (userId) { logParams.push(userId); logConditions.push(`user_id = $${logParams.length}`); }
  if (teamId) { logParams.push(teamId); logConditions.push(`team_id = $${logParams.length}`); }

  const logWhere = logConditions.length > 0 ? `WHERE ${logConditions.join(' AND ')}` : '';
  const successConditions = [...logConditions, 'success = true'];
  const successWhere = `WHERE ${successConditions.join(' AND ')}`;

  const [totalResult, successCountResult, dispatchResult] = await Promise.all([
    query(`SELECT COUNT(*)::int as total FROM gerador_leads_whatsapp_logs ${logWhere}`, logParams),
    query(`SELECT COUNT(*)::int as total, COUNT(DISTINCT lead_number)::int as leads_unicos FROM gerador_leads_whatsapp_logs ${successWhere}`, logParams),
    query(`SELECT lead_number, MIN(sent_at) as first_sent FROM gerador_leads_whatsapp_logs ${successWhere} GROUP BY lead_number`, logParams),
  ]);

  const totalLeadsDisparados = totalResult.rows[0]?.total || 0;
  const totalLeadsSucesso = successCountResult.rows[0]?.total || 0;
  const leadsUnicosDisparados = successCountResult.rows[0]?.leads_unicos || 0;

  const dispatchMap = new Map();
  for (const row of dispatchResult.rows) {
    const normalized = stripPhoneTo55Local(row.lead_number);
    if (normalized) {
      dispatchMap.set(normalized, { firstSent: row.first_sent, leadNumber: row.lead_number });
    }
  }

  const erpAuthToken = process.env.ERP_AUTH_TOKEN;
  if (!erpAuthToken) {
    throw new Error('ERP_AUTH_TOKEN não configurado.');
  }
  const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

  console.log(`[Audit] Fetching ERP sales data...`);
  const erpResponse = await fetch('http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES', {
    method: 'GET',
    headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
  });
  if (!erpResponse.ok) {
    throw new Error(`ERP retornou status ${erpResponse.status}`);
  }
  const erpBody = await erpResponse.json();
  const vendasList = Array.isArray(erpBody) ? erpBody : [];
  console.log(`[Audit] ERP returned ${vendasList.length} sales records`);

  const vendasSemDisparo = [];
  const matchedContracts = new Set();
  const convertedPhones = new Set();
  const phoneContractCount = new Map();
  let valorTotalERP = 0;
  let valorDashboard = 0;

  for (const venda of vendasList) {
    const celRaw = venda.cel_indicador ? String(venda.cel_indicador).replace(/\D/g, '') : '';
    if (!celRaw) continue;

    const celNormalized = celRaw.startsWith('55') && celRaw.length >= 12 ? celRaw.slice(2) : celRaw;
    const valorContrato = parseBRCurrency(venda.valor_contrato);
    valorTotalERP += valorContrato;

    const count = phoneContractCount.get(celNormalized) || 0;
    phoneContractCount.set(celNormalized, count + 1);

    const dataContrato = venda.data_contrato ? new Date(venda.data_contrato) : null;
    const dispatchInfo = dispatchMap.get(celNormalized);

    if (!dispatchInfo) {
      vendasSemDisparo.push({
        cel_indicador: venda.cel_indicador,
        nome_indicador: venda.nome_indicador,
        contrato_servicos: venda.contrato_servicos,
        valor_contrato: valorContrato,
        data_contrato: venda.data_contrato,
        situacao_contrato: venda.situacao_contrato
      });
      continue;
    }

    if (!dataContrato || isNaN(dataContrato.getTime()) || dataContrato < new Date(dispatchInfo.firstSent)) {
      vendasSemDisparo.push({
        cel_indicador: venda.cel_indicador,
        nome_indicador: venda.nome_indicador,
        contrato_servicos: venda.contrato_servicos,
        valor_contrato: valorContrato,
        data_contrato: venda.data_contrato,
        situacao_contrato: venda.situacao_contrato,
        motivo: dataContrato ? 'data_contrato anterior ao disparo' : 'sem data de contrato'
      });
      continue;
    }

    const contratoId = venda.contrato_servicos || '';
    const contratoKey = contratoId
      ? `${celNormalized}_${contratoId}`
      : `${celNormalized}_${venda.cpf_indicado || ''}_${venda.data_contrato || ''}`;

    if (!matchedContracts.has(contratoKey)) {
      matchedContracts.add(contratoKey);
      valorDashboard += valorContrato;
    }
    convertedPhones.add(celNormalized);
  }

  const disparosSemVenda = [];
  for (const [phone, info] of dispatchMap.entries()) {
    if (!convertedPhones.has(phone)) {
      disparosSemVenda.push({
        lead_number: info.leadNumber,
        telefone_normalizado: phone,
        data_disparo: info.firstSent
      });
    }
  }

  const possiveisDuplicidades = [];
  for (const [phone, count] of phoneContractCount.entries()) {
    if (count > 1) {
      const contratos = vendasList
        .filter(v => {
          const cel = String(v.cel_indicador || '').replace(/\D/g, '');
          const norm = cel.startsWith('55') && cel.length >= 12 ? cel.slice(2) : cel;
          return norm === phone;
        })
        .map(v => ({ contrato: v.contrato_servicos, valor: parseBRCurrency(v.valor_contrato), data: v.data_contrato, situacao: v.situacao_contrato }));
      possiveisDuplicidades.push({ telefone: phone, total_contratos: count, contratos });
    }
  }

  const conversoes = matchedContracts.size;
  const leadsConvertidos = convertedPhones.size;
  const taxaRecalculada = leadsUnicosDisparados > 0 ? Number(((leadsConvertidos / leadsUnicosDisparados) * 100).toFixed(2)) : 0;
  const roiRecalculado = totalLeadsDisparados > 0 ? Number((valorDashboard / totalLeadsDisparados).toFixed(2)) : 0;

  return {
    totais: {
      leads_disparados: totalLeadsDisparados,
      leads_sucesso: totalLeadsSucesso,
      leads_unicos_disparados: leadsUnicosDisparados,
      vendas_erp: vendasList.length,
      vendas_vinculadas: conversoes,
      valor_total_erp: Number(valorTotalERP.toFixed(2)),
      valor_total_dashboard: Number(valorDashboard.toFixed(2))
    },
    inconsistencias: {
      vendas_sem_disparo: vendasSemDisparo,
      disparos_sem_venda: disparosSemVenda,
      possiveis_duplicidades: possiveisDuplicidades
    },
    validacao_metricas: {
      taxa_conversao_recalculada: taxaRecalculada,
      roi_recalculado: roiRecalculado,
      conversoes_identificadas: conversoes,
      leads_convertidos: leadsConvertidos
    }
  };
}

router.get('/lead-generator-metrics-audit', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar auditoria de métricas.' });
    }

    const { from, to, userId, teamId } = req.query;
    const result = await executeMetricsAudit({ from, to, userId, teamId });
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Audit] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

async function runLeadGeneratorAudit(options = {}) {
  const now = new Date();
  const from = options.from || new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const to = options.to || now.toISOString();

  console.log(`[Lead Generator Audit] Executando auditoria para período: ${from} até ${to}`);

  const auditResult = await executeMetricsAudit({ from, to, userId: options.userId, teamId: options.teamId });

  const divergencias =
    auditResult.inconsistencias.vendas_sem_disparo.length +
    auditResult.inconsistencias.disparos_sem_venda.length +
    auditResult.inconsistencias.possiveis_duplicidades.length;

  await query(
    `INSERT INTO gerador_leads_auditoria
      (periodo_inicio, periodo_fim, leads_disparados, disparos_sucesso, vendas_erp, vendas_vinculadas, valor_total_erp, valor_total_dashboard, divergencias, detalhes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      from,
      to,
      auditResult.totais.leads_disparados,
      auditResult.totais.leads_sucesso,
      auditResult.totais.vendas_erp,
      auditResult.totais.vendas_vinculadas,
      auditResult.totais.valor_total_erp,
      auditResult.totais.valor_total_dashboard,
      divergencias,
      JSON.stringify(auditResult)
    ]
  );

  if (divergencias > 0) {
    const valorAfetado = Math.abs(auditResult.totais.valor_total_erp - auditResult.totais.valor_total_dashboard);
    console.log(`[Lead Generator Audit] Divergências encontradas nas métricas`);
    console.log(`[Lead Generator Audit]   - Total de divergências: ${divergencias}`);
    console.log(`[Lead Generator Audit]   - Vendas sem disparo: ${auditResult.inconsistencias.vendas_sem_disparo.length}`);
    console.log(`[Lead Generator Audit]   - Disparos sem venda: ${auditResult.inconsistencias.disparos_sem_venda.length}`);
    console.log(`[Lead Generator Audit]   - Possíveis duplicidades: ${auditResult.inconsistencias.possiveis_duplicidades.length}`);
    console.log(`[Lead Generator Audit]   - Valor afetado: R$ ${valorAfetado.toFixed(2)}`);
    console.log(`[Lead Generator Audit]   - Período: ${from} até ${to}`);
  } else {
    console.log(`[Lead Generator Audit] Nenhuma divergência encontrada. Métricas consistentes.`);
  }

  return { divergencias, auditResult };
}

router.get('/run-lead-generator-audit', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para executar auditoria.' });
    }

    const { from, to, userId, teamId } = req.query;
    const { divergencias, auditResult } = await runLeadGeneratorAudit({ from, to, userId, teamId });

    res.json({
      success: true,
      message: divergencias > 0
        ? `Auditoria concluída. ${divergencias} divergência(s) encontrada(s).`
        : 'Auditoria concluída. Nenhuma divergência encontrada.',
      divergencias,
      ...auditResult
    });
  } catch (error) {
    console.error('[Lead Generator Audit] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export { runLeadGeneratorAudit };

async function runCommissionReconciliation() {
  console.log('[Commission Reconciliation] Starting reconciliation...');
  const issues = [];

  try {
    const erpToken = process.env.ERP_AUTH_TOKEN;
    if (!erpToken) {
      console.error('[Commission Reconciliation] ERP_AUTH_TOKEN not configured');
      return { success: false, error: 'ERP_AUTH_TOKEN not configured', issues: [] };
    }

    const API_URL = `https://api.grupobompastor.com.br/api/dados-vendas-indicacoes?token=${erpToken}`;
    const erpResponse = await fetch(API_URL);
    if (!erpResponse.ok) throw new Error(`ERP API error: ${erpResponse.status}`);
    const erpData = await erpResponse.json();
    const allRecords = Array.isArray(erpData) ? erpData : (erpData.data || []);

    const paidSales = allRecords.filter(r =>
      r.valores_pagos && String(r.valores_pagos).toUpperCase() === 'SIM'
    );

    const referralsResult = await query(
      "SELECT id, referred_cpf, commission_status, commission_value, created_at, stage FROM referrals WHERE stage = 'fechado_ganho' AND commission_value > 0 ORDER BY created_at ASC"
    );
    const referrals = referralsResult.rows;

    const usedContractsResult = await query('SELECT contrato_servicos, referral_id FROM processed_referral_contracts');
    const usedContractsMap = {};
    for (const row of usedContractsResult.rows) {
      usedContractsMap[row.contrato_servicos] = row.referral_id;
    }

    const referralsByCpf = {};
    for (const ref of referrals) {
      const cpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
      if (cpf && cpf.length >= 11) {
        if (!referralsByCpf[cpf]) referralsByCpf[cpf] = [];
        referralsByCpf[cpf].push(ref);
      }
    }

    const processedContracts = new Set();
    for (const sale of paidSales) {
      const contratoId = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
      if (!contratoId || processedContracts.has(contratoId)) continue;
      processedContracts.add(contratoId);

      const cpfIndicado = sale.cpf_indicado ? String(sale.cpf_indicado).replace(/\D/g, '') : '';
      const matchingReferrals = cpfIndicado ? (referralsByCpf[cpfIndicado] || []) : [];

      if (matchingReferrals.length === 0) {
        issues.push({
          contrato_servicos: contratoId,
          referral_id: null,
          cpf_indicado: cpfIndicado || null,
          tipo_problema: 'venda_sem_comissao',
          descricao: `Venda paga (contrato ${contratoId}) sem indicação correspondente no sistema`
        });
        continue;
      }

      const usedByReferralId = usedContractsMap[contratoId];
      if (!usedByReferralId) {
        issues.push({
          contrato_servicos: contratoId,
          referral_id: matchingReferrals[0].id,
          cpf_indicado: cpfIndicado,
          tipo_problema: 'venda_sem_comissao',
          descricao: `Venda paga (contrato ${contratoId}) com indicação existente mas contrato não vinculado a comissão`
        });
      }
    }

    for (const ref of referrals) {
      if (ref.commission_status === 'aprovada' || ref.commission_status === 'paga') {
        const refCpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
        const hasPaidSale = paidSales.some(s => {
          const cpf = s.cpf_indicado ? String(s.cpf_indicado).replace(/\D/g, '') : '';
          return cpf === refCpf;
        });

        if (!hasPaidSale) {
          issues.push({
            contrato_servicos: null,
            referral_id: ref.id,
            cpf_indicado: refCpf || null,
            tipo_problema: 'comissao_sem_venda',
            descricao: `Comissão ${ref.commission_status} para indicação ${ref.id} sem venda paga correspondente no ERP`
          });
        }
      }
    }

    const contractCommissionCount = {};
    for (const [contrato, refId] of Object.entries(usedContractsMap)) {
      if (!contractCommissionCount[contrato]) contractCommissionCount[contrato] = [];
      contractCommissionCount[contrato].push(refId);
    }
    for (const ref of referrals) {
      if (ref.commission_status === 'paga' || ref.commission_status === 'aprovada') {
        const refCpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
        const matchingSales = paidSales.filter(s => {
          const cpf = s.cpf_indicado ? String(s.cpf_indicado).replace(/\D/g, '') : '';
          return cpf === refCpf;
        });
        for (const sale of matchingSales) {
          const cid = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
          if (cid && usedContractsMap[cid] && usedContractsMap[cid] !== ref.id) {
            issues.push({
              contrato_servicos: cid,
              referral_id: ref.id,
              cpf_indicado: refCpf || null,
              tipo_problema: 'contrato_duplicado',
              descricao: `Contrato ${cid} vinculado a outra indicação, mas indicação ${ref.id} também possui comissão ${ref.commission_status}`
            });
          }
        }
      }
    }

    for (const ref of referrals) {
      if (ref.commission_status === 'paga') {
        const refCpf = ref.referred_cpf ? String(ref.referred_cpf).replace(/\D/g, '') : '';
        const currentErpSales = allRecords.filter(s => {
          const cpf = s.cpf_indicado ? String(s.cpf_indicado).replace(/\D/g, '') : '';
          return cpf === refCpf;
        });
        const hasUnpaidNow = currentErpSales.some(s =>
          String(s.valores_pagos || '').toUpperCase() !== 'SIM'
        ) && !currentErpSales.some(s =>
          String(s.valores_pagos || '').toUpperCase() === 'SIM'
        );

        if (hasUnpaidNow && currentErpSales.length > 0) {
          issues.push({
            contrato_servicos: null,
            referral_id: ref.id,
            cpf_indicado: refCpf || null,
            tipo_problema: 'venda_cancelada',
            descricao: `Comissão paga para indicação ${ref.id} mas ERP não possui mais venda paga para este CPF`
          });
        }
      }
    }

    const today = new Date().toISOString().split('T')[0];

    await query("DELETE FROM commission_reconciliation_logs WHERE execution_date = $1 AND resolved = false", [today]);

    for (const issue of issues) {
      await query(
        `INSERT INTO commission_reconciliation_logs (contrato_servicos, referral_id, cpf_indicado, tipo_problema, descricao, execution_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [issue.contrato_servicos, issue.referral_id, issue.cpf_indicado, issue.tipo_problema, issue.descricao, today]
      );
    }

    console.log(`[Commission Reconciliation] Completed. Found ${issues.length} issues.`);
    return { success: true, issuesFound: issues.length, issues };

  } catch (error) {
    console.error('[Commission Reconciliation] Error:', error.message);
    return { success: false, error: error.message, issues: [] };
  }
}

export { runCommissionReconciliation };

router.post('/commission-reconciliation/run', authMiddleware, async (req, res) => {
  try {
    const result = await runCommissionReconciliation();
    res.json(result);
  } catch (error) {
    console.error('[Commission Reconciliation] Manual run error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-reconciliation/logs', authMiddleware, async (req, res) => {
  try {
    const { date, tipo, resolved } = req.query;
    let sql = 'SELECT * FROM commission_reconciliation_logs WHERE 1=1';
    const params = [];

    if (date) {
      params.push(date);
      sql += ` AND execution_date = $${params.length}`;
    }
    if (tipo) {
      params.push(tipo);
      sql += ` AND tipo_problema = $${params.length}`;
    }
    if (resolved !== undefined) {
      params.push(resolved === 'true');
      sql += ` AND resolved = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT 500';

    const result = await query(sql, params);
    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('[Commission Reconciliation] Logs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-reconciliation/summary', authMiddleware, async (req, res) => {
  try {
    const summaryResult = await query(`
      SELECT 
        tipo_problema,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resolved = false) as pending,
        COUNT(*) FILTER (WHERE resolved = true) as resolved,
        MAX(execution_date) as last_execution
      FROM commission_reconciliation_logs
      GROUP BY tipo_problema
    `);

    const lastRunResult = await query(`
      SELECT MAX(execution_date) as last_run, COUNT(*) as total_issues
      FROM commission_reconciliation_logs
      WHERE execution_date = (SELECT MAX(execution_date) FROM commission_reconciliation_logs)
    `);

    res.json({
      success: true,
      byType: summaryResult.rows,
      lastRun: lastRunResult.rows[0] || null
    });
  } catch (error) {
    console.error('[Commission Reconciliation] Summary error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/commission-reconciliation/resolve/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';

    const result = await query(
      `UPDATE commission_reconciliation_logs 
       SET resolved = true, resolved_at = NOW(), resolved_by = $1 
       WHERE id = $2 RETURNING *`,
      [userEmail, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Log not found' });
    }

    res.json({ success: true, log: result.rows[0] });
  } catch (error) {
    console.error('[Commission Reconciliation] Resolve error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-whatsapp-logs-list', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para acessar logs de disparos.' });
    }

    const { page = 1, limit = 50, status, from, to, userId: filterUserId, batchId } = req.query;
    const result = await getLogsWithPagination({
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      from,
      to,
      userId: filterUserId,
      batchId,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[WhatsAppQueue] Logs list error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/lead-generator-check-conversions', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão para verificar conversões.' });
    }

    const { from, to } = req.body;

    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const logsResult = await query(
      `SELECT DISTINCT lead_number FROM gerador_leads_whatsapp_logs WHERE success = true`
    );

    if (logsResult.rows.length === 0) {
      return res.json({ success: true, matched: 0, message: 'Nenhum disparo encontrado.' });
    }

    const dispatchedNumbers = logsResult.rows.map(r => normalizePhone(r.lead_number)).filter(Boolean);

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;

    console.log(`[Conversions] Fetching ERP data from API_CPF_INDICADOR for conversion check...`);
    const erpResponse = await fetch(
      'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_CPF_INDICADOR',
      {
        method: 'GET',
        headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
      }
    );

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const erpRecords = Array.isArray(erpData) ? erpData : [];

    const activeContracts = erpRecords.filter(r => r.situacao_contrato === 'A');

    console.log(`[Conversions] ERP returned ${erpRecords.length} records, ${activeContracts.length} active contracts. Checking against ${dispatchedNumbers.length} dispatched numbers.`);

    const result = await checkConversions({
      erpRecords: activeContracts,
      from: from || null,
      to: to || null,
    });

    console.log(`[Conversions] Found ${result.matched} new conversions.`);
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Conversions] Check error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-conversions-metrics', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }

    const { from, to, userId: filterUserId, teamId: filterTeamId } = req.query;
    const metrics = await getConversionMetrics({ from, to, userId: filterUserId, teamId: filterTeamId });

    res.json({ success: true, ...metrics });
  } catch (error) {
    console.error('[Conversions] Metrics error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/lead-generator-conversions-list', authMiddleware, async (req, res) => {
  try {
    const agent = await getAgentForDispatchCheck(req);
    if (!agent || DISPATCH_FORBIDDEN_TYPES.includes(agent.agent_type)) {
      return res.status(403).json({ success: false, error: 'Sem permissão.' });
    }

    const { page = 1, limit = 50, from, to, userId: filterUserId, teamId: filterTeamId } = req.query;
    const result = await getConversionsList({
      page: parseInt(page),
      limit: parseInt(limit),
      from, to,
      userId: filterUserId,
      teamId: filterTeamId,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[Conversions] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/get-customer-from-erp', authMiddleware, async (req, res) => {
  try {
    const { cpf } = req.body;
    
    if (!cpf) {
      return res.status(400).json({ success: false, error: 'CPF é obrigatório' });
    }
    
    const cpfLimpo = cpf.replace(/\D/g, '');
    
    if (cpfLimpo.length !== 11) {
      return res.status(400).json({ success: false, error: 'CPF inválido' });
    }
    
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    
    if (!erpAuthToken) {
      console.error('ERP credentials not configured');
      return res.status(500).json({ 
        success: false, 
        error: 'Credenciais do ERP não configuradas. Configure ERP_AUTH_TOKEN.' 
      });
    }
    
    const cpfFormatado = cpfLimpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    const erpUrl = `http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_CPF_INDICADOR?cpf=${cpfFormatado}`;
    
    console.log(`Fetching ERP data for CPF: ${cpfLimpo} -> ${erpUrl}`);
    
    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json'
      }
    });
    
    if (!erpResponse.ok) {
      if (erpResponse.status === 404) {
        return res.status(404).json({
          success: false,
          error: 'Nenhum dado encontrado para este CPF',
          notFound: true,
          noContract: true
        });
      }
      if (erpResponse.status === 401) {
        console.error('ERP returned 401 - Token may be expired or invalid');
        return res.status(401).json({
          success: false,
          error: 'Token de autenticação do ERP inválido ou expirado. Verifique o ERP_AUTH_TOKEN.'
        });
      }
      throw new Error(`ERP returned status ${erpResponse.status}`);
    }
    
    const erpData = await erpResponse.json();
    
    if (!erpData || (Array.isArray(erpData) && erpData.length === 0)) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum dado encontrado para este CPF',
        notFound: true,
        noContract: true
      });
    }
    
    const rawData = Array.isArray(erpData) ? erpData : [erpData];
    const firstRecord = rawData[0];

    console.log(`[ERP CPF] Received ${rawData.length} records for CPF ${cpfLimpo}`);

    const situacaoMap = { 'A': 'Ativo', 'C': 'Cancelado', 'S': 'Suspenso' };

    const contractMap = new Map();
    let contratosAtivos = 0;
    let valorTotalMensal = 0;
    const indicadosSet = new Set();

    for (const record of rawData) {
      const contratoKey = String(record.contrato_servicos || record.id || '');
      if (contratoKey && !contractMap.has(contratoKey)) {
        const sit = situacaoMap[record.situacao_contrato] || record.situacao_contrato || 'Ativo';
        const valor = parseFloat(record.valor_contrato || 0);
        contractMap.set(contratoKey, {
          numero_contrato: contratoKey,
          plano: record.produto || '',
          valor_mensal: valor,
          inicio_vigencia: record.data_contrato || '',
          situacao: sit,
          status_pagamento: record.parcelas_abertas > 0 ? 'INADIMPLENTE' : 'EM DIA',
          nome_cliente_indicado: record.nome_cliente_indicado || null,
          cpf_indicado: record.cpf_indicado || null,
          canal: record.canal || '',
          vendedor: record.vendedor || record.vendedor_receptivo || '',
          data_vencimento: record.data_vencimento || '',
          vidas: record.vidas || 0,
        });
        if (sit.toLowerCase().includes('ativ')) contratosAtivos++;
        valorTotalMensal += valor;
      }
      if (record.nome_cliente_indicado) {
        indicadosSet.add(record.nome_cliente_indicado);
      }
    }

    const contracts = Array.from(contractMap.values());

    const cidadeUf = firstRecord.cidade || '';
    const cidadeParts = cidadeUf.split(' - ');
    const cidadeNome = cidadeParts[0]?.trim() || '';
    const ufValue = firstRecord.uf || cidadeParts[1]?.trim() || '';

    console.log(`[ERP CPF] Deduplicated to ${contracts.length} unique contracts, ${indicadosSet.size} unique indicated clients`);
    
    const response = {
      success: true,
      source: 'erp_bompastor',
      synced_at: new Date().toISOString(),
      data: {
        contact: {
          id: firstRecord.id || null,
          name: firstRecord.titular || firstRecord.nome || firstRecord.nome_cliente || '',
          document: firstRecord.cpf || cpfFormatado,
          birth_date: firstRecord.data_nascimento || firstRecord.nascimento || '',
          phones: [firstRecord.cel_indicador, firstRecord.cel, firstRecord.telefone, firstRecord.celular].filter(Boolean),
          emails: [firstRecord.e_mail, firstRecord.email].filter(Boolean),
          address: {
            logradouro: firstRecord.endereco || firstRecord.logradouro || '',
            numero: firstRecord.numero || '',
            complemento: firstRecord.complemento || '',
            bairro: firstRecord.bairro || '',
            cidade: cidadeNome,
            uf: ufValue,
            cep: firstRecord.cep || ''
          },
          vip: firstRecord.vip || false,
          codigo_erp: firstRecord.codigo || firstRecord.id_pessoa || firstRecord.id || null
        },
        contracts: contracts.slice(0, 50),
        dependents: (firstRecord.dependentes || []).map(dep => ({
          id_dependente_erp: dep.id || dep.codigo,
          nome: dep.nome,
          data_nascimento: dep.data_nascimento,
          status_vida: dep.status || 'VIVO'
        })),
        financial: {
          total_contratos: contracts.length,
          valor_total_mensal: valorTotalMensal,
          contratos_ativos: contratosAtivos,
          total_indicados: indicadosSet.size,
          total_registros_erp: rawData.length,
          status_geral: contratosAtivos > 0 ? 'EM DIA' : 'SEM CONTRATO ATIVO'
        },
        raw_erp_data: [firstRecord]
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error getting customer from ERP:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao consultar ERP: ' + error.message 
    });
  }
});

router.post('/generate-proposal', authMiddleware, async (req, res) => {
  try {
    const { template_id, lead_id, lead_type } = req.body;
    
    if (!template_id || !lead_id) {
      return res.status(400).json({ success: false, error: 'Template ID e Lead ID são obrigatórios' });
    }
    
    const templateResult = await query('SELECT * FROM proposal_templates WHERE id = $1', [template_id]);
    if (templateResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Template não encontrado' });
    }
    const template = templateResult.rows[0];
    
    const tableName = lead_type === 'pj' ? 'leads_pj' : lead_type === 'referral' ? 'referrals' : 'leads';
    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    const lead = leadResult.rows[0];
    
    let agent = null;
    const agentId = lead.agent_id;
    if (agentId) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
      if (agentResult.rows.length > 0) {
        agent = agentResult.rows[0];
      }
    }
    
    const pdfResult = await generateProposalPDF(template, lead, agent);
    
    await query(
      `UPDATE ${tableName} SET proposal_url = $1 WHERE id = $2`,
      [pdfResult.publicUrl, lead_id]
    );
    
    res.json({ 
      success: true, 
      proposal_url: pdfResult.publicUrl,
      file_name: pdfResult.fileName
    });
  } catch (error) {
    console.error('Error generating proposal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/send-proposal-whatsapp', authMiddleware, async (req, res) => {
  try {
    const { leadId, proposalUrl, lead_type } = req.body;
    
    if (!leadId) {
      return res.status(400).json({ success: false, error: 'Lead ID é obrigatório' });
    }
    
    const tableName = lead_type === 'pj' ? 'leads_pj' : lead_type === 'referral' ? 'referrals' : 'leads';
    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [leadId]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }
    const lead = leadResult.rows[0];
    
    const phone = lead.phone || lead.cell_phone || lead.whatsapp;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Lead não possui telefone cadastrado' });
    }
    
    const pdfUrl = proposalUrl || lead.proposal_url;
    if (!pdfUrl) {
      return res.status(400).json({ success: false, error: 'Proposta não foi gerada. Gere a proposta primeiro.' });
    }
    
    let agent = null;
    const agentId = lead.agent_id;
    if (agentId) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentId]);
      if (agentResult.rows.length > 0) {
        agent = agentResult.rows[0];
      }
    }
    
    const leadName = lead.name || lead.full_name || lead.contact_name || 'Cliente';
    
    const formattedPhone = phone.replace(/\D/g, '');
    const brazilNumber = formattedPhone.startsWith('55') ? formattedPhone : `55${formattedPhone}`;
    
    // Build public URL for the PDF
    let baseUrl;
    if (process.env.APP_DOMAIN) {
      baseUrl = process.env.APP_DOMAIN;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else if (process.env.REPLIT_DOMAINS) {
      const domains = process.env.REPLIT_DOMAINS.split(',');
      baseUrl = `https://${domains[0]}`;
    } else {
      baseUrl = `http://localhost:${process.env.PORT || 3001}`;
    }
    
    // Ensure URL ends with .pdf and is absolute
    let fullPdfUrl = pdfUrl.startsWith('http') ? pdfUrl : `${baseUrl}${pdfUrl}`;
    if (!fullPdfUrl.endsWith('.pdf')) {
      fullPdfUrl = fullPdfUrl + '.pdf';
    }
    
    console.log('[WhatsApp] PDF URL:', fullPdfUrl);
    
    const templateSettingResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'proposal_template_id' LIMIT 1"
    );
    const PROPOSAL_TEMPLATE_ID = templateSettingResult.rows[0]?.setting_value || '697a2b0d532f3df41d2288dc';

    const proposalVarsResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'proposal_template_variables' LIMIT 1"
    );
    let proposalTemplateVars = null;
    try {
      if (proposalVarsResult.rows[0]?.setting_value) {
        proposalTemplateVars = JSON.parse(proposalVarsResult.rows[0].setting_value);
      }
    } catch(e) {}

    let templateComponents;
    if (proposalTemplateVars && proposalTemplateVars.length > 0 && proposalTemplateVars.some(v => v.source)) {
      const resolveVar = (v) => {
        switch (v.source) {
          case 'lead_name': return lead.name || lead.full_name || lead.contact_name || 'Cliente';
          case 'company_name': return lead.company_name || lead.razao_social || lead.nome_fantasia || '';
          case 'agent_name': return agent?.name || 'Consultor';
          case 'lead_email': return lead.email || '';
          case 'lead_phone': return lead.phone || lead.whatsapp || '';
          case 'proposal_url': return fullPdfUrl;
          case 'contract_url': return '';
          case 'custom': return v.customValue || v.custom_value || '';
          default: return '';
        }
      };
      const fallbackValues = [leadName, agent?.name || 'Consultor', lead.email || '', lead.company_name || '', lead.phone || ''];
      const bodyParams = proposalTemplateVars.map((v, idx) => {
        const resolved = v.source ? resolveVar(v) : '';
        return { type: 'text', text: resolved || fallbackValues[idx] || '' };
      });
      templateComponents = [{ type: 'BODY', parameters: bodyParams }];

      templateComponents.push({
        type: 'HEADER',
        parameters: [{ type: 'document', document: { link: fullPdfUrl, fileName: `Proposta - ${leadName}` } }]
      });
    } else {
      templateComponents = [
        {
          type: 'BODY',
          parameters: [
            { type: 'text', text: leadName }
          ]
        },
        {
          type: 'HEADER',
          parameters: [
            {
              type: 'document',
              document: {
                link: fullPdfUrl,
                fileName: `Proposta - ${leadName}`
              }
            }
          ]
        }
      ];
    }
    
    const tokenResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'automation_token' LIMIT 1"
    );
    const token = tokenResult.rows[0]?.setting_value || process.env.RUDO_WHATSAPP_TOKEN;
    if (!token) {
      throw new Error('Token de WhatsApp não configurado. Configure no menu de Automações.');
    }
    
    const body = {
      forceSend: true,
      templateId: PROPOSAL_TEMPLATE_ID,
      verifyContact: false,
      number: brazilNumber,
      templateComponents: templateComponents
    };
    
    console.log('[WhatsApp] Sending proposal template:', JSON.stringify(body, null, 2));
    
    const response = await fetch('https://api.wescctech.com.br/core/v2/api/chats/send-template', {
      method: 'POST',
      headers: {
        'access-token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const responseData = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      console.error('[WhatsApp] Template send failed:', responseData);
      throw new Error(`Falha ao enviar template: ${responseData.msg || response.statusText}`);
    }
    
    console.log('[WhatsApp] Proposal sent successfully:', responseData);
    
    if (lead_type === 'referral') {
      await query(
        `INSERT INTO referral_activities (referral_id, type, title, description, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [leadId, 'note', 'Proposta enviada via WhatsApp', `Proposta (PDF) enviada para ${phone}`]
      );
    } else {
      const activityColumn = lead_type === 'pj' ? 'lead_pj_id' : 'lead_id';
      await query(
        `INSERT INTO activities (${activityColumn}, type, title, description, assigned_to, completed)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [leadId, 'note', 'Proposta enviada via WhatsApp', `Proposta (PDF) enviada para ${phone}`, agentId, true]
      );
    }
    
    res.json({ 
      success: true, 
      message: 'Proposta enviada via WhatsApp com PDF anexado',
      ...responseData
    });
  } catch (error) {
    console.error('Error sending proposal via WhatsApp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/send-proposal-email', authMiddleware, async (req, res) => {
  try {
    const { lead_id, proposal_url } = req.body;
    res.json({ success: false, error: 'Envio de e-mail não implementado. Configure um serviço de e-mail.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/ai-assistant', authMiddleware, async (req, res) => {
  try {
    const { prompt, context, conversationHistory = [] } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }
    
    const openai = new OpenAI({
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
    });
    
    const systemMessage = {
      role: 'system',
      content: `Você é um assistente de CRM especializado em atendimento ao cliente, vendas e suporte técnico. 
Você ajuda agentes de suporte, vendedores e gerentes a:
- Redigir respostas para clientes
- Sugerir soluções para problemas técnicos
- Analisar situações de vendas e sugerir abordagens
- Resumir históricos de atendimento
- Criar templates de mensagens profissionais

${context ? `Contexto adicional: ${context}` : ''}

Responda sempre em português brasileiro de forma profissional e objetiva.`
    };
    
    const messages = [
      systemMessage,
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.7,
    });
    
    const assistantMessage = completion.choices[0]?.message?.content || 'Não foi possível gerar uma resposta.';
    
    res.json({ 
      success: true, 
      response: assistantMessage,
      usage: completion.usage
    });
  } catch (error) {
    console.error('Error in AI assistant:', error);
    res.status(500).json({ message: error.message });
  }
});

router.post('/process-call-audit', authMiddleware, async (req, res) => {
  try {
    const { audio_url, agent_id, checklist_id, ticket_id } = req.body;
    
    const result = await query(
      `INSERT INTO call_audits (audio_url, agent_id, checklist_id, ticket_id, status) 
       VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
      [audio_url, agent_id, checklist_id, ticket_id]
    );
    
    res.json({ 
      success: true, 
      audit: result.rows[0],
      message: 'Audit created - processing not implemented (integrate with OpenAI Whisper)'
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

function mapPorteToSelect(porteDescricao) {
  if (!porteDescricao) return '';
  const porte = porteDescricao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (porte.includes('microempreendedor') || porte === 'mei') return 'MEI';
  if (porte.includes('micro empresa') || porte.includes('microempresa') || porte === 'me') return 'ME';
  if (porte.includes('pequeno porte') || porte.includes('epp') || porte.includes('pequena empresa')) return 'EPP';
  if (porte.includes('medio porte') || porte.includes('media empresa')) return 'Médio';
  if (porte.includes('grande porte') || porte.includes('grande empresa')) return 'Grande';
  if (porte.includes('demais')) return 'Grande';
  return '';
}

router.post('/busca-cnpj', authMiddleware, async (req, res) => {
  try {
    const { cnpj } = req.body;
    
    if (!cnpj) {
      return res.status(400).json({ success: false, error: 'CNPJ é obrigatório' });
    }
    
    const cleanCnpj = cnpj.replace(/\D/g, '');
    
    if (cleanCnpj.length !== 14) {
      return res.status(400).json({ success: false, error: 'CNPJ inválido' });
    }
    
    const response = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return res.json({ success: false, error: 'CNPJ não encontrado' });
      }
      return res.json({ success: false, error: 'Erro ao consultar CNPJ' });
    }
    
    const apiData = await response.json();
    
    const mappedData = {
      razao_social: apiData.razao_social || '',
      nome_fantasia: apiData.estabelecimento?.nome_fantasia || apiData.razao_social || '',
      contact_name: apiData.socios?.[0]?.nome || '',
      atividade_principal: apiData.estabelecimento?.atividade_principal?.descricao || '',
      situacao_cadastral: apiData.estabelecimento?.situacao_cadastral || '',
      porte: mapPorteToSelect(apiData.porte?.descricao),
      street: apiData.estabelecimento?.logradouro ? 
        `${apiData.estabelecimento.tipo_logradouro || ''} ${apiData.estabelecimento.logradouro}`.trim() : '',
      number: apiData.estabelecimento?.numero || '',
      complement: apiData.estabelecimento?.complemento || '',
      neighborhood: apiData.estabelecimento?.bairro || '',
      city: apiData.estabelecimento?.cidade?.nome || '',
      state: apiData.estabelecimento?.estado?.sigla || '',
      cep: apiData.estabelecimento?.cep || '',
      phone: apiData.estabelecimento?.ddd1 && apiData.estabelecimento?.telefone1 ? 
        `(${apiData.estabelecimento.ddd1}) ${apiData.estabelecimento.telefone1}` : '',
      phone_secondary: apiData.estabelecimento?.ddd2 && apiData.estabelecimento?.telefone2 ?
        `(${apiData.estabelecimento.ddd2}) ${apiData.estabelecimento.telefone2}` : '',
      email: (apiData.estabelecimento?.email || '').toLowerCase(),
    };
    
    res.json({ 
      success: true, 
      data: mappedData,
      raw: apiData 
    });
  } catch (error) {
    console.error('Erro ao buscar CNPJ:', error);
    res.status(500).json({ success: false, error: 'Erro ao consultar dados do CNPJ' });
  }
});

router.get('/getPublicContract', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ success: false, error: 'Token nao fornecido' });
    }

    const leadResult = await query(
      `SELECT * FROM leads WHERE contract_token = $1`,
      [token]
    );
    
    if (leadResult.rows.length === 0) {
      const leadPJResult = await query(
        `SELECT * FROM leads_pj WHERE contract_token = $1`,
        [token]
      );
      
      if (leadPJResult.rows.length === 0) {
        const referralResult = await query(
          `SELECT * FROM referrals WHERE contract_token = $1`,
          [token]
        );
        
        if (referralResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Contrato nao encontrado' });
        }
        
        const referral = referralResult.rows[0];
        return res.json({
          success: true,
          lead: {
            id: referral.id,
            name: referral.name,
            phone: referral.phone,
            email: referral.email,
            cpf: referral.cpf,
          },
          contract: {
            proposal_url: referral.proposal_url,
            product_name: referral.proposal_product,
            price: referral.proposal_price,
            payment_due_day: referral.payment_due_day || 10,
            signature_url: referral.contract_signature_url,
            signed_at: referral.contract_signed_at,
          }
        });
      }
      
      const lead = leadPJResult.rows[0];
      return res.json({
        success: true,
        lead: {
          id: lead.id,
          name: lead.company_name || lead.contact_name,
          phone: lead.phone,
          email: lead.email,
          cpf: lead.cnpj,
        },
        contract: {
          proposal_url: lead.proposal_url,
          product_name: lead.proposal_product,
          price: lead.proposal_price,
          payment_due_day: lead.payment_due_day || 10,
          signature_url: lead.contract_signature_url,
          signed_at: lead.contract_signed_at,
        }
      });
    }
    
    const lead = leadResult.rows[0];
    res.json({
      success: true,
      lead: {
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        cpf: lead.cpf,
      },
      contract: {
        proposal_url: lead.proposal_url,
        product_name: lead.proposal_product,
        price: lead.proposal_price,
        payment_due_day: lead.payment_due_day || 10,
        signature_url: lead.contract_signature_url,
        signed_at: lead.contract_signed_at,
      }
    });
  } catch (error) {
    console.error('Erro ao buscar contrato:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar contrato' });
  }
});

router.post('/signContract', async (req, res) => {
  try {
    const { token, signatureDataUrl } = req.body;
    
    if (!token || !signatureDataUrl) {
      return res.status(400).json({ success: false, error: 'Token e assinatura sao obrigatorios' });
    }

    let lead = null;
    let tableName = 'leads';

    const leadResult = await query(
      `SELECT * FROM leads WHERE contract_token = $1`,
      [token]
    );
    
    if (leadResult.rows.length === 0) {
      const leadPJResult = await query(
        `SELECT * FROM leads_pj WHERE contract_token = $1`,
        [token]
      );
      
      if (leadPJResult.rows.length === 0) {
        const referralResult = await query(
          `SELECT * FROM referrals WHERE contract_token = $1`,
          [token]
        );
        
        if (referralResult.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Contrato nao encontrado' });
        }
        
        lead = referralResult.rows[0];
        tableName = 'referrals';
      } else {
        lead = leadPJResult.rows[0];
        tableName = 'leads_pj';
      }
    } else {
      lead = leadResult.rows[0];
    }

    if (lead.contract_signature_url) {
      return res.status(400).json({ success: false, error: 'Contrato ja foi assinado' });
    }

    const base64Data = signatureDataUrl.replace(/^data:image\/png;base64,/, '');
    const fileName = `assinatura_contrato_${lead.id}_${Date.now()}.png`;
    const filePath = path.join(process.cwd(), 'public', 'signatures', fileName);
    
    const signaturesDir = path.join(process.cwd(), 'public', 'signatures');
    if (!fs.existsSync(signaturesDir)) {
      fs.mkdirSync(signaturesDir, { recursive: true });
    }

    fs.writeFileSync(filePath, base64Data, 'base64');

    const appDomain = process.env.APP_DOMAIN || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 3001}`);
    const signatureUrl = `${appDomain}/public/signatures/${fileName}`;

    await query(
      `UPDATE ${tableName} SET contract_signature_url = $1, contract_signed_at = $2 WHERE id = $3`,
      [signatureUrl, new Date().toISOString(), lead.id]
    );

    let activityTable = 'activities';
    let leadIdColumn = 'lead_id';
    if (tableName === 'leads_pj') {
      activityTable = 'activities_pj';
    } else if (tableName === 'referrals') {
      activityTable = 'referral_activities';
      leadIdColumn = 'referral_id';
    }
    await query(
      `INSERT INTO ${activityTable} (${leadIdColumn}, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [lead.id, 'note', 'Contrato assinado digitalmente', 'Cliente assinou o contrato via link digital', new Date().toISOString()]
    );

    res.json({
      success: true,
      signatureUrl,
      message: 'Contrato assinado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao assinar contrato:', error);
    res.status(500).json({ success: false, error: 'Erro ao salvar assinatura' });
  }
});

router.post('/send-contract-whatsapp', authMiddleware, async (req, res) => {
  try {
    const { leadId, lead_type = 'pj' } = req.body;
    
    let tableName = 'leads';
    if (lead_type === 'pj') {
      tableName = 'leads_pj';
    } else if (lead_type === 'referral') {
      tableName = 'referrals';
    }
    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [leadId]);
    
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead não encontrado' });
    }

    const lead = leadResult.rows[0];
    
    if (!lead.proposal_url) {
      return res.status(400).json({ success: false, error: 'Gere a proposta primeiro antes de enviar o contrato' });
    }

    const crypto = await import('crypto');
    const contractToken = crypto.randomBytes(32).toString('hex');
    
    await query(
      `UPDATE ${tableName} SET contract_token = $1 WHERE id = $2`,
      [contractToken, leadId]
    );

    const appDomain = process.env.APP_DOMAIN || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 3001}`);
    const contractUrl = `${appDomain}/PublicContractSign?token=${contractToken}`;

    let phone = lead.phone || lead.whatsapp || lead.cell_phone;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'Lead não possui telefone' });
    }
    phone = phone.replace(/\D/g, '');
    if (!phone.startsWith('55')) {
      phone = '55' + phone;
    }

    const tokenResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'automation_token' LIMIT 1"
    );
    const token = tokenResult.rows[0]?.setting_value || process.env.RUDO_WHATSAPP_TOKEN;
    if (!token) {
      return res.status(500).json({ success: false, error: 'Token de WhatsApp não configurado. Configure no menu de Automações.' });
    }

    const contractTemplateResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'contract_template_id' LIMIT 1"
    );
    const contractTemplateId = contractTemplateResult.rows[0]?.setting_value;

    const contractVarsResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'contract_template_variables' LIMIT 1"
    );
    let contractTemplateVars = null;
    try {
      if (contractVarsResult.rows[0]?.setting_value) {
        contractTemplateVars = JSON.parse(contractVarsResult.rows[0].setting_value);
      }
    } catch(e) {}

    let agentForContract = null;
    const agentIdForContract = lead.agent_id;
    if (agentIdForContract) {
      const agentResult = await query('SELECT * FROM agents WHERE id = $1', [agentIdForContract]);
      if (agentResult.rows.length > 0) agentForContract = agentResult.rows[0];
    }

    const leadName = lead.name || lead.company_name || lead.contact_name || lead.fantasy_name || 'Cliente';
    let responseData;

    if (contractTemplateId) {
      let templateComponents;
      if (contractTemplateVars && contractTemplateVars.length > 0 && contractTemplateVars.some(v => v.source)) {
        const resolveVar = (v) => {
          switch (v.source) {
            case 'lead_name': return lead.name || lead.company_name || lead.contact_name || 'Cliente';
            case 'company_name': return lead.company_name || lead.razao_social || lead.nome_fantasia || '';
            case 'agent_name': return agentForContract?.name || 'Consultor';
            case 'lead_email': return lead.email || '';
            case 'lead_phone': return lead.phone || lead.whatsapp || '';
            case 'proposal_url': return lead.proposal_url || '';
            case 'contract_url': return contractUrl;
            case 'custom': return v.customValue || v.custom_value || '';
            default: return '';
          }
        };
        const fallbackValues = [leadName, contractUrl, lead.email || '', lead.company_name || '', lead.phone || ''];
        const bodyParams = contractTemplateVars.map((v, idx) => {
          const resolved = v.source ? resolveVar(v) : '';
          return { type: 'text', text: resolved || fallbackValues[idx] || '' };
        });
        templateComponents = [{ type: 'BODY', parameters: bodyParams }];
      } else {
        templateComponents = [
          {
            type: 'BODY',
            parameters: [
              { type: 'text', text: leadName },
              { type: 'text', text: contractUrl }
            ]
          }
        ];
      }

      const body = {
        forceSend: true,
        templateId: contractTemplateId,
        verifyContact: false,
        number: phone,
        templateComponents: templateComponents
      };

      console.log('[WhatsApp] Sending contract template:', JSON.stringify(body, null, 2));

      const response = await fetch('https://api.wescctech.com.br/core/v2/api/chats/send-template', {
        method: 'POST',
        headers: {
          'access-token': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('[WhatsApp] Contract template send failed:', responseData);
        throw new Error(`Falha ao enviar template de contrato: ${responseData.msg || response.statusText}`);
      }
    } else {
      const message = `Olá ${leadName}! 📋\n\nSegue o link para assinatura digital do seu contrato:\n\n${contractUrl}\n\nPor favor, acesse o link acima para visualizar e assinar seu contrato digitalmente.\n\nQualquer dúvida, estamos à disposição!`;

      const body = {
        number: phone,
        forceSend: true,
        text: message,
      };

      const response = await fetch('https://api.wescctech.com.br/core/v2/api/chats/send-text', {
        method: 'POST',
        headers: {
          'access-token': token,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(body),
      });

      responseData = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('[WhatsApp] Contract text send failed:', responseData);
        throw new Error(`Falha ao enviar mensagem de contrato: ${responseData.msg || response.statusText}`);
      }
    }

    console.log('[WhatsApp] Contract link sent:', responseData);

    const activityTable = tableName === 'leads' ? 'activities' : 'activities_pj';
    await query(
      `INSERT INTO ${activityTable} (lead_id, type, description, created_at) VALUES ($1, $2, $3, $4)`,
      [leadId, 'whatsapp', `Link de assinatura digital enviado para ${phone}`, new Date().toISOString()]
    );

    res.json({
      success: true,
      message: 'Link de contrato enviado via WhatsApp',
      contractUrl,
      ...responseData
    });
  } catch (error) {
    console.error('Erro ao enviar contrato via WhatsApp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/autentiqueCreateDocument', authMiddleware, async (req, res) => {
  try {
    console.log('[Autentique] Creating document, body:', JSON.stringify(req.body));
    const { lead_id, contract_url, send_method = 'email', lead_type = 'pf' } = req.body;
    
    if (!lead_id || !contract_url) {
      console.log('[Autentique] Missing required fields');
      return res.status(400).json({ success: false, error: 'lead_id e contract_url sao obrigatorios' });
    }

    const autentiqueTokenResult = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'autentique_token' LIMIT 1"
    );
    const AUTENTIQUE_TOKEN = autentiqueTokenResult.rows[0]?.setting_value || process.env.AUTENTIQUE_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      console.log('[Autentique] Token not configured');
      return res.status(500).json({ success: false, error: 'Token Autentique não configurado. Configure em Configurações > Integrações.' });
    }
    console.log('[Autentique] Token found, length:', AUTENTIQUE_TOKEN.length);

    let tableName = 'leads';
    if (lead_type === 'pj') {
      tableName = 'leads_pj';
    } else if (lead_type === 'referral') {
      tableName = 'referrals';
    }

    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead nao encontrado' });
    }

    const lead = leadResult.rows[0];
    const signerEmail = lead.email;
    const signerName = lead.name || lead.company_name || lead.contact_name || 'Cliente';

    if (!signerEmail && send_method === 'email') {
      console.log('[Autentique] Lead has no email and send_method is email');
      return res.status(400).json({ success: false, error: 'Lead nao possui email cadastrado. Cadastre o email ou use o metodo "link".' });
    }
    console.log('[Autentique] Signer:', signerName, '| Email:', signerEmail || '(none - link mode)', '| Method:', send_method);

    let pdfBuffer;
    if (contract_url.startsWith('/uploads/')) {
      const localPath = path.join(process.cwd(), contract_url);
      console.log('[Autentique] Reading PDF from local file:', localPath);
      if (!fs.existsSync(localPath)) {
        console.log('[Autentique] File not found at:', localPath);
        return res.status(404).json({ success: false, error: 'Arquivo do contrato nao encontrado no servidor' });
      }
      pdfBuffer = fs.readFileSync(localPath);
      console.log('[Autentique] PDF read from disk, size:', pdfBuffer.length);
    } else if (contract_url.startsWith('/')) {
      const appDomain = process.env.APP_DOMAIN || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${process.env.PORT || 3001}`);
      const fullContractUrl = `${appDomain}${contract_url}`;
      console.log('[Autentique] Downloading PDF from:', fullContractUrl);
      const pdfResponse = await axios.get(fullContractUrl, { 
        responseType: 'arraybuffer',
        timeout: 30000
      });
      pdfBuffer = Buffer.from(pdfResponse.data);
      console.log('[Autentique] PDF downloaded, size:', pdfBuffer.length);
    } else {
      console.log('[Autentique] Downloading PDF from external URL:', contract_url);
      const pdfResponse = await axios.get(contract_url, { 
        responseType: 'arraybuffer',
        timeout: 30000
      });
      pdfBuffer = Buffer.from(pdfResponse.data);
      console.log('[Autentique] PDF downloaded, size:', pdfBuffer.length);
    }

    const documentName = `Contrato - ${signerName} - ${new Date().toLocaleDateString('pt-BR')}`;

    const mutation = `mutation CreateDocumentMutation($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
      createDocument(document: $document, signers: $signers, file: $file) {
        id
        name
        created_at
        signatures {
          public_id
          name
          email
          link {
            short_link
          }
        }
      }
    }`;

    const signerData = {
      action: 'SIGN',
      name: signerName
    };
    if (signerEmail) {
      signerData.email = signerEmail;
    }

    const variables = {
      document: {
        name: documentName
      },
      signers: [signerData],
      file: null
    };

    const formData = new FormData();
    formData.append('operations', JSON.stringify({
      query: mutation,
      variables: variables
    }));
    formData.append('map', JSON.stringify({ 'file': ['variables.file'] }));
    formData.append('file', pdfBuffer, {
      filename: 'contrato.pdf',
      contentType: 'application/pdf'
    });

    const autentiqueResponse = await axios.post(AUTENTIQUE_API_URL, formData, {
      headers: {
        'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        ...formData.getHeaders()
      },
      timeout: 60000
    });

    const responseData = autentiqueResponse.data;

    if (responseData.errors) {
      console.error('Erro Autentique:', responseData.errors);
      return res.status(400).json({ 
        success: false, 
        error: responseData.errors[0]?.message || 'Erro na API Autentique' 
      });
    }

    const createdDocument = responseData.data?.createDocument;
    if (!createdDocument) {
      return res.status(500).json({ success: false, error: 'Resposta invalida da Autentique' });
    }

    const signatureLink = createdDocument.signatures?.[0]?.link?.short_link || null;
    const autentiqueId = createdDocument.id;

    await query(
      `UPDATE ${tableName} SET signature_autentique_id = $1, signature_link = $2, signature_status = $3 WHERE id = $4`,
      [autentiqueId, signatureLink, 'pending', lead_id]
    );

    let activityTable = 'activities';
    let leadIdColumn = 'lead_id';
    if (tableName === 'leads_pj') {
      activityTable = 'activities_pj';
    } else if (tableName === 'referrals') {
      activityTable = 'referral_activities';
      leadIdColumn = 'referral_id';
    }
    
    await query(
      `INSERT INTO ${activityTable} (${leadIdColumn}, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
      [lead_id, 'note', 'Contrato enviado para assinatura', `Documento enviado via Autentique para ${signerEmail}`, new Date().toISOString()]
    );

    res.json({
      success: true,
      autentique_id: autentiqueId,
      signature_link: signatureLink,
      message: send_method === 'email' ? 'Contrato enviado para assinatura via e-mail' : 'Link de assinatura gerado'
    });
  } catch (error) {
    console.error('[Autentique] Error creating document:', error.message);
    if (error.response) {
      console.error('[Autentique] Response status:', error.response.status);
      console.error('[Autentique] Response data:', JSON.stringify(error.response.data));
    }
    res.status(500).json({ success: false, error: error.message || 'Erro ao processar documento' });
  }
});

router.post('/autentiqueCheckStatus', authMiddleware, async (req, res) => {
  try {
    const { lead_id, lead_type = 'pf' } = req.body;
    
    if (!lead_id) {
      return res.status(400).json({ success: false, error: 'lead_id e obrigatorio' });
    }

    const autentiqueTokenResult2 = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'autentique_token' LIMIT 1"
    );
    const AUTENTIQUE_TOKEN = autentiqueTokenResult2.rows[0]?.setting_value || process.env.AUTENTIQUE_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token Autentique não configurado. Configure em Configurações > Integrações.' });
    }

    let tableName = 'leads';
    if (lead_type === 'pj') {
      tableName = 'leads_pj';
    } else if (lead_type === 'referral') {
      tableName = 'referrals';
    }

    const leadResult = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [lead_id]);
    if (leadResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead nao encontrado' });
    }

    const lead = leadResult.rows[0];
    const autentiqueId = lead.signature_autentique_id;

    if (!autentiqueId) {
      return res.status(400).json({ success: false, error: 'Nenhum documento em assinatura' });
    }

    const queryGraphQL = `query {
      document(id: "${autentiqueId}") {
        id
        name
        signatures {
          public_id
          name
          email
          signed {
            created_at
          }
          rejected {
            created_at
            reason
          }
        }
      }
    }`;

    const autentiqueResponse = await axios.post(AUTENTIQUE_API_URL, {
      query: queryGraphQL
    }, {
      headers: {
        'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const responseData = autentiqueResponse.data;
    console.log('[Autentique] Response:', JSON.stringify(responseData, null, 2));

    if (responseData.errors) {
      console.error('Erro Autentique:', responseData.errors);
      return res.status(400).json({ 
        success: false, 
        error: responseData.errors[0]?.message || 'Erro na API Autentique' 
      });
    }

    const document = responseData.data?.document;
    if (!document) {
      return res.status(404).json({ success: false, error: 'Documento nao encontrado na Autentique' });
    }

    const signatures = document.signatures || [];
    let newStatus = 'pending';
    
    const clientSignature = signatures.find(s => s.email === lead.email) || signatures[signatures.length - 1];
    
    if (clientSignature?.signed?.created_at) {
      newStatus = 'signed';
    } else if (clientSignature?.rejected?.created_at) {
      newStatus = 'rejected';
    }
    
    const signature = clientSignature;

    if (newStatus !== lead.signature_status) {
      await query(
        `UPDATE ${tableName} SET signature_status = $1 WHERE id = $2`,
        [newStatus, lead_id]
      );

      if (newStatus === 'signed') {
        let activityTable = 'activities';
        let leadIdColumn = 'lead_id';
        if (tableName === 'leads_pj') {
          activityTable = 'activities_pj';
        } else if (tableName === 'referrals') {
          activityTable = 'referral_activities';
          leadIdColumn = 'referral_id';
        }
        
        await query(
          `INSERT INTO ${activityTable} (${leadIdColumn}, type, title, description, created_at) VALUES ($1, $2, $3, $4, $5)`,
          [lead_id, 'note', 'Contrato assinado', 'Cliente assinou o contrato via Autentique', new Date().toISOString()]
        );

        try {
          const downloadQuery = `query {
            document(id: "${autentiqueId}") {
              files {
                signed
              }
            }
          }`;

          const downloadResponse = await axios.post(AUTENTIQUE_API_URL, {
            query: downloadQuery
          }, {
            headers: {
              'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
              'Content-Type': 'application/json'
            },
            timeout: 30000
          });

          const signedFileUrl = downloadResponse.data?.data?.document?.files?.signed;
          
          if (signedFileUrl) {
            const pdfResponse = await axios.get(signedFileUrl, {
              responseType: 'arraybuffer',
              timeout: 60000
            });

            const signedFileName = `${lead_id}_signed_${Date.now()}.pdf`;
            const signedFilePath = path.join(process.cwd(), 'uploads', signedFileName);
            
            fs.writeFileSync(signedFilePath, pdfResponse.data);
            
            const signedContractUrl = `/uploads/${signedFileName}`;
            await query(
              `UPDATE ${tableName} SET contract_url = $1, contract_signed_at = $2 WHERE id = $3`,
              [signedContractUrl, new Date().toISOString(), lead_id]
            );
            
            console.log(`[Autentique] Contrato assinado salvo: ${signedContractUrl}`);
          }
        } catch (downloadError) {
          console.error('[Autentique] Erro ao baixar contrato assinado:', downloadError.message);
        }
      }
    }

    res.json({
      success: true,
      status: newStatus,
      document: {
        id: document.id,
        name: document.name,
        signature: signature ? {
          name: signature.name,
          email: signature.email,
          signed_at: signature.signed?.created_at || null,
          rejected_at: signature.rejected?.created_at || null,
          rejection_reason: signature.rejected?.reason || null
        } : null
      }
    });
  } catch (error) {
    console.error('Erro ao verificar status Autentique:', error);
    res.status(500).json({ success: false, error: error.message || 'Erro ao verificar status' });
  }
});

router.get('/autentiqueTest', authMiddleware, async (req, res) => {
  try {
    const autentiqueTokenResult3 = await query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'autentique_token' LIMIT 1"
    );
    const AUTENTIQUE_TOKEN = autentiqueTokenResult3.rows[0]?.setting_value || process.env.AUTENTIQUE_TOKEN;
    if (!AUTENTIQUE_TOKEN) {
      return res.status(500).json({ success: false, error: 'Token Autentique não configurado. Configure em Configurações > Integrações.' });
    }

    const graphqlQuery = `
      query {
        me {
          id
          name
          email
        }
      }
    `;

    const response = await axios.post(AUTENTIQUE_API_URL, {
      query: graphqlQuery
    }, {
      headers: {
        'Authorization': `Bearer ${AUTENTIQUE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (response.data.errors) {
      console.error('Erro Autentique Test:', response.data.errors);
      return res.status(400).json({ 
        success: false, 
        error: response.data.errors[0]?.message || 'Erro na API Autentique',
        details: response.data.errors
      });
    }

    const userData = response.data.data?.me;
    
    res.json({
      success: true,
      message: 'Conexao com Autentique estabelecida com sucesso!',
      account: userData
    });
  } catch (error) {
    console.error('Erro ao testar Autentique:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      error: error.response?.data?.errors?.[0]?.message || error.message || 'Erro ao conectar com Autentique'
    });
  }
});

router.get('/indicacoes-agent-dashboard', authMiddleware, async (req, res) => {
  try {
    const agentId = req.user.id;

    const agentResult = await query('SELECT erp_agent_id FROM agents WHERE id = $1', [agentId]);
    if (!agentResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Agente não encontrado.' });
    }

    const erpAgentId = agentResult.rows[0].erp_agent_id;
    if (!erpAgentId) {
      return res.json({
        success: true,
        totais: { vendas: 0, valor_total: 0, ticket_medio: 0 },
        series: { vendas_por_dia: [], valor_por_dia: [] },
        ultimas_vendas: [],
        erp_agent_id_missing: true
      });
    }

    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_VENDAS_INDICACAO_AGENTES';

    console.log(`[Indicações Meu Painel] Fetching ERP data for erp_agent_id=${erpAgentId}...`);
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const allRecords = Array.isArray(erpData) ? erpData : [];
    console.log(`[Indicações Meu Painel] ERP returned ${allRecords.length} total records`);

    const agentRecords = allRecords.filter(r => {
      const recordErpId = r.id_agente != null ? Number(r.id_agente) : null;
      return recordErpId === Number(erpAgentId);
    });
    console.log(`[Indicações Meu Painel] ${agentRecords.length} records match erp_agent_id=${erpAgentId}`);

    const vendasEfetivadas = agentRecords.filter(r => {
      const vp = (r.valores_pagos || '').toString().trim().toUpperCase();
      return vp === 'SIM';
    });
    console.log(`[Indicações Meu Painel] ${vendasEfetivadas.length} records with valores_pagos=SIM`);

    let valorTotal = 0;
    const vendasPorDia = {};
    const valorPorDia = {};

    for (const venda of vendasEfetivadas) {
      const valor = parseBRCurrency(venda.valor_contrato);
      valorTotal += valor;

      let diaKey = 'sem_data';
      if (venda.data_contrato) {
        const parsedDate = new Date(venda.data_contrato);
        if (!isNaN(parsedDate.getTime())) {
          diaKey = parsedDate.toISOString().split('T')[0];
        }
      }

      if (diaKey !== 'sem_data') {
        vendasPorDia[diaKey] = (vendasPorDia[diaKey] || 0) + 1;
        valorPorDia[diaKey] = (valorPorDia[diaKey] || 0) + valor;
      }
    }

    const totalVendas = vendasEfetivadas.length;
    const ticketMedio = totalVendas > 0 ? Number((valorTotal / totalVendas).toFixed(2)) : 0;

    const sortedDays = Object.keys(vendasPorDia).sort();

    const ultimasVendas = vendasEfetivadas
      .filter(v => v.data_contrato && !isNaN(new Date(v.data_contrato).getTime()))
      .sort((a, b) => new Date(b.data_contrato) - new Date(a.data_contrato))
      .slice(0, 50)
      .map(v => ({
        nome_indicado: v.nome_indicado || '',
        data_contrato: v.data_contrato || '',
        valor_contrato: parseBRCurrency(v.valor_contrato),
        canal: v.canal || '',
        situacao_contrato: v.situacao_contrato || '',
        contrato_servicos: v.contrato_servicos || ''
      }));

    res.json({
      success: true,
      totais: {
        vendas: totalVendas,
        valor_total: Number(valorTotal.toFixed(2)),
        ticket_medio: ticketMedio
      },
      series: {
        vendas_por_dia: sortedDays.map(dia => ({ dia, vendas: vendasPorDia[dia] || 0 })),
        valor_por_dia: sortedDays.map(dia => ({ dia, valor: valorPorDia[dia] || 0 }))
      },
      ultimas_vendas: ultimasVendas
    });
  } catch (error) {
    console.error('[Indicações Meu Painel] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/referral-paid-sales', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      return res.status(500).json({ success: false, error: 'ERP_AUTH_TOKEN não configurado.' });
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES';

    console.log('[Comissões] Fetching ERP sales data from API_DADOS_VENDAS_INDICACOES...');
    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) {
      return res.status(502).json({ success: false, error: `ERP retornou status ${erpResponse.status}` });
    }

    const erpData = await erpResponse.json();
    const allSales = Array.isArray(erpData) ? erpData : [];
    console.log(`[Comissões] ERP returned ${allSales.length} total records`);

    const paidSales = allSales.filter(r => {
      const vp = (r.valores_pagos || '').toString().trim().toUpperCase();
      return vp === 'SIM';
    });
    console.log(`[Comissões] ${paidSales.length} records with valores_pagos=SIM`);

    const existingResult = await query('SELECT sale_identifier FROM processed_referral_sales');
    const existingIdentifiers = new Set(existingResult.rows.map(r => r.sale_identifier));
    console.log(`[Comissões] ${existingIdentifiers.size} previously processed sales in DB`);

    const seenIdentifiers = new Set();
    const paidByCpfIndicado = {};
    let duplicatesSkipped = 0;
    const newSalesToPersist = [];

    for (const sale of paidSales) {
      const contratoId = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
      const cpfIndicado = sale.cpf_indicado ? String(sale.cpf_indicado).replace(/\D/g, '') : '';
      const cpfIndicador = sale.cpf_indicador ? String(sale.cpf_indicador).replace(/\D/g, '') : '';
      const valorContrato = sale.valor_contrato ? String(sale.valor_contrato).trim() : '';
      const dataContrato = sale.data_contrato ? String(sale.data_contrato).trim() : '';

      let saleIdentifier = '';
      if (contratoId) {
        saleIdentifier = `contrato:${contratoId}`;
      } else {
        const compositeKey = [cpfIndicado || cpfIndicador, valorContrato, dataContrato].filter(Boolean).join('|');
        saleIdentifier = `composite:${compositeKey}`;
      }

      if (!saleIdentifier || saleIdentifier === 'contrato:' || saleIdentifier === 'composite:') {
        continue;
      }

      if (seenIdentifiers.has(saleIdentifier)) {
        duplicatesSkipped++;
        continue;
      }
      seenIdentifiers.add(saleIdentifier);

      if (!existingIdentifiers.has(saleIdentifier)) {
        newSalesToPersist.push({
          saleIdentifier,
          cpf: cpfIndicador,
          phone: sale.cel_indicador ? String(sale.cel_indicador).replace(/\D/g, '') : '',
          name: sale.nome_indicador || '',
          contratoId,
          valorContrato,
          dataContrato
        });
      }

      if (cpfIndicado && cpfIndicado.length >= 11) {
        if (!paidByCpfIndicado[cpfIndicado]) {
          paidByCpfIndicado[cpfIndicado] = [];
        }
        paidByCpfIndicado[cpfIndicado].push({
          contrato_servicos: contratoId,
          valor_contrato: valorContrato,
          data_contrato: dataContrato
        });
      }
    }

    if (newSalesToPersist.length > 0) {
      console.log(`[Comissões] Persisting ${newSalesToPersist.length} new sales to processed_referral_sales`);
      for (const s of newSalesToPersist) {
        try {
          await query(
            `INSERT INTO processed_referral_sales (sale_identifier, indicator_cpf, indicator_phone, indicator_name, contrato_servicos, valor_contrato, data_contrato)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (sale_identifier) DO NOTHING`,
            [s.saleIdentifier, s.cpf || null, s.phone || null, s.name || null, s.contratoId || null, s.valorContrato || null, s.dataContrato || null]
          );
        } catch (persistErr) {
          console.error(`[Comissões] Error persisting sale ${s.saleIdentifier}:`, persistErr.message);
        }
      }
    }

    const usedContractsResult = await query('SELECT contrato_servicos, referral_id, cpf_indicado FROM processed_referral_contracts');
    const usedContracts = {};
    for (const row of usedContractsResult.rows) {
      usedContracts[row.contrato_servicos] = {
        referralId: row.referral_id,
        cpfIndicado: row.cpf_indicado
      };
    }

    const uniquePaidCount = seenIdentifiers.size;
    const paidCpfIndicadoCount = Object.keys(paidByCpfIndicado).length;
    console.log(`[Comissões] ${uniquePaidCount} unique sales (${duplicatesSkipped} duplicates skipped), ${paidCpfIndicadoCount} unique CPFs indicados with paid sales, ${Object.keys(usedContracts).length} contracts already used`);

    res.json({
      success: true,
      totalPaidSales: uniquePaidCount,
      duplicatesSkipped,
      paidByCpfIndicado,
      usedContracts
    });
  } catch (error) {
    console.error('[Comissões] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/referral-use-contract', authMiddleware, async (req, res) => {
  try {
    const contratoServicos = req.body.contratoServicos || req.body.contrato_servicos;
    const referralId = req.body.referralId || req.body.referral_id;
    const cpfIndicado = req.body.cpfIndicado || req.body.cpf_indicado;

    if (!contratoServicos || !referralId) {
      return res.status(400).json({ success: false, error: 'contratoServicos and referralId are required' });
    }

    const result = await query(
      `INSERT INTO processed_referral_contracts (contrato_servicos, referral_id, cpf_indicado)
       VALUES ($1, $2, $3)
       ON CONFLICT (contrato_servicos) DO NOTHING
       RETURNING *`,
      [String(contratoServicos).trim(), referralId, cpfIndicado || null]
    );

    if (result.rows.length === 0) {
      return res.json({ success: false, alreadyUsed: true, message: 'Contract already used for another commission' });
    }

    console.log(`[Comissões] Contract ${contratoServicos} recorded for referral ${referralId}`);
    res.json({ success: true, contract: result.rows[0] });
  } catch (error) {
    console.error('[Comissões] Error recording contract:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

function getWeeklyCycleDates(referenceDate = new Date()) {
  const d = new Date(referenceDate);
  const dayOfWeek = d.getDay();

  const daysSinceTuesday = (dayOfWeek + 5) % 7;

  const cycleEnd = new Date(d);
  cycleEnd.setDate(d.getDate() - daysSinceTuesday);
  cycleEnd.setHours(23, 59, 59, 999);

  const cycleStart = new Date(cycleEnd);
  cycleStart.setDate(cycleEnd.getDate() - 6);
  cycleStart.setHours(0, 0, 0, 0);

  console.log('[Commission Cycle] start:', cycleStart, 'end:', cycleEnd);

  return {
    start: cycleStart,
    end: cycleEnd,
    label: `${cycleStart.toISOString().split('T')[0]} a ${cycleEnd.toISOString().split('T')[0]}`
  };
}

async function runWeeklyCommissionBatch() {
  console.log('[Commission Batch] Starting weekly batch generation...');

  try {
    const erpAuthToken = process.env.ERP_AUTH_TOKEN;
    if (!erpAuthToken) {
      console.error('[Commission Batch] ERP_AUTH_TOKEN not configured');
      return { success: false, error: 'ERP_AUTH_TOKEN not configured' };
    }

    const authHeader = erpAuthToken.startsWith('Bearer ') ? erpAuthToken : `Bearer ${erpAuthToken}`;
    const erpUrl = 'http://erp.wescctech.com.br:8080/BOMPASTOR/api/API_DADOS_VENDAS_INDICACOES';

    const erpResponse = await fetch(erpUrl, {
      method: 'GET',
      headers: { 'Authorization': authHeader, 'Accept': 'application/json' }
    });

    if (!erpResponse.ok) throw new Error(`ERP API error: ${erpResponse.status}`);
    const erpData = await erpResponse.json();
    const allSales = Array.isArray(erpData) ? erpData : [];

    const paidSales = allSales.filter(r => {
      const vp = (r.valores_pagos || '').toString().trim().toUpperCase();
      return vp === 'SIM';
    });

    console.log(`[Commission Batch] ERP returned ${allSales.length} records, ${paidSales.length} paid`);

    const existingResult = await query('SELECT contrato_servicos FROM commission_payment_control');
    const existingContracts = new Set(existingResult.rows.map(r => r.contrato_servicos));

    const cycle = getWeeklyCycleDates();
    let newCount = 0;

    const newEligible = [];
    for (const sale of paidSales) {
      const contratoId = sale.contrato_servicos ? String(sale.contrato_servicos).trim() : '';
      if (!contratoId || existingContracts.has(contratoId)) continue;

      newEligible.push(sale);
      existingContracts.add(contratoId);

      await query(
        `INSERT INTO commission_payment_control 
         (cpf_indicador, nome_indicador, cel_indicador, cpf_indicado, nome_indicado, data_contrato, valor_contrato, contrato_servicos, status_pagamento, periodo_pagamento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'elegivel', $9)
         ON CONFLICT (contrato_servicos) DO NOTHING`,
        [
          sale.cpf_indicador || null,
          sale.nome_indicador || null,
          sale.cel_indicador || null,
          sale.cpf_indicado || null,
          sale.nome_indicado || null,
          sale.data_contrato || null,
          sale.valor_contrato || null,
          contratoId,
          cycle.label
        ]
      );
      newCount++;
    }

    console.log(`[Commission Batch] Registered ${newCount} new eligible commissions`);

    const elegiveisResult = await query(
      "SELECT * FROM commission_payment_control WHERE status_pagamento = 'elegivel' AND lote_pagamento_id IS NULL"
    );
    const elegiveis = elegiveisResult.rows;

    if (elegiveis.length === 0) {
      console.log('[Commission Batch] No eligible commissions to batch');
      return { success: true, newCommissions: newCount, batchId: null, message: 'No eligible commissions for batch' };
    }

    const indicatorMap = {};
    for (const e of elegiveis) {
      const key = e.cpf_indicador || e.nome_indicador || 'unknown';
      if (!indicatorMap[key]) {
        indicatorMap[key] = {
          nome: e.nome_indicador,
          cpf: e.cpf_indicador,
          cel: e.cel_indicador,
          count: 0,
          total: 0
        };
      }
      indicatorMap[key].count += 1;
    }

    for (const ind of Object.values(indicatorMap)) {
      ind.total = getCommissionByTier(ind.count);
    }

    const totalIndicadores = Object.keys(indicatorMap).length;
    const valorTotal = Object.values(indicatorMap).reduce((s, i) => s + i.total, 0);

    const batchResult = await query(
      `INSERT INTO commission_payment_batches (periodo_inicio, periodo_fim, total_indicadores, valor_total, status)
       VALUES ($1, $2, $3, $4, 'aberto') RETURNING id`,
      [cycle.start, cycle.end, totalIndicadores, valorTotal]
    );
    const batchId = batchResult.rows[0].id;

    const ids = elegiveis.map(e => e.id);
    await query(
      `UPDATE commission_payment_control SET lote_pagamento_id = $1 WHERE id = ANY($2)`,
      [batchId, ids]
    );

    const existingSnapshot = await query(
      'SELECT id FROM commission_weekly_snapshot WHERE cycle_start = $1 AND cycle_end = $2 LIMIT 1',
      [cycle.start, cycle.end]
    );

    if (existingSnapshot.rows.length === 0) {
      for (const ind of Object.values(indicatorMap)) {
        const nivel = ind.count >= 13 ? 3 : ind.count >= 4 ? 2 : ind.count >= 1 ? 1 : 0;
        await query(
          `INSERT INTO commission_weekly_snapshot 
           (cycle_start, cycle_end, batch_id, cpf_indicador, nome_indicador, cel_indicador, total_conversoes, nivel_comissao, valor_comissao)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [cycle.start, cycle.end, batchId, ind.cpf, ind.nome, ind.cel, ind.count, nivel, ind.total]
        );
      }
      console.log(`[Commission Batch] Snapshot saved: ${totalIndicadores} indicators for cycle ${cycle.label}`);
    } else {
      console.log(`[Commission Batch] Snapshot already exists for cycle ${cycle.label}, skipping`);
    }

    console.log(`[Commission Batch] Batch #${batchId} created: ${totalIndicadores} indicators, R$ ${valorTotal.toFixed(2)}`);

    return {
      success: true,
      newCommissions: newCount,
      batchId,
      totalIndicadores,
      valorTotal,
      cycle: cycle.label,
      indicators: Object.values(indicatorMap)
    };
  } catch (error) {
    console.error('[Commission Batch] Error:', error.message);
    return { success: false, error: error.message };
  }
}

router.post('/commission-payment/run-batch', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await runWeeklyCommissionBatch();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-payment/batches', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM commission_payment_batches ORDER BY created_at DESC LIMIT 50');
    const batches = result.rows;

    for (const batch of batches) {
      const snapshotResult = await query(
        'SELECT * FROM commission_weekly_snapshot WHERE batch_id = $1',
        [batch.id]
      );

      if (snapshotResult.rows.length > 0) {
        let totalComissao = 0;
        for (const s of snapshotResult.rows) {
          totalComissao += parseFloat(s.valor_comissao);
        }
        batch.valor_total = totalComissao;
        batch.total_indicadores = snapshotResult.rows.length;
      } else {
        const controlResult = await query(
          'SELECT cpf_indicador, nome_indicador FROM commission_payment_control WHERE lote_pagamento_id = $1',
          [batch.id]
        );
        const indicatorMap = {};
        for (const r of controlResult.rows) {
          const key = r.cpf_indicador || r.nome_indicador || 'unknown';
          indicatorMap[key] = (indicatorMap[key] || 0) + 1;
        }
        let totalComissao = 0;
        for (const count of Object.values(indicatorMap)) {
          totalComissao += getCommissionByTier(count);
        }
        batch.valor_total = totalComissao;
        batch.total_indicadores = Object.keys(indicatorMap).length;
      }
    }

    res.json({ success: true, batches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-payment/control', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { status, lote_id, limit: lim } = req.query;
    let sql = 'SELECT * FROM commission_payment_control WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND status_pagamento = $${params.length}`;
    }
    if (lote_id) {
      params.push(parseInt(lote_id));
      sql += ` AND lote_pagamento_id = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT ${parseInt(lim) || 500}`;

    const result = await query(sql, params);
    res.json({ success: true, records: result.rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/commission-payment/summary', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const statusResult = await query(`
      SELECT status_pagamento, COUNT(*) as total
      FROM commission_payment_control GROUP BY status_pagamento
    `);

    const batchResult = await query(`
      SELECT COUNT(*) as total_batches, 
             COUNT(*) FILTER (WHERE status = 'aberto') as abertos,
             COUNT(*) FILTER (WHERE status = 'pago') as pagos
      FROM commission_payment_batches
    `);

    res.json({
      success: true,
      byStatus: statusResult.rows,
      batches: batchResult.rows[0] || {}
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/commission-payment/confirm/:id', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';

    const result = await query(
      `UPDATE commission_payment_control 
       SET status_pagamento = 'pago', data_confirmacao_pagamento = NOW(), usuario_confirmacao = $1
       WHERE id = $2 AND status_pagamento = 'elegivel' RETURNING *`,
      [userEmail, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found or already paid' });
    }

    res.json({ success: true, record: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/commission-payment/confirm-batch/:batchId', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { batchId } = req.params;
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';

    const updateResult = await query(
      `UPDATE commission_payment_control 
       SET status_pagamento = 'pago', data_confirmacao_pagamento = NOW(), usuario_confirmacao = $1
       WHERE lote_pagamento_id = $2 AND status_pagamento = 'elegivel'`,
      [userEmail, parseInt(batchId)]
    );

    await query(
      `UPDATE commission_payment_batches SET status = 'pago' WHERE id = $1`,
      [parseInt(batchId)]
    );

    res.json({ success: true, updatedCount: updateResult.rowCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function getEmailSettings() {
  const result = await query('SELECT * FROM email_commission_settings ORDER BY id DESC LIMIT 1');
  return result.rows[0] || null;
}

async function getCommissionReportData() {
  const cycle = getWeeklyCycleDates();

  const snapshotResult = await query(
    'SELECT * FROM commission_weekly_snapshot WHERE cycle_start = $1 AND cycle_end = $2 ORDER BY nome_indicador',
    [cycle.start, cycle.end]
  );

  const batchResult = await query(
    `SELECT id FROM commission_payment_batches WHERE periodo_inicio = $1 AND periodo_fim = $2 ORDER BY id DESC LIMIT 1`,
    [cycle.start, cycle.end]
  );
  const currentBatchId = batchResult.rows[0]?.id;

  let controlResult;
  if (currentBatchId) {
    controlResult = await query(
      "SELECT * FROM commission_payment_control WHERE lote_pagamento_id = $1 ORDER BY nome_indicador, created_at",
      [currentBatchId]
    );
  } else {
    controlResult = await query(
      "SELECT * FROM commission_payment_control WHERE status_pagamento = 'elegivel' AND lote_pagamento_id IS NULL ORDER BY nome_indicador, created_at"
    );
  }
  const records = controlResult.rows;

  let indicatorMap = {};

  if (snapshotResult.rows.length > 0) {
    console.log(`[Commission Report] Using snapshot data (${snapshotResult.rows.length} indicators)`);
    for (const s of snapshotResult.rows) {
      const key = s.cpf_indicador || s.nome_indicador || 'unknown';
      indicatorMap[key] = {
        nome: s.nome_indicador || '-',
        cpf: s.cpf_indicador || '-',
        cel: s.cel_indicador || '-',
        count: parseInt(s.total_conversoes),
        total: parseFloat(s.valor_comissao),
        details: records.filter(r => (r.cpf_indicador || r.nome_indicador || 'unknown') === key)
      };
    }
  } else {
    console.log(`[Commission Report] No snapshot, calculating dynamically (${records.length} records)`);
    for (const r of records) {
      const key = r.cpf_indicador || r.nome_indicador || 'unknown';
      if (!indicatorMap[key]) {
        indicatorMap[key] = {
          nome: r.nome_indicador || '-',
          cpf: r.cpf_indicador || '-',
          cel: r.cel_indicador || '-',
          count: 0,
          total: 0,
          details: []
        };
      }
      indicatorMap[key].count += 1;
      indicatorMap[key].details.push(r);
    }
    for (const ind of Object.values(indicatorMap)) {
      ind.total = getCommissionByTier(ind.count);
    }
  }

  const allCpfsRaw = [...new Set(Object.values(indicatorMap).map(i => i.cpf).filter(c => c && c !== '-'))];
  const allCpfsNormalized = [...new Set(allCpfsRaw.map(c => String(c).replace(/\D/g, '')).filter(Boolean))];
  let pixMap = {};
  if (allCpfsNormalized.length > 0) {
    const pixResult = await query(
      `SELECT cpf_indicador, chave_pix FROM indicadores_pix WHERE cpf_indicador = ANY($1)`,
      [allCpfsNormalized]
    );
    for (const row of pixResult.rows) {
      pixMap[row.cpf_indicador] = row.chave_pix;
    }
  }
  for (const ind of Object.values(indicatorMap)) {
    const cpfClean = ind.cpf ? String(ind.cpf).replace(/\D/g, '') : '';
    ind.pix = pixMap[cpfClean] || null;
  }

  const totalIndicadores = Object.keys(indicatorMap).length;
  const totalIndicacoes = records.length;
  const valorTotal = Object.values(indicatorMap).reduce((s, i) => s + i.total, 0);

  const currentRecordIds = new Set(records.map(r => r.id));

  const pendingResult = await query(
    "SELECT cpc.*, cpb.periodo_inicio, cpb.periodo_fim FROM commission_payment_control cpc LEFT JOIN commission_payment_batches cpb ON cpc.lote_pagamento_id = cpb.id WHERE cpc.status_pagamento != 'pago' ORDER BY cpb.periodo_inicio, cpc.nome_indicador, cpc.created_at"
  );

  const batchGroups = {};
  for (const r of pendingResult.rows) {
    if (currentBatchId && r.lote_pagamento_id === currentBatchId) continue;
    if (!currentBatchId && currentRecordIds.has(r.id)) continue;

    const batchKey = r.lote_pagamento_id || 'unbatched';
    const indicatorKey = r.cpf_indicador || r.nome_indicador || 'unknown';
    const groupKey = `${batchKey}::${indicatorKey}`;

    if (!batchGroups[groupKey]) {
      batchGroups[groupKey] = {
        nome: r.nome_indicador || '-',
        cpf: r.cpf_indicador || '-',
        cel: r.cel_indicador || '-',
        periodo: r.periodo_inicio && r.periodo_fim
          ? `${formatDateBR(r.periodo_inicio)} → ${formatDateBR(r.periodo_fim)}`
          : '-',
        batchId: r.lote_pagamento_id,
        count: 0
      };
    }
    batchGroups[groupKey].count += 1;
  }

  const pendingCpfsNormalized = [...new Set(
    Object.values(batchGroups).map(g => g.cpf).filter(c => c && c !== '-').map(c => String(c).replace(/\D/g, '')).filter(Boolean)
  )];
  const missingCpfs = pendingCpfsNormalized.filter(c => !pixMap[c]);
  if (missingCpfs.length > 0) {
    const extraPixResult = await query(
      `SELECT cpf_indicador, chave_pix FROM indicadores_pix WHERE cpf_indicador = ANY($1)`,
      [missingCpfs]
    );
    for (const row of extraPixResult.rows) {
      pixMap[row.cpf_indicador] = row.chave_pix;
    }
  }

  const pendingList = [];
  let pendingTotal = 0;
  for (const entry of Object.values(batchGroups)) {
    const cpfClean = entry.cpf ? String(entry.cpf).replace(/\D/g, '') : '';
    entry.pix = pixMap[cpfClean] || pixMap[entry.cpf] || null;
    entry.total = getCommissionByTier(entry.count);
    pendingTotal += entry.total;
    pendingList.push(entry);
  }
  const hasPending = pendingList.length > 0;

  console.log(`[Commission Report] Cycle: ${cycle.label} | Current: ${totalIndicadores} indicators | Pending entries: ${pendingList.length}`);

  return {
    cycle,
    indicators: indicatorMap,
    totalIndicadores,
    totalIndicacoes,
    valorTotal,
    records,
    pending: pendingList,
    pendingTotal,
    hasPending,
    cycleEmpty: totalIndicadores === 0
  };
}

function getCommissionByTier(totalConversions) {
  if (totalConversions >= 13) return 200;
  if (totalConversions >= 4) return 150;
  if (totalConversions >= 1) return 100;
  return 0;
}

function formatPhoneNumber(phone) {
  if (!phone) return '-';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function formatCPF(cpf) {
  if (!cpf) return '-';
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return cpf;
}

function formatDateBR(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
  } catch { return String(d); }
}

function formatDateTimeBR(d) {
  if (!d) return '-';
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
  } catch { return String(d); }
}

function formatCurrency(value) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function escapeHtml(str) {
  if (!str) return str;
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildCommissionEmailHtml(data) {
  const { cycle, indicators, totalIndicadores, totalIndicacoes, valorTotal, records, pending, pendingTotal, hasPending, cycleEmpty } = data;
  const periodoInicio = formatDateBR(cycle.start);
  const periodoFim = formatDateBR(cycle.end);
  const geradoEm = formatDateTimeBR(new Date());

  const thStyle = 'padding: 10px 12px; border: 1px solid #cbd5e1; text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;';
  const tdStyle = 'padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 13px;';
  const tdRight = 'padding: 8px 12px; border: 1px solid #e2e8f0; font-size: 13px; text-align: right; font-weight: 500;';

  let html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 0; background: #f1f5f9; font-family: 'Segoe UI', Arial, sans-serif;">
<div style="max-width: 800px; margin: 0 auto; background: #ffffff;">

  <!-- Header -->
  <div style="background: #1e293b; padding: 30px 40px; text-align: center;">
    <div style="font-size: 14px; color: #94a3b8; letter-spacing: 3px; text-transform: uppercase; margin-bottom: 8px;">SalesTwo</div>
    <h1 style="margin: 0; font-size: 22px; color: #ffffff; font-weight: 700;">RELATÓRIO SEMANAL DE COMISSÕES DE INDICAÇÃO</h1>
    <div style="font-size: 13px; color: #64748b; margin-top: 6px;">SalesTwo CRM</div>
    <div style="height: 3px; background: linear-gradient(90deg, #f59e0b, #d97706); margin-top: 16px; border-radius: 2px;"></div>
  </div>

  <!-- Report Info -->
  <div style="padding: 24px 40px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
    <table style="width: 100%; font-size: 13px; color: #475569;">
      <tr>
        <td style="padding: 4px 0;"><strong>Período:</strong> ${periodoInicio} → ${periodoFim}</td>
        <td style="padding: 4px 0; text-align: right;"><strong>Gerado em:</strong> ${geradoEm}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0;" colspan="2"><strong>Sistema:</strong> SalesTwo CRM</td>
      </tr>
    </table>
  </div>`;

  if (cycleEmpty) {
    html += `
  <!-- Cycle Empty Notice -->
  <div style="padding: 40px; text-align: center;">
    <div style="background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 40px 24px;">
      <div style="font-size: 40px; margin-bottom: 12px;">📋</div>
      <div style="font-size: 16px; font-weight: 700; color: #1e293b; margin-bottom: 8px;">Nenhuma comissão foi gerada para este ciclo</div>
      <div style="font-size: 13px; color: #64748b;">Período: ${periodoInicio} → ${periodoFim}</div>
    </div>
  </div>`;
  } else {
    html += `
  <!-- Summary Cards -->
  <div style="padding: 24px 40px;">
    <table style="width: 100%; border-collapse: separate; border-spacing: 12px 0;">
      <tr>
        <td style="background: #fef3c7; padding: 20px; border-radius: 8px; text-align: center; width: 33%;">
          <div style="font-size: 32px; font-weight: 800; color: #92400e;">${totalIndicadores}</div>
          <div style="font-size: 11px; color: #78350f; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Indicadores a Pagar</div>
        </td>
        <td style="background: #dbeafe; padding: 20px; border-radius: 8px; text-align: center; width: 33%;">
          <div style="font-size: 32px; font-weight: 800; color: #1e40af;">${totalIndicacoes}</div>
          <div style="font-size: 11px; color: #1e3a5f; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Indicações Elegíveis</div>
        </td>
        <td style="background: #065f46; padding: 20px; border-radius: 8px; text-align: center; width: 33%;">
          <div style="font-size: 28px; font-weight: 800; color: #ffffff;">${formatCurrency(valorTotal)}</div>
          <div style="font-size: 11px; color: #a7f3d0; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Total das Comissões</div>
        </td>
      </tr>
    </table>
  </div>

  <!-- Indicator Summary Table -->
  <div style="padding: 0 40px 24px;">
    <h2 style="font-size: 15px; color: #1e293b; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #f59e0b;">Resumo de Pagamentos por Indicador</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f1f5f9;">
          <th style="${thStyle}">Indicador</th>
          <th style="${thStyle}">CPF</th>
          <th style="${thStyle}">PIX</th>
          <th style="${thStyle} text-align: center;">Conversões</th>
          <th style="${thStyle} text-align: center;">Nível</th>
          <th style="${thStyle} text-align: right;">Comissão</th>
        </tr>
      </thead>
      <tbody>`;

    let rowIdx = 0;
    for (const [key, ind] of Object.entries(indicators)) {
      const bg = rowIdx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const nivel = ind.count >= 13 ? '3 (13+)' : ind.count >= 4 ? '2 (4-12)' : ind.count >= 1 ? '1 (1-3)' : '-';
      const pixDisplay = ind.pix ? escapeHtml(ind.pix) : 'PIX não informado';
      html += `
        <tr style="background: ${bg};">
          <td style="${tdStyle} font-weight: 600;">${escapeHtml(ind.nome)}</td>
          <td style="${tdStyle}">${formatCPF(ind.cpf)}</td>
          <td style="${tdStyle}${!ind.pix ? ' color: #94a3b8; font-style: italic;' : ''}">${pixDisplay}</td>
          <td style="${tdStyle} text-align: center;">${ind.count}</td>
          <td style="${tdStyle} text-align: center;">${nivel}</td>
          <td style="${tdRight}">${formatCurrency(ind.total)}</td>
        </tr>`;
      rowIdx++;
    }

    html += `
        <tr style="background: #1e293b;">
          <td colspan="5" style="padding: 12px; border: 1px solid #334155; color: #ffffff; font-weight: 700; font-size: 14px;">TOTAL A PAGAR</td>
          <td style="padding: 12px; border: 1px solid #334155; color: #f59e0b; font-weight: 800; font-size: 16px; text-align: right;">${formatCurrency(valorTotal)}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Audit Detail Table -->
  <div style="padding: 0 40px 24px;">
    <h2 style="font-size: 15px; color: #1e293b; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #3b82f6;">Detalhamento das Indicações (Auditoria)</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #f1f5f9;">
          <th style="${thStyle}">Indicador</th>
          <th style="${thStyle}">CPF Indicado</th>
          <th style="${thStyle}">Nome Indicado</th>
          <th style="${thStyle}">Data Contrato</th>
          <th style="${thStyle} text-align: right;">Valor Contrato</th>
        </tr>
      </thead>
      <tbody>`;

    records.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const val = parseBRCurrency(r.valor_contrato);
      html += `
        <tr style="background: ${bg};">
          <td style="${tdStyle}">${r.nome_indicador || '-'}</td>
          <td style="${tdStyle}">${formatCPF(r.cpf_indicado)}</td>
          <td style="${tdStyle}">${r.nome_indicado || '-'}</td>
          <td style="${tdStyle}">${r.data_contrato || '-'}</td>
          <td style="${tdRight}">${formatCurrency(val)}</td>
        </tr>`;
    });

    html += `
      </tbody>
    </table>
  </div>`;
  }

  if (hasPending) {
    html += `
  <!-- Pending Commissions Section -->
  <div style="padding: 0 40px 24px;">
    <div style="background: #fffbeb; border: 1px solid #f59e0b; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
      <div style="font-size: 14px; font-weight: 700; color: #92400e;">⚠ Existem comissões pendentes de pagamento de ciclos anteriores</div>
    </div>
    <h2 style="font-size: 15px; color: #1e293b; margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #f97316;">Comissões Pendentes de Pagamento</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: #fff7ed;">
          <th style="${thStyle}">Indicador</th>
          <th style="${thStyle}">CPF</th>
          <th style="${thStyle}">Período</th>
          <th style="${thStyle} text-align: center;">Conversões</th>
          <th style="${thStyle} text-align: right;">Comissão</th>
          <th style="${thStyle} text-align: center;">Status</th>
        </tr>
      </thead>
      <tbody>`;

    pending.forEach((pend, pIdx) => {
      const bg = pIdx % 2 === 0 ? '#ffffff' : '#fffbeb';
      html += `
        <tr style="background: ${bg};">
          <td style="${tdStyle} font-weight: 600;">${pend.nome}</td>
          <td style="${tdStyle}">${formatCPF(pend.cpf)}</td>
          <td style="${tdStyle}">${pend.periodo}</td>
          <td style="${tdStyle} text-align: center;">${pend.count}</td>
          <td style="${tdRight}">${formatCurrency(pend.total)}</td>
          <td style="${tdStyle} text-align: center;"><span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Pendente</span></td>
        </tr>`;
    });

    html += `
        <tr style="background: #7c2d12;">
          <td colspan="4" style="padding: 12px; border: 1px solid #9a3412; color: #ffffff; font-weight: 700; font-size: 14px;">TOTAL PENDENTE</td>
          <td style="padding: 12px; border: 1px solid #9a3412; color: #fb923c; font-weight: 800; font-size: 16px; text-align: right;">${formatCurrency(pendingTotal)}</td>
          <td style="padding: 12px; border: 1px solid #9a3412;"></td>
        </tr>
      </tbody>
    </table>
  </div>`;
  }

  html += `
  <!-- Footer -->
  <div style="background: #1e293b; padding: 24px 40px; text-align: center;">
    <div style="font-size: 13px; color: #94a3b8; font-weight: 600;">SalesTwo</div>
    <div style="font-size: 12px; color: #64748b; margin-top: 2px;">SalesTwo CRM</div>
    <div style="height: 1px; background: #334155; margin: 12px 0;"></div>
    <div style="font-size: 11px; color: #64748b;">Relatório gerado automaticamente em ${geradoEm}</div>
    <div style="font-size: 10px; color: #475569; margin-top: 6px; font-style: italic;">Este documento é destinado exclusivamente ao controle financeiro de comissões.</div>
    <div style="font-size: 10px; color: #f59e0b; margin-top: 8px; font-weight: 600;">O pagamento das comissões deve ser realizado via chave PIX informada pelo indicador.</div>
  </div>

</div>
</body></html>`;

  return html;
}

function generateCommissionPDF(data) {
  return new Promise((resolve, reject) => {
    const { cycle, indicators, totalIndicadores, totalIndicacoes, valorTotal, records, pending, pendingTotal, hasPending, cycleEmpty } = data;
    const periodoInicio = formatDateBR(cycle.start);
    const periodoFim = formatDateBR(cycle.end);
    const geradoEm = formatDateTimeBR(new Date());

    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const darkBg = [30, 41, 59];
    const amberAccent = [245, 158, 11];
    const textDark = [30, 41, 59];
    const textLight = [100, 116, 139];
    const orangeAccent = [249, 115, 22];

    doc.rect(0, 0, doc.page.width, 80).fill(darkBg);
    doc.fontSize(10).fill([148, 163, 184]).text('SALESTWO', 40, 20, { align: 'center', characterSpacing: 3 });
    doc.fontSize(16).fill([255, 255, 255]).text('RELATÓRIO SEMANAL DE COMISSÕES DE INDICAÇÃO', 40, 38, { align: 'center' });
    doc.fontSize(9).fill([100, 116, 139]).text('SalesTwo CRM', 40, 60, { align: 'center' });
    doc.rect(40, 78, doc.page.width - 80, 3).fill(amberAccent);

    let y = 95;
    doc.fontSize(9).fill(textLight);
    doc.text(`Período: ${periodoInicio} → ${periodoFim}`, 40, y);
    doc.text(`Gerado em: ${geradoEm}`, 40, y, { align: 'right', width: doc.page.width - 80 });
    y += 14;
    doc.text('Sistema: SalesTwo CRM', 40, y);
    y += 20;

    const cols1 = [
      { label: 'Indicador', w: 150, align: 'left' },
      { label: 'CPF', w: 90, align: 'left' },
      { label: 'PIX', w: 85, align: 'left' },
      { label: 'Conversões', w: 45, align: 'center' },
      { label: 'Nível', w: 50, align: 'center' },
      { label: 'Comissão', w: 75, align: 'right' },
    ];

    const ROW_HEIGHT = 22;
    const HEADER_HEIGHT = 20;

    const drawTableHeader = (columns, startY) => {
      doc.rect(40, startY, doc.page.width - 80, HEADER_HEIGHT).fill([241, 245, 249]);
      let cx = 44;
      doc.fontSize(7).fill(textDark);
      columns.forEach(col => {
        doc.text(col.label.toUpperCase(), cx, startY + 6, { width: col.w, align: col.align });
        cx += col.w;
      });
      return startY + HEADER_HEIGHT;
    };

    const drawTableRow = (columns, values, startY, bg) => {
      if (bg) doc.rect(40, startY, doc.page.width - 80, ROW_HEIGHT).fill(bg);
      let cx = 44;
      doc.fontSize(8).fill(textDark);
      columns.forEach((col, i) => {
        doc.text(values[i] || '-', cx, startY + 4, { width: col.w, align: col.align, height: ROW_HEIGHT - 4, lineBreak: true, ellipsis: true });
        cx += col.w;
      });
      return startY + ROW_HEIGHT;
    };

    if (cycleEmpty) {
      doc.roundedRect(60, y, doc.page.width - 120, 60, 8).lineWidth(1.5).dash(5, { space: 4 }).stroke([203, 213, 225]);
      doc.fontSize(13).fill(textDark).text('Nenhuma comissão foi gerada para este ciclo', 60, y + 16, { width: doc.page.width - 120, align: 'center' });
      doc.fontSize(9).fill(textLight).text(`Período: ${periodoInicio} → ${periodoFim}`, 60, y + 36, { width: doc.page.width - 120, align: 'center' });
      y += 80;
    } else {
      const cardW = (doc.page.width - 80 - 20) / 3;
      const cards = [
        { label: 'Indicadores a Pagar', value: String(totalIndicadores), bg: [254, 243, 199], color: [146, 64, 14] },
        { label: 'Indicações Elegíveis', value: String(totalIndicacoes), bg: [219, 234, 254], color: [30, 64, 175] },
        { label: 'Total das Comissões', value: formatCurrency(valorTotal), bg: [6, 95, 70], color: [255, 255, 255] },
      ];
      cards.forEach((card, i) => {
        const cx = 40 + i * (cardW + 10);
        doc.roundedRect(cx, y, cardW, 50, 6).fill(card.bg);
        doc.fontSize(18).fill(card.color).text(card.value, cx, y + 8, { width: cardW, align: 'center' });
        doc.fontSize(7).text(card.label.toUpperCase(), cx, y + 32, { width: cardW, align: 'center', characterSpacing: 1 });
      });
      y += 65;

      doc.fontSize(12).fill(textDark).text('Resumo de Pagamentos por Indicador', 40, y);
      y += 16;
      doc.rect(40, y, doc.page.width - 80, 2).fill(amberAccent);
      y += 8;

      y = drawTableHeader(cols1, y);

      let rIdx = 0;
      for (const [key, ind] of Object.entries(indicators)) {
        if (y > doc.page.height - 80) { doc.addPage(); y = 40; y = drawTableHeader(cols1, y); }
        const bg = rIdx % 2 === 1 ? [248, 250, 252] : null;
        const nivel = ind.count >= 13 ? '3 (13+)' : ind.count >= 4 ? '2 (4-12)' : ind.count >= 1 ? '1 (1-3)' : '-';
        const pixDisplay = ind.pix || 'PIX não informado';
        y = drawTableRow(cols1, [ind.nome, formatCPF(ind.cpf), pixDisplay, String(ind.count), nivel, formatCurrency(ind.total)], y, bg);
        rIdx++;
      }

      doc.rect(40, y, doc.page.width - 80, 20).fill(darkBg);
      doc.fontSize(9).fill([255, 255, 255]).text('TOTAL A PAGAR', 44, y + 6, { width: 400 });
      doc.fontSize(11).fill(amberAccent).text(formatCurrency(valorTotal), 44, y + 4, { width: doc.page.width - 88, align: 'right' });
      y += 30;

      if (y > doc.page.height - 80) { doc.addPage(); y = 40; }

      doc.fontSize(12).fill(textDark).text('Detalhamento das Indicações (Auditoria)', 40, y);
      y += 16;
      doc.rect(40, y, doc.page.width - 80, 2).fill([59, 130, 246]);
      y += 8;

      const cols2 = [
        { label: 'Indicador', w: 145, align: 'left' },
        { label: 'CPF Indicado', w: 90, align: 'left' },
        { label: 'Nome Indicado', w: 130, align: 'left' },
        { label: 'Data Contrato', w: 65, align: 'left' },
        { label: 'Valor Contrato', w: 65, align: 'right' },
      ];

      y = drawTableHeader(cols2, y);

      records.forEach((r, idx) => {
        if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawTableHeader(cols2, y); }
        const bg = idx % 2 === 1 ? [248, 250, 252] : null;
        const val = parseBRCurrency(r.valor_contrato);
        y = drawTableRow(cols2, [r.nome_indicador || '-', formatCPF(r.cpf_indicado), r.nome_indicado || '-', r.data_contrato || '-', formatCurrency(val)], y, bg);
      });
      y += 15;
    }

    if (hasPending) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 40; }

      doc.roundedRect(40, y, doc.page.width - 80, 24, 4).fill([255, 251, 235]);
      doc.fontSize(9).fill([146, 64, 14]).text('⚠ Existem comissões pendentes de pagamento de ciclos anteriores', 52, y + 7, { width: doc.page.width - 104 });
      y += 34;

      doc.fontSize(12).fill(textDark).text('Comissões Pendentes de Pagamento', 40, y);
      y += 16;
      doc.rect(40, y, doc.page.width - 80, 2).fill(orangeAccent);
      y += 8;

      const colsPending = [
        { label: 'Indicador', w: 145, align: 'left' },
        { label: 'CPF', w: 90, align: 'left' },
        { label: 'Período', w: 95, align: 'left' },
        { label: 'Conversões', w: 45, align: 'center' },
        { label: 'Comissão', w: 70, align: 'right' },
        { label: 'Status', w: 50, align: 'center' },
      ];

      y = drawTableHeader(colsPending, y);

      pending.forEach((pend, pIdx) => {
        if (y > doc.page.height - 60) { doc.addPage(); y = 40; y = drawTableHeader(colsPending, y); }
        const bg = pIdx % 2 === 1 ? [255, 251, 235] : null;
        y = drawTableRow(colsPending, [pend.nome, formatCPF(pend.cpf), pend.periodo, String(pend.count), formatCurrency(pend.total), 'Pendente'], y, bg);
      });

      doc.rect(40, y, doc.page.width - 80, 20).fill([124, 45, 18]);
      doc.fontSize(9).fill([255, 255, 255]).text('TOTAL PENDENTE', 44, y + 6, { width: 400 });
      doc.fontSize(11).fill([251, 146, 60]).text(formatCurrency(pendingTotal), 44, y + 4, { width: doc.page.width - 88, align: 'right' });
      y += 30;
    }

    if (y > doc.page.height - 70) { doc.addPage(); y = 40; }
    doc.rect(40, y, doc.page.width - 80, 58).fill(darkBg);
    doc.fontSize(9).fill([148, 163, 184]).text('SalesTwo CRM', 40, y + 6, { align: 'center', width: doc.page.width - 80 });
    doc.fontSize(8).fill([100, 116, 139]).text(`Relatório gerado automaticamente em ${geradoEm}`, 40, y + 18, { align: 'center', width: doc.page.width - 80 });
    doc.fontSize(7).fill([71, 85, 105]).text('Este documento é destinado exclusivamente ao controle financeiro de comissões.', 40, y + 30, { align: 'center', width: doc.page.width - 80 });
    doc.fontSize(7).fill(amberAccent).text('O pagamento das comissões deve ser realizado via chave PIX informada pelo indicador.', 40, y + 42, { align: 'center', width: doc.page.width - 80 });

    doc.end();
  });
}

async function sendCommissionReport(options = {}) {
  const { tipo_envio = 'automatico', usuario_envio = 'system' } = options;

  const settings = await getEmailSettings();
  if (!settings || !settings.smtp_password) {
    throw new Error('Configurações SMTP não encontradas ou senha não definida. Configure em Indicações → Automações.');
  }

  const reportData = await getCommissionReportData();

  if (reportData.cycleEmpty && !reportData.hasPending && tipo_envio === 'automatico') {
    console.log('[Commission Email] No commissions in current cycle and no pending, skipping automatic send');
    return { success: true, skipped: true, message: 'Sem comissões no ciclo atual e sem pendências anteriores' };
  }

  if (tipo_envio === 'automatico') {
    const existingResult = await query(
      `SELECT id FROM commission_payment_batches WHERE email_enviado = TRUE AND periodo_inicio = $1 AND periodo_fim = $2`,
      [reportData.cycle.start, reportData.cycle.end]
    );
    if (existingResult.rows.length > 0) {
      console.log('[Commission Email] Report already sent for this period, skipping');
      return { success: true, skipped: true, message: 'Relatório já enviado para este período' };
    }
  }

  const startStr = formatDateBR(reportData.cycle.start);
  const endStr = formatDateBR(reportData.cycle.end);
  const subject = `Relatório Semanal de Comissões de Indicação - Período: ${startStr} - ${endStr}`;
  const html = buildCommissionEmailHtml(reportData);

  console.log('[Commission Email] Generating PDF...');
  const pdfBuffer = await generateCommissionPDF(reportData);
  const pdfFilename = `relatorio_comissoes_${reportData.cycle.start.toISOString().split('T')[0]}_${reportData.cycle.end.toISOString().split('T')[0]}.pdf`;
  console.log(`[Commission Email] PDF generated: ${pdfFilename} (${pdfBuffer.length} bytes)`);

  const transporter = nodemailer.createTransport({
    host: settings.smtp_server,
    port: settings.smtp_port,
    secure: true,
    auth: {
      user: settings.smtp_user,
      pass: settings.smtp_password
    },
    tls: { rejectUnauthorized: false }
  });

  const recipients = (settings.email_to || '').split(',').map(e => e.trim()).filter(Boolean);
  if (recipients.length === 0) throw new Error('Nenhum destinatário configurado');

  await transporter.sendMail({
    from: settings.email_from || settings.smtp_user,
    to: recipients.join(', '),
    subject,
    html,
    attachments: [{
      filename: pdfFilename,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });

  console.log(`[Commission Email] Report sent to ${recipients.join(', ')}`);

  const batchResult = await query(
    `SELECT id FROM commission_payment_batches WHERE periodo_inicio = $1 AND periodo_fim = $2 ORDER BY id DESC LIMIT 1`,
    [reportData.cycle.start, reportData.cycle.end]
  );

  if (batchResult.rows.length > 0) {
    await query(
      `UPDATE commission_payment_batches SET email_enviado = TRUE, data_envio_email = NOW(), usuario_envio = $1, tipo_envio = $2 WHERE id = $3`,
      [usuario_envio, tipo_envio, batchResult.rows[0].id]
    );
  }

  return {
    success: true,
    recipients,
    totalIndicadores: reportData.totalIndicadores,
    totalIndicacoes: reportData.totalIndicacoes,
    valorTotal: reportData.valorTotal,
    periodo: reportData.cycle.label
  };
}

export { runWeeklyCommissionBatch, sendCommissionReport };

router.get('/email-commission-settings', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const settings = await getEmailSettings();
    if (settings) {
      settings.smtp_password = settings.smtp_password ? '********' : '';
    }
    res.json({ success: true, settings: settings || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/email-commission-settings', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const { smtp_server, smtp_port, smtp_user, smtp_password, email_from, email_to,
            smtpServer, smtpPort, smtpUser, smtpPassword, emailFrom, emailTo } = req.body;

    const server = smtp_server || smtpServer;
    const port = smtp_port || smtpPort;
    const user = smtp_user || smtpUser;
    const password = smtp_password || smtpPassword;
    const from = email_from || emailFrom;
    const to = email_to || emailTo;

    const existing = await getEmailSettings();

    if (existing) {
      const finalPassword = (password && password !== '********') ? password : existing.smtp_password;
      await query(
        `UPDATE email_commission_settings SET smtp_server = $1, smtp_port = $2, smtp_user = $3, smtp_password = $4, email_from = $5, email_to = $6, updated_at = NOW() WHERE id = $7`,
        [server, parseInt(port), user, finalPassword, from, to, existing.id]
      );
    } else {
      await query(
        `INSERT INTO email_commission_settings (smtp_server, smtp_port, smtp_user, smtp_password, email_from, email_to) VALUES ($1, $2, $3, $4, $5, $6)`,
        [server, parseInt(port), user, password, from, to]
      );
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/commission-report/send', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const userEmail = req.user?.email || req.user?.userEmail || 'admin';
    const result = await sendCommissionReport({ tipo_envio: 'manual', usuario_envio: userEmail });
    res.json(result);
  } catch (error) {
    console.error('[Commission Email] Manual send error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/commission-report/test', authMiddleware, loadAgentMiddleware, requireRole('admin', 'supervisor'), async (req, res) => {
  try {
    const settings = await getEmailSettings();
    if (!settings || !settings.smtp_password) {
      return res.status(400).json({ success: false, error: 'Configurações SMTP não encontradas ou senha não definida.' });
    }

    const transporter = nodemailer.createTransport({
      host: settings.smtp_server,
      port: settings.smtp_port,
      secure: true,
      auth: { user: settings.smtp_user, pass: settings.smtp_password },
      tls: { rejectUnauthorized: false }
    });

    const recipients = (settings.email_to || '').split(',').map(e => e.trim()).filter(Boolean);
    if (recipients.length === 0) return res.status(400).json({ success: false, error: 'Nenhum destinatário configurado' });

    const reportData = await getCommissionReportData();
    const html = buildCommissionEmailHtml(reportData);
    const pdfBuffer = await generateCommissionPDF(reportData);
    const pdfFilename = `relatorio_comissoes_teste.pdf`;

    await transporter.sendMail({
      from: settings.email_from || settings.smtp_user,
      to: recipients.join(', '),
      subject: `[TESTE] Relatório Semanal de Comissões de Indicação`,
      html,
      attachments: [{
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    res.json({ success: true, message: `Email de teste enviado para ${recipients.join(', ')}` });
  } catch (error) {
    console.error('[Commission Email] Test error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/indicadores-pix/:cpf', authMiddleware, async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    if (!cpf) return res.status(400).json({ error: 'CPF obrigatório' });

    const result = await query(
      'SELECT chave_pix FROM indicadores_pix WHERE cpf_indicador = $1',
      [cpf]
    );

    res.json({ chave_pix: result.rows[0]?.chave_pix || null });
  } catch (error) {
    console.error('[PIX] Erro ao buscar PIX:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.put('/indicadores-pix/:cpf', authMiddleware, async (req, res) => {
  try {
    const cpf = req.params.cpf.replace(/\D/g, '');
    const chavePix = (req.body.chave_pix || req.body.chavePix || '').trim().slice(0, 150);

    if (!cpf) return res.status(400).json({ error: 'CPF obrigatório' });
    if (!chavePix) return res.status(400).json({ error: 'Chave PIX obrigatória' });

    const result = await query(
      `INSERT INTO indicadores_pix (cpf_indicador, chave_pix) 
       VALUES ($1, $2) 
       ON CONFLICT (cpf_indicador) 
       DO UPDATE SET chave_pix = $2, updated_at = NOW()
       RETURNING *`,
      [cpf, chavePix]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[PIX] Erro ao salvar PIX:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/portal/indicadores-pix/:cpf', async (req, res) => {
  try {
    const contactId = req.headers['x-portal-contact-id'];
    if (!contactId) return res.status(401).json({ error: 'Autenticação do portal obrigatória' });

    const contact = await query('SELECT document FROM contacts WHERE id = $1', [contactId]);
    if (contact.rows.length === 0) return res.status(401).json({ error: 'Contato não encontrado' });

    const cpf = req.params.cpf.replace(/\D/g, '');
    const contactCpf = (contact.rows[0].document || '').replace(/\D/g, '');
    if (cpf !== contactCpf) return res.status(403).json({ error: 'Acesso negado' });

    const result = await query(
      'SELECT chave_pix FROM indicadores_pix WHERE cpf_indicador = $1',
      [cpf]
    );

    res.json({ chave_pix: result.rows[0]?.chave_pix || null });
  } catch (error) {
    console.error('[PIX Portal] Erro ao buscar PIX:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.put('/portal/indicadores-pix/:cpf', async (req, res) => {
  try {
    const contactId = req.headers['x-portal-contact-id'];
    if (!contactId) return res.status(401).json({ error: 'Autenticação do portal obrigatória' });

    const contact = await query('SELECT document FROM contacts WHERE id = $1', [contactId]);
    if (contact.rows.length === 0) return res.status(401).json({ error: 'Contato não encontrado' });

    const cpf = req.params.cpf.replace(/\D/g, '');
    const contactCpf = (contact.rows[0].document || '').replace(/\D/g, '');
    if (cpf !== contactCpf) return res.status(403).json({ error: 'Acesso negado' });

    const chavePix = (req.body.chave_pix || req.body.chavePix || '').trim().slice(0, 150);
    if (!chavePix) return res.status(400).json({ error: 'Chave PIX obrigatória' });

    const result = await query(
      `INSERT INTO indicadores_pix (cpf_indicador, chave_pix) 
       VALUES ($1, $2) 
       ON CONFLICT (cpf_indicador) 
       DO UPDATE SET chave_pix = $2, updated_at = NOW()
       RETURNING *`,
      [cpf, chavePix]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('[PIX Portal] Erro ao salvar PIX:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/google-calendar/status', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (agentId) {
      const status = await getAgentConnectionStatus(agentId);
      res.json(status);
    } else {
      const status = await getConnectionStatus();
      res.json(status);
    }
  } catch (error) {
    console.error('[Google Calendar] Status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Resolve admin status by querying the agents table directly. This bypasses
// loadAgentMiddleware (which can fail silently if the schema differs) and
// matches the same rule the frontend uses to render the admin UI.
async function requireGCalAdmin(req, res, next) {
  try {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    if (req.user.role === 'admin') return next();
    const lookup = await query(
      'SELECT agent_type, role FROM agents WHERE id = $1 OR email = $2 LIMIT 1',
      [req.user.id, req.user.email]
    );
    const row = lookup.rows[0];
    if (row && (row.agent_type === 'admin' || row.role === 'admin')) return next();
    return res.status(403).json({ message: 'Admin access required' });
  } catch (error) {
    console.error('[Google Calendar] Admin check error:', error.message);
    return res.status(500).json({ message: 'Failed to verify admin access' });
  }
}

// Admin-only: read the OAuth credentials currently configured (Client Secret is masked).
router.get('/google-calendar/admin/config', authMiddleware, requireGCalAdmin, async (req, res) => {
  try {
    const cfg = await getGCalMaskedConfig();
    res.json(cfg);
  } catch (error) {
    console.error('[Google Calendar] Admin get config error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Admin-only: persist OAuth credentials. Empty Client Secret preserves the existing one.
router.put('/google-calendar/admin/config', authMiddleware, requireGCalAdmin, async (req, res) => {
  try {
    const { clientId, clientSecret, redirectUri, clearClientSecret } = req.body || {};
    // Strict equality: accept only literal boolean `true`, so a stray string
    // like 'false' or 0 can't accidentally wipe the stored secret.
    const updated = await saveGCalConfig({
      clientId,
      clientSecret,
      redirectUri,
      clearClientSecret: clearClientSecret === true,
    });
    res.json(updated);
  } catch (error) {
    console.error('[Google Calendar] Admin save config error:', error.message);
    // Most likely cause: GCAL_TOKEN_ENC_KEY missing/invalid (encrypt() throws).
    res.status(500).json({ error: error.message });
  }
});

router.get('/google-calendar/outbox-status', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) {
      return res.json({
        hasPendingItems: false,
        hasFailedItems: false,
        pendingCount: 0,
        failedCount: 0,
        lastFailedError: null,
        lastFailedTimestamp: null,
      });
    }
    const counts = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('pending','processing'))::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM gcal_event_outbox
       WHERE agent_id = $1`,
      [agentId]
    );
    const lastFailed = await query(
      `SELECT last_error, updated_at
         FROM gcal_event_outbox
        WHERE agent_id = $1 AND status = 'failed'
        ORDER BY updated_at DESC
        LIMIT 1`,
      [agentId]
    );
    const pendingCount = counts.rows[0]?.pending_count || 0;
    const failedCount = counts.rows[0]?.failed_count || 0;
    res.json({
      hasPendingItems: pendingCount > 0,
      hasFailedItems: failedCount > 0,
      pendingCount,
      failedCount,
      lastFailedError: lastFailed.rows[0]?.last_error || null,
      lastFailedTimestamp: lastFailed.rows[0]?.updated_at || null,
    });
  } catch (error) {
    console.error('[Google Calendar] Outbox status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Phase 5.1 — list calendars the connected agent can write to.
router.get('/google-calendar/calendars', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) return res.status(400).json({ error: 'Agente não encontrado' });
    const [calendars, currentTargetId] = await Promise.all([
      listWritableCalendars(agentId),
      getTargetCalendarForAgent(agentId),
    ]);
    res.json({ calendars, currentTargetId });
  } catch (error) {
    if (error.code === 'NOT_CONNECTED') {
      return res.status(409).json({ error: 'Conecte o Google Calendar antes de listar calendários.' });
    }
    if (error.code === 'SCOPE_INSUFFICIENT') {
      return res.status(403).json({ error: error.message, scopeOutdated: true });
    }
    console.error('[Google Calendar] List calendars error:', error.message);
    res.status(500).json({ error: 'Não foi possível carregar calendários' });
  }
});

// Phase 5.1 — persist the agent's chosen target calendar.
router.put('/google-calendar/target-calendar', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) return res.status(400).json({ error: 'Agente não encontrado' });
    const { calendarId } = req.body || {};
    if (!calendarId || typeof calendarId !== 'string') {
      return res.status(400).json({ error: 'calendarId é obrigatório' });
    }
    const result = await setTargetCalendar(agentId, calendarId);
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.code === 'NOT_CONNECTED') {
      return res.status(409).json({ error: 'Conecte o Google Calendar antes de escolher o calendário.' });
    }
    if (error.code === 'CALENDAR_NOT_FOUND') {
      return res.status(404).json({ error: 'Calendário não encontrado entre os seus calendários editáveis.' });
    }
    if (error.code === 'SCOPE_INSUFFICIENT') {
      return res.status(403).json({ error: error.message, scopeOutdated: true });
    }
    if (error.code === 'INVALID_PAYLOAD') {
      return res.status(400).json({ error: error.message });
    }
    console.error('[Google Calendar] Set target calendar error:', error.message);
    res.status(500).json({ error: 'Não foi possível salvar o calendário escolhido' });
  }
});

router.get('/google-calendar/auth-url', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) return res.status(400).json({ error: 'Agente não encontrado' });
    const url = await getAuthUrl(agentId);
    res.json({ url });
  } catch (error) {
    console.error('[Google Calendar] Auth URL error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Resolve the public-facing URL the browser uses to reach the app, so the
// OAuth popup can redirect back to /settings on the same origin. Order:
//   1. PUBLIC_URL / FRONTEND_URL env vars (explicit override)
//   2. REPLIT_DEV_DOMAIN (Replit preview)
//   3. Request's own origin (works for any reverse-proxied prod deploy
//      where the Host + X-Forwarded-Proto headers are set)
//   4. localhost:5173 (last-resort dev fallback)
function resolveFrontendUrl(req) {
  const explicit = process.env.PUBLIC_URL || process.env.FRONTEND_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const host = req.get('host');
  if (host) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'https';
    return `${proto}://${host}`;
  }
  return 'http://localhost:5173';
}

function renderPopupClose({ status, message, frontendUrl }) {
  const safeMessage = String(message || '').replace(/[<>&"']/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const safeStatus = status === 'connected' ? 'connected' : 'error';
  const fallbackUrl = `${frontendUrl}/Settings?gcal=${safeStatus}${
    safeStatus === 'error' && message ? `&reason=${encodeURIComponent(message)}` : ''
  }`;
  const title = safeStatus === 'connected' ? 'Conectado!' : 'Falha na conexão';
  const body = safeStatus === 'connected'
    ? 'Google Agenda conectado com sucesso. Esta janela vai fechar automaticamente.'
    : `Não foi possível conectar: ${safeMessage}`;
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><title>${title}</title>
<style>
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f5f7;color:#222;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center}
  .card{max-width:420px;background:#fff;border-radius:12px;padding:28px;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  h1{margin:0 0 8px;font-size:20px;color:${safeStatus === 'connected' ? '#5A2A3C' : '#b91c1c'}}
  p{margin:0;font-size:14px;line-height:1.5;color:#555}
  a{color:#5A2A3C;text-decoration:underline}
</style></head><body>
<div class="card">
  <h1>${title}</h1>
  <p>${body}</p>
  <p style="margin-top:12px;font-size:12px;color:#999">Se a janela não fechar, <a href="${fallbackUrl}">clique aqui</a>.</p>
</div>
<script>
  (function(){
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ source: 'gcal-oauth', status: ${JSON.stringify(safeStatus)}, message: ${JSON.stringify(safeMessage)} }, '*');
      }
    } catch (e) {}
    setTimeout(function(){
      try { window.close(); } catch (e) {}
      setTimeout(function(){
        if (!window.closed) { window.location.href = ${JSON.stringify(fallbackUrl)}; }
      }, 600);
    }, 400);
  })();
</script>
</body></html>`;
}

router.get('/google-calendar/callback', async (req, res) => {
  const frontendUrl = resolveFrontendUrl(req);
  try {
    const { code, state, error: oauthError } = req.query;
    if (oauthError) {
      console.error('[Google Calendar] OAuth error:', oauthError);
      return res.status(200).type('html').send(renderPopupClose({ status: 'error', message: oauthError, frontendUrl }));
    }
    if (!code || !state) {
      return res.status(400).type('html').send(renderPopupClose({ status: 'error', message: 'Código de autorização não encontrado.', frontendUrl }));
    }
    const agentId = await validateOAuthState(state);
    if (!agentId) {
      return res.status(403).type('html').send(renderPopupClose({ status: 'error', message: 'Estado OAuth inválido. Tente conectar novamente.', frontendUrl }));
    }
    await handleCallback(code, agentId);

    await syncGoogleToSalesTwo(agentId);

    res.status(200).type('html').send(renderPopupClose({ status: 'connected', message: '', frontendUrl }));
  } catch (error) {
    console.error('[Google Calendar] Callback error:', error.message);
    res.status(200).type('html').send(renderPopupClose({ status: 'error', message: error.message, frontendUrl }));
  }
});

router.get('/google-calendar/events', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) return res.json([]);
    const { timeMin, timeMax } = req.query;
    const events = await fetchGoogleEvents(agentId, timeMin, timeMax);
    res.json(events);
  } catch (error) {
    console.error('[Google Calendar] Events error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/google-calendar/team-events', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    const agentType = req.agent?.agent_type;
    if (!agentId) return res.json([]);
    const { timeMin, timeMax } = req.query;

    let targetAgentIds = [];
    const connectedIds = await getConnectedAgentIds();

    if (agentType === 'admin') {
      targetAgentIds = connectedIds;
    } else if (agentType === 'sales_supervisor' || agentType === 'supervisor') {
      const teamId = req.agent?.team_id;
      if (teamId) {
        const teamResult = await query('SELECT id FROM agents WHERE team_id = $1 AND active = true', [teamId]);
        const teamIds = teamResult.rows.map(r => r.id);
        targetAgentIds = connectedIds.filter(id => teamIds.includes(id));
      }
    } else {
      targetAgentIds = connectedIds.filter(id => id === agentId);
    }

    const events = await fetchGoogleEventsMultiAgent(targetAgentIds, timeMin, timeMax);
    res.json(events);
  } catch (error) {
    console.error('[Google Calendar] Team events error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/google-calendar/sync', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) return res.status(400).json({ error: 'Agente não encontrado' });
    const result = await syncGoogleToSalesTwo(agentId);
    res.json(result);
  } catch (error) {
    console.error('[Google Calendar] Sync error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Phase 3.1 — Admin-only endpoint to revoke a vendor's Google Calendar access.
// Strict authz: only req.user.role==='admin' OR req.agent.agentType==='admin'.
// Uses the same disconnectAgent path as the user's self-disconnect, so the
// Google revokeToken call + local cleanup are consistent.
router.delete('/google-calendar/revoke-access/:agentId', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.agent?.agentType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem revogar o acesso de outros usuários.' });
    }

    const { agentId } = req.params;
    if (!agentId) {
      return res.status(400).json({ error: 'agentId obrigatório.' });
    }

    const exists = await query('SELECT id, name FROM agents WHERE id = $1', [agentId]);
    if (exists.rows.length === 0) {
      return res.status(404).json({ error: 'Agente não encontrado.' });
    }

    const result = await disconnectAgent(agentId);
    res.json({
      success: true,
      agentId,
      agentName: exists.rows[0].name,
      revoked: result.revoked,
      revokeError: result.revokeError,
    });
  } catch (error) {
    console.error('[Google Calendar] Admin revoke error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Returns the list of agent IDs that currently have a Google Calendar
// connection, so the admin UI can decide which agents to show the
// "Revogar acesso" action for. Admin-only.
router.get('/google-calendar/connected-agents', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.agent?.agentType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem listar conexões.' });
    }
    const r = await query(
      `SELECT t.agent_id, t.calendar_email, t.last_sync_at, t.granted_scope, a.name AS agent_name
         FROM google_calendar_tokens t
         JOIN agents a ON a.id = t.agent_id`
    );
    res.json(r.rows.map(row => ({
      agentId: row.agent_id,
      agentName: row.agent_name,
      calendarEmail: row.calendar_email,
      lastSync: row.last_sync_at,
      grantedScope: row.granted_scope,
    })));
  } catch (error) {
    console.error('[Google Calendar] Connected agents error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/google-calendar/disconnect', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const agentId = req.agent?.id;
    if (!agentId) return res.status(400).json({ error: 'Agente não encontrado' });
    await disconnectAgent(agentId);
    res.json({ success: true });
  } catch (error) {
    console.error('[Google Calendar] Disconnect error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Admin-only: returns recent cold-lead monitor run summaries so the Settings
// page can show "the monitor ran X minutes ago, evaluated N leads, sent K
// alerts" and a short history. Mirrors the agentType/role check used by the
// other admin endpoints in this file.
router.get('/lead-temperature/monitor-runs', authMiddleware, loadAgentMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user?.role === 'admin' || req.agent?.agentType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: 'Apenas administradores podem ver o histórico do monitor.' });
    }
    const limit = Number(req.query?.limit) || 10;
    const runs = await listRecentMonitorRuns({ limit });
    res.json({ runs });
  } catch (error) {
    console.error('[Lead Temperature] Histórico error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================================
// Task #64 — Dashboard Comercial (estilo PowerBI)
// Single endpoint that returns every block aggregate in one response.
// =====================================================================
const TABULACAO_FROM_STAGE = {
  fechado_ganho: 'Convertido',
  proposta_enviada: 'Analisando Proposta',
  negociacao: 'Em Negociação',
  qualificacao: 'Em Negociação',
  apresentacao: 'Em Negociação',
  novo: 'Sem Conversão',
  fechado_perdido: 'Sem Conversão',
};
const TABULACAO_ORDER = [
  'Sem Conversão',
  'Em Negociação',
  'Remarcar Call',
  'Analisando Proposta',
  'Repetido',
  'Convertido',
];

function dashboardComercialAuthGate(req, res, next) {
  const role = req.user?.role;
  const type = req.agent?.agentType;
  const allowed =
    role === 'admin' ||
    type === 'admin' ||
    type === 'coordinator' ||
    (typeof type === 'string' && type.includes('supervisor'));
  if (!allowed) {
    return res.status(403).json({ message: 'Acesso restrito ao dashboard comercial' });
  }
  return next();
}

router.get(
  '/sales-pj-dashboard-comercial',
  authMiddleware,
  loadAgentMiddleware,
  dashboardComercialAuthGate,
  async (req, res) => {
    try {
      const mes = req.query.mes ? parseInt(req.query.mes, 10) : null;
      const ano = req.query.ano ? parseInt(req.query.ano, 10) : null;
      const produto = req.query.produto && req.query.produto !== 'all' ? req.query.produto : null;
      const tabulacao = req.query.tabulacao && req.query.tabulacao !== 'all' ? req.query.tabulacao : null;

      // Build common WHERE clause
      const conditions = [];
      const params = [];
      let idx = 1;

      if (mes && mes >= 1 && mes <= 12) {
        conditions.push(`EXTRACT(MONTH FROM l.created_at) = $${idx++}`);
        params.push(mes);
      }
      if (ano && ano >= 2000 && ano <= 2100) {
        conditions.push(`EXTRACT(YEAR FROM l.created_at) = $${idx++}`);
        params.push(ano);
      }
      if (produto) {
        conditions.push(
          `EXISTS (SELECT 1 FROM lead_pj_proposal_items i WHERE i.lead_id = l.id AND i.product_id = $${idx++})`
        );
        params.push(produto);
      }
      if (tabulacao) {
        const stages = Object.entries(TABULACAO_FROM_STAGE)
          .filter(([, label]) => label === tabulacao)
          .map(([stage]) => stage);
        if (stages.length === 0) {
          // tabulacao requested but no stage maps to it (e.g. "Repetido") => empty result set
          conditions.push('1 = 0');
        } else {
          const placeholders = stages.map(() => `$${idx++}`).join(', ');
          conditions.push(`l.stage IN (${placeholders})`);
          params.push(...stages);
        }
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      // 1) total leads + range
      const totalRes = await query(
        `SELECT COUNT(*)::int AS total,
                MIN(l.created_at) AS min_date,
                MAX(l.created_at) AS max_date
         FROM leads_pj l ${where}`,
        params
      );
      const totalLeads = totalRes.rows[0]?.total || 0;
      const totalRange = {
        from: totalRes.rows[0]?.min_date || null,
        to: totalRes.rows[0]?.max_date || null,
      };

      // 2) Tabulação — derived from stage map. Fixed 6 categories in fixed order.
      const stageGroupRes = await query(
        `SELECT COALESCE(l.stage, 'novo') AS stage, COUNT(*)::int AS qty
         FROM leads_pj l ${where}
         GROUP BY l.stage`,
        params
      );
      const tabBuckets = Object.fromEntries(TABULACAO_ORDER.map((k) => [k, 0]));
      for (const row of stageGroupRes.rows) {
        const label = TABULACAO_FROM_STAGE[row.stage] || 'Sem Conversão';
        tabBuckets[label] = (tabBuckets[label] || 0) + row.qty;
      }
      const tabulacaoArr = TABULACAO_ORDER.map((label) => ({
        label,
        value: tabBuckets[label] || 0,
        pct: totalLeads ? +(((tabBuckets[label] || 0) / totalLeads) * 100).toFixed(2) : 0,
      }));

      // 3) Etapa — distribution by stage (raw labels)
      const stageLabelMap = {
        novo: 'Novo',
        qualificacao: 'Qualificação',
        apresentacao: 'Apresentação',
        proposta_enviada: 'Proposta Enviada',
        negociacao: 'Negociação',
        fechado_ganho: 'Fechado Ganho',
        fechado_perdido: 'Perdido',
      };
      const etapaArr = stageGroupRes.rows
        .map((row) => ({
          label: stageLabelMap[row.stage] || row.stage || 'Sem Estágio',
          value: row.qty,
          pct: totalLeads ? +((row.qty / totalLeads) * 100).toFixed(2) : 0,
        }))
        .sort((a, b) => b.value - a.value);

      // 4) Produto — count distinct leads grouped by product.
      // When a specific produto filter is active, narrow the join so the
      // chart shows only that product (not all products attached to the
      // matching leads).
      const produtoJoinFilter = produto
        ? `AND i.product_id = $${idx++}`
        : '';
      const produtoParams = produto ? [...params, produto] : params;
      const produtoRes = await query(
        `SELECT COALESCE(p.name, 'Sem Produto') AS label,
                COUNT(DISTINCT l.id)::int AS qty
         FROM leads_pj l
         LEFT JOIN lead_pj_proposal_items i ON i.lead_id = l.id ${produtoJoinFilter}
         LEFT JOIN products p ON p.id = i.product_id
         ${where}
         GROUP BY p.name
         ORDER BY qty DESC
         LIMIT 20`,
        produtoParams
      );
      const produtoArr = produtoRes.rows.map((row) => ({
        label: row.label,
        value: row.qty,
      }));

      // 5) Origem — % by source
      const origemRes = await query(
        `SELECT COALESCE(NULLIF(TRIM(l.source), ''), 'Não informado') AS label,
                COUNT(*)::int AS qty
         FROM leads_pj l ${where}
         GROUP BY label
         ORDER BY qty DESC
         LIMIT 20`,
        params
      );
      const origemArr = origemRes.rows.map((row) => ({
        label: row.label,
        value: row.qty,
        pct: totalLeads ? +((row.qty / totalLeads) * 100).toFixed(2) : 0,
      }));

      // 6) Lead Empresa — top empresas
      const empresaRes = await query(
        `SELECT COALESCE(
                  NULLIF(TRIM(l.razao_social), ''),
                  NULLIF(TRIM(l.nome_fantasia), ''),
                  'SEM IDENTIFICAÇÃO'
                ) AS label,
                COUNT(*)::int AS qty
         FROM leads_pj l ${where}
         GROUP BY label
         ORDER BY qty DESC
         LIMIT 100`,
        params
      );
      const leadEmpresaArr = empresaRes.rows.map((row) => ({
        label: row.label,
        value: row.qty,
      }));

      // 7) Lead Nome — top contact names
      const nomeRes = await query(
        `SELECT COALESCE(NULLIF(TRIM(l.contact_name), ''), 'SEM IDENTIFICAÇÃO') AS label,
                COUNT(*)::int AS qty
         FROM leads_pj l ${where}
         GROUP BY label
         ORDER BY qty DESC
         LIMIT 100`,
        params
      );
      const leadNomeArr = nomeRes.rows.map((row) => ({
        label: row.label,
        value: row.qty,
      }));

      // 8) Cargo declarado — using contact_role
      const cargoRes = await query(
        `SELECT COALESCE(NULLIF(TRIM(l.contact_role), ''), 'Outro') AS label,
                COUNT(*)::int AS qty
         FROM leads_pj l ${where}
         GROUP BY label
         ORDER BY qty DESC
         LIMIT 50`,
        params
      );
      const cargoArr = cargoRes.rows.map((row) => ({
        label: row.label,
        value: row.qty,
      }));

      // 9) Lead/Mês — 12-month line. Window is anchored to Dec of the
      // selected `ano` when provided, otherwise to the current month.
      // Respects ALL filters (mes/ano/produto/tabulacao) per spec, so a
      // narrow filter (e.g. mes=4) will legitimately show 11 zero months
      // and the bar(s) only for the matching month(s).
      let anchorExpr;
      if (ano && ano >= 2000 && ano <= 2100) {
        anchorExpr = `make_date(${ano}, 12, 1)`;
      } else {
        anchorExpr = `date_trunc('month', NOW())::date`;
      }
      const mesRes = await query(
        `WITH months AS (
           SELECT generate_series(
             ${anchorExpr} - INTERVAL '11 months',
             ${anchorExpr},
             INTERVAL '1 month'
           ) AS month_start
         )
         SELECT to_char(m.month_start, 'YYYY-MM') AS month,
                COUNT(l.id)::int AS qty
         FROM months m
         LEFT JOIN leads_pj l
           ON date_trunc('month', l.created_at) = m.month_start
           ${where ? 'AND ' + conditions.join(' AND ') : ''}
         GROUP BY m.month_start
         ORDER BY m.month_start ASC`,
        params
      );
      const leadPorMesArr = mesRes.rows.map((row) => ({
        month: row.month,
        value: row.qty,
      }));

      // 10) Leads/Dia — daily counts within filter range
      const diaRes = await query(
        `SELECT to_char(date_trunc('day', l.created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS qty
         FROM leads_pj l ${where}
         GROUP BY day
         ORDER BY day ASC`,
        params
      );
      const leadsPorDiaArr = diaRes.rows.map((row) => ({
        day: row.day,
        value: row.qty,
      }));

      // Available products for the filter dropdown
      const productsRes = await query(
        `SELECT id, name FROM products WHERE active = true ORDER BY name ASC`
      );

      res.json({
        totalLeads,
        totalRange,
        tabulacao: tabulacaoArr,
        etapa: etapaArr,
        produto: produtoArr,
        origem: origemArr,
        leadEmpresa: leadEmpresaArr,
        leadNome: leadNomeArr,
        cargoDeclarado: cargoArr,
        leadPorMes: leadPorMesArr,
        leadsPorDia: leadsPorDiaArr,
        availableProducts: productsRes.rows,
        availableTabulacoes: TABULACAO_ORDER,
      });
    } catch (error) {
      console.error('[Dashboard Comercial] erro:', error);
      res.status(500).json({ message: 'Erro ao carregar dashboard', error: error.message });
    }
  }
);


export default router;
