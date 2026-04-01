import { query } from '../config/database.js';
import { getEnvioRegulamentoConfig } from './automationService.js';
import { registrarLogDisparo } from './leadGeneratorLogger.js';

const WHATSAPP_API_URL = 'https://api.wescctech.com.br/core/v2/api/chats/send-template';

export function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 0) return '';
  if (!cleaned.startsWith('55') && (cleaned.length === 10 || cleaned.length === 11)) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

async function getRateConfig() {
  try {
    const result = await query('SELECT key, value FROM gerador_leads_rate_config');
    const config = {};
    for (const row of result.rows) {
      config[row.key] = row.value;
    }
    return {
      limitePorSegundo: config.limite_por_segundo || 2,
      limitePorMinuto: config.limite_por_minuto || 30,
      limitePorUsuarioDia: config.limite_por_usuario_dia || 5000,
      bloqueioRecorrenciaDias: config.bloqueio_recorrencia_dias || 30,
    };
  } catch (err) {
    console.error('[WhatsAppQueue] Error loading rate config, using defaults:', err.message);
    return {
      limitePorSegundo: 2,
      limitePorMinuto: 30,
      limitePorUsuarioDia: 5000,
      bloqueioRecorrenciaDias: 30,
    };
  }
}

export async function enqueueLeads({ leads, userId, userEmail, teamId, templateId, channelToken, templateName, automationName, agentId, agentName, filtersUsed, batchId }) {
  const rateConfig = await getRateConfig();
  const bloqueioRecorrenciaDias = rateConfig.bloqueioRecorrenciaDias;
  const limitePorUsuarioDia = rateConfig.limitePorUsuarioDia;

  let enqueued = 0;
  let blocked30Days = 0;
  let blockedDuplicate = 0;
  let blockedDailyLimit = 0;
  let skipped = 0;

  const dailyCountResult = await query(
    `SELECT COUNT(*)::int as count FROM gerador_leads_whatsapp_logs
     WHERE user_id = $1 AND sent_at::date = CURRENT_DATE AND status_envio NOT IN ('bloqueado_30_dias', 'bloqueado_duplicidade')`,
    [userId]
  );
  let userDailyCount = dailyCountResult.rows[0]?.count || 0;

  for (const lead of leads) {
    const { number, name, lead_id, uf, cidade, produto, situacao_contrato } = lead;

    if (!number) {
      skipped++;
      continue;
    }

    const cleanNumber = normalizePhone(number);

    try {
      const block30Result = await query(
        `SELECT id FROM gerador_leads_whatsapp_logs
         WHERE lead_number = $1
           AND success = true
           AND sent_at >= NOW() - INTERVAL '1 day' * $2
         LIMIT 1`,
        [cleanNumber, bloqueioRecorrenciaDias]
      );

      if (block30Result.rows.length > 0) {
        await query(
          `INSERT INTO gerador_leads_queue
            (batch_id, lead_id, lead_number, lead_name, template_id, channel_token, template_name, automation_name, agent_id, agent_name, lead_uf, lead_cidade, lead_produto, lead_situacao, status_envio, user_id, user_email, team_id, filters_used, motivo_bloqueio)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'bloqueado_30_dias', $15, $16, $17, $18, $19)`,
          [batchId, lead_id || null, cleanNumber, name || null, templateId, channelToken, templateName || null, automationName || null, agentId || null, agentName || null, uf || null, cidade || null, produto || null, situacao_contrato || null, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null, `Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`]
        );

        await query(
          `INSERT INTO gerador_leads_whatsapp_logs
            (lead_number, lead_name, user_id, user_email, template_id, status_envio, motivo_bloqueio, batch_id, team_id, success, http_status)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_30_dias', $6, $7, $8, false, 0)`,
          [cleanNumber, name || null, userId, userEmail, templateId, `Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`, batchId, teamId]
        );

        await registrarLogDisparo({
          batchId,
          leadNumber: cleanNumber,
          leadName: name,
          leadUf: uf,
          leadCidade: cidade,
          leadProduto: produto,
          leadSituacao: situacao_contrato,
          agentId,
          agentName,
          agentEmail: userEmail,
          templateId,
          templateName,
          channelToken,
          automationName,
          tentativaNumero: 1,
          statusEnvio: 'bloqueado',
          motivoBloqueio: `Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`,
          disparadoEm: new Date(),
          processadoEm: new Date(),
          duracaoMs: 0,
        });

        blocked30Days++;
        continue;
      }

      const dupResult = await query(
        `SELECT id FROM gerador_leads_whatsapp_logs
         WHERE lead_number = $1
           AND template_id = $2
           AND sent_at::date = CURRENT_DATE
           AND success = true
         LIMIT 1`,
        [cleanNumber, templateId]
      );

      if (dupResult.rows.length > 0) {
        await query(
          `INSERT INTO gerador_leads_queue
            (batch_id, lead_id, lead_number, lead_name, template_id, channel_token, template_name, automation_name, agent_id, agent_name, lead_uf, lead_cidade, lead_produto, lead_situacao, status_envio, user_id, user_email, team_id, filters_used, motivo_bloqueio)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'bloqueado_duplicidade', $15, $16, $17, $18, 'Envio já realizado hoje para este número')`,
          [batchId, lead_id || null, cleanNumber, name || null, templateId, channelToken, templateName || null, automationName || null, agentId || null, agentName || null, uf || null, cidade || null, produto || null, situacao_contrato || null, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null]
        );

        await query(
          `INSERT INTO gerador_leads_whatsapp_logs
            (lead_number, lead_name, user_id, user_email, template_id, status_envio, motivo_bloqueio, batch_id, team_id, success, http_status)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_duplicidade', 'Envio já realizado hoje para este número', $6, $7, false, 0)`,
          [cleanNumber, name || null, userId, userEmail, templateId, batchId, teamId]
        );

        await registrarLogDisparo({
          batchId,
          leadNumber: cleanNumber,
          leadName: name,
          leadUf: uf,
          leadCidade: cidade,
          leadProduto: produto,
          leadSituacao: situacao_contrato,
          agentId,
          agentName,
          agentEmail: userEmail,
          templateId,
          templateName,
          channelToken,
          automationName,
          tentativaNumero: 1,
          statusEnvio: 'bloqueado',
          motivoBloqueio: 'Envio já realizado hoje para este número',
          disparadoEm: new Date(),
          processadoEm: new Date(),
          duracaoMs: 0,
        });

        blockedDuplicate++;
        continue;
      }

      if (userDailyCount + enqueued >= limitePorUsuarioDia) {
        await query(
          `INSERT INTO gerador_leads_queue
            (batch_id, lead_id, lead_number, lead_name, template_id, channel_token, template_name, automation_name, agent_id, agent_name, lead_uf, lead_cidade, lead_produto, lead_situacao, status_envio, user_id, user_email, team_id, filters_used, motivo_bloqueio)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'bloqueado_limite_diario', $15, $16, $17, $18, $19)`,
          [batchId, lead_id || null, cleanNumber, name || null, templateId, channelToken, templateName || null, automationName || null, agentId || null, agentName || null, uf || null, cidade || null, produto || null, situacao_contrato || null, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null, `Limite diário de ${limitePorUsuarioDia} envios atingido`]
        );

        await query(
          `INSERT INTO gerador_leads_whatsapp_logs
            (lead_number, lead_name, user_id, user_email, template_id, status_envio, motivo_bloqueio, batch_id, team_id, success, http_status)
           VALUES ($1, $2, $3, $4, $5, 'bloqueado_limite_diario', $6, $7, $8, false, 0)`,
          [cleanNumber, name || null, userId, userEmail, templateId, `Limite diário de ${limitePorUsuarioDia} envios atingido`, batchId, teamId]
        );

        await registrarLogDisparo({
          batchId,
          leadNumber: cleanNumber,
          leadName: name,
          leadUf: uf,
          leadCidade: cidade,
          leadProduto: produto,
          leadSituacao: situacao_contrato,
          agentId,
          agentName,
          agentEmail: userEmail,
          templateId,
          templateName,
          channelToken,
          automationName,
          tentativaNumero: 1,
          statusEnvio: 'bloqueado',
          motivoBloqueio: `Limite diário de ${limitePorUsuarioDia} envios atingido`,
          disparadoEm: new Date(),
          processadoEm: new Date(),
          duracaoMs: 0,
        });

        blockedDailyLimit++;
        continue;
      }

      await query(
        `INSERT INTO gerador_leads_queue
          (batch_id, lead_id, lead_number, lead_name, template_id, channel_token, template_name, automation_name, agent_id, agent_name, lead_uf, lead_cidade, lead_produto, lead_situacao, status_envio, user_id, user_email, team_id, filters_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pendente', $15, $16, $17, $18)`,
        [batchId, lead_id || null, cleanNumber, name || null, templateId, channelToken, templateName || null, automationName || null, agentId || null, agentName || null, uf || null, cidade || null, produto || null, situacao_contrato || null, userId, userEmail, teamId, filtersUsed ? JSON.stringify(filtersUsed) : null]
      );

      enqueued++;
    } catch (err) {
      console.error(`[WhatsAppQueue] Error enqueuing lead ${cleanNumber}:`, err.message);
      skipped++;
    }
  }

  return { total: leads.length, enqueued, blocked30Days, blockedDuplicate, blockedDailyLimit, skipped };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function processQueue(batchId) {
  const rateConfig = await getRateConfig();
  const delayPerMessage = Math.ceil(1000 / rateConfig.limitePorSegundo);
  const limitPerMinute = rateConfig.limitePorMinuto;

  let sentThisMinute = 0;
  let minuteStart = Date.now();

  const pendingResult = await query(
    `SELECT * FROM gerador_leads_queue
     WHERE batch_id = $1 AND status_envio IN ('pendente', 'reenvio_agendado')
     ORDER BY created_at ASC`,
    [batchId]
  );

  console.log(`[WhatsAppQueue] Processing batch ${batchId}: ${pendingResult.rows.length} items`);

  for (const item of pendingResult.rows) {
    if (Date.now() - minuteStart >= 60000) {
      sentThisMinute = 0;
      minuteStart = Date.now();
    }

    if (sentThisMinute >= limitPerMinute) {
      const waitTime = 60000 - (Date.now() - minuteStart);
      if (waitTime > 0) {
        console.log(`[WhatsAppQueue] Rate limit per minute reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
        await sleep(waitTime);
      }
      sentThisMinute = 0;
      minuteStart = Date.now();
    }

    await query(
      `UPDATE gerador_leads_queue SET status_envio = 'enviando', updated_at = NOW() WHERE id = $1`,
      [item.id]
    );

    const payload = {
      number: item.lead_number,
      templateId: item.template_id,
      forceSend: true,
      verifyContact: false,
      templatecomponents: [
        {
          type: "body",
          parameters: [
            {
              type: "text",
              text: item.lead_name || ''
            }
          ]
        }
      ]
    };

    let httpStatus = 0;
    let apiResponse = null;
    let success = false;
    let messageSentId = null;
    const disparadoEm = new Date();

    try {
      let itemToken = item.channel_token;
      if (!itemToken) {
        console.warn(`[WhatsAppQueue] Item ${item.id} sem channel_token, buscando config dinâmica...`);
        const fallbackConfig = await getEnvioRegulamentoConfig();
        itemToken = fallbackConfig.channelToken;
        await query('UPDATE gerador_leads_queue SET channel_token = $1 WHERE id = $2', [itemToken, item.id]);
      }

      const waRes = await fetch(WHATSAPP_API_URL, {
        method: 'POST',
        headers: {
          'access-token': itemToken,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      httpStatus = waRes.status;
      try {
        apiResponse = await waRes.json();
      } catch {
        const rawText = await waRes.text();
        apiResponse = { raw: rawText };
      }
      success = httpStatus >= 200 && httpStatus < 300;
      messageSentId = apiResponse?.messageSentId || apiResponse?.message_sent_id || apiResponse?.id || null;
    } catch (fetchErr) {
      httpStatus = 0;
      apiResponse = { error: fetchErr.message };
      success = false;
    }

    const processadoEm = new Date();
    const duracaoMs = processadoEm.getTime() - disparadoEm.getTime();
    const currentAttempt = item.tentativa_numero;
    const statusEnvio = success ? 'enviado' : (currentAttempt < item.max_tentativas ? 'reenvio_agendado' : 'falha');

    try {
      await query(
        `INSERT INTO gerador_leads_whatsapp_logs
          (lead_number, lead_name, user_id, user_email, sent_at, http_status, api_response, success, message_sent_id, filters_used, template_id, status_envio, tentativa_numero, batch_id, team_id)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          item.lead_number,
          item.lead_name,
          item.user_id,
          item.user_email,
          httpStatus,
          JSON.stringify(apiResponse),
          success,
          messageSentId ? String(messageSentId) : null,
          item.filters_used ? JSON.stringify(item.filters_used) : null,
          item.template_id,
          statusEnvio,
          currentAttempt,
          batchId,
          item.team_id
        ]
      );
    } catch (dbErr) {
      console.error(`[WhatsAppQueue] DB log error for ${item.lead_number}:`, dbErr.message);
    }

    await registrarLogDisparo({
      batchId,
      leadNumber: item.lead_number,
      leadName: item.lead_name,
      leadUf: item.lead_uf,
      leadCidade: item.lead_cidade,
      leadProduto: item.lead_produto,
      leadSituacao: item.lead_situacao,
      agentId: item.agent_id,
      agentName: item.agent_name,
      agentEmail: item.user_email,
      templateId: item.template_id,
      templateName: item.template_name,
      channelToken: item.channel_token,
      automationName: item.automation_name,
      tentativaNumero: currentAttempt,
      statusEnvio,
      httpStatus,
      messageSentId: messageSentId ? String(messageSentId) : null,
      apiResponse,
      motivoBloqueio: null,
      disparadoEm,
      processadoEm,
      duracaoMs,
    });

    if (!success) {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = $1, tentativa_numero = tentativa_numero + 1, updated_at = NOW() WHERE id = $2`,
        [statusEnvio, item.id]
      );
    } else {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = $1, updated_at = NOW() WHERE id = $2`,
        [statusEnvio, item.id]
      );
    }

    sentThisMinute++;

    if (delayPerMessage > 0) {
      await sleep(delayPerMessage);
    }
  }

  console.log(`[WhatsAppQueue] Batch ${batchId} processing complete.`);
}

export async function retryFailed(batchId, userId, userEmail, teamId) {
  const rateConfig = await getRateConfig();
  const bloqueioRecorrenciaDias = rateConfig.bloqueioRecorrenciaDias;

  const failedResult = await query(
    `SELECT * FROM gerador_leads_queue
     WHERE batch_id = $1
       AND status_envio IN ('falha', 'reenvio_agendado')
       AND tentativa_numero < max_tentativas
     ORDER BY created_at ASC`,
    [batchId]
  );

  if (failedResult.rows.length === 0) {
    return { total: 0, retried: 0, blocked: 0 };
  }

  let retried = 0;
  let blocked = 0;

  for (const item of failedResult.rows) {
    const existingSuccess = await query(
      `SELECT id FROM gerador_leads_whatsapp_logs
       WHERE lead_number = $1 AND message_sent_id IS NOT NULL AND success = true
       LIMIT 1`,
      [item.lead_number]
    );

    if (existingSuccess.rows.length > 0) {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = 'enviado', updated_at = NOW() WHERE id = $1`,
        [item.id]
      );
      blocked++;
      continue;
    }

    const block30Result = await query(
      `SELECT id FROM gerador_leads_whatsapp_logs
       WHERE lead_number = $1
         AND success = true
         AND sent_at >= NOW() - INTERVAL '1 day' * $2
       LIMIT 1`,
      [item.lead_number, bloqueioRecorrenciaDias]
    );

    if (block30Result.rows.length > 0) {
      await query(
        `UPDATE gerador_leads_queue SET status_envio = 'bloqueado_30_dias', motivo_bloqueio = $1, updated_at = NOW() WHERE id = $2`,
        [`Envio realizado nos últimos ${bloqueioRecorrenciaDias} dias`, item.id]
      );
      blocked++;
      continue;
    }

    await query(
      `UPDATE gerador_leads_queue SET status_envio = 'pendente', tentativa_numero = tentativa_numero + 1, updated_at = NOW() WHERE id = $1`,
      [item.id]
    );
    retried++;
  }

  if (retried > 0) {
    processQueue(batchId).catch(err => {
      console.error(`[WhatsAppQueue] Retry processing error for batch ${batchId}:`, err.message);
    });
  }

  return { total: failedResult.rows.length, retried, blocked };
}

export async function getQueueStatus(batchId) {
  const result = await query(
    `SELECT status_envio, COUNT(*)::int as count
     FROM gerador_leads_queue
     WHERE batch_id = $1
     GROUP BY status_envio`,
    [batchId]
  );

  const status = {
    pendente: 0,
    enviando: 0,
    enviado: 0,
    falha: 0,
    reenvio_agendado: 0,
    bloqueado_30_dias: 0,
    bloqueado_duplicidade: 0,
  };

  let total = 0;
  for (const row of result.rows) {
    status[row.status_envio] = row.count;
    total += row.count;
  }

  const processed = total - status.pendente - status.enviando;
  const isComplete = status.pendente === 0 && status.enviando === 0;

  return { ...status, total, processed, isComplete };
}

export async function getDashboardMetrics({ from, to, userId: filterUserId, teamId: filterTeamId }) {
  const conditions = [];
  const params = [];

  if (from) {
    params.push(from);
    conditions.push(`sent_at >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`sent_at <= $${params.length}::timestamp`);
  }
  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`user_id = $${params.length}`);
  }
  if (filterTeamId) {
    params.push(filterTeamId);
    conditions.push(`team_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalsResult = await query(
    `SELECT
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas,
       COUNT(*) FILTER (WHERE status_envio = 'bloqueado_30_dias')::int as bloqueados_30d,
       COUNT(*) FILTER (WHERE status_envio = 'bloqueado_duplicidade')::int as bloqueados_dup,
       COUNT(*) FILTER (WHERE success = true)::float / NULLIF(COUNT(*) FILTER (WHERE status_envio NOT IN ('bloqueado_30_dias', 'bloqueado_duplicidade')), 0) * 100 as taxa_sucesso
     FROM gerador_leads_whatsapp_logs ${where}`,
    params
  );

  const byHourResult = await query(
    `SELECT
       EXTRACT(HOUR FROM sent_at)::int as hora,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs ${where}
     GROUP BY EXTRACT(HOUR FROM sent_at)
     ORDER BY hora`,
    params
  );

  const byUserResult = await query(
    `SELECT
       user_email,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs ${where}
     GROUP BY user_email
     ORDER BY total DESC`,
    params
  );

  const byTeamResult = await query(
    `SELECT
       glwl.team_id,
       t.name as team_name,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE glwl.success = true)::int as enviados,
       COUNT(*) FILTER (WHERE glwl.success = false AND glwl.status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs glwl
     LEFT JOIN teams t ON glwl.team_id = t.id
     ${where ? where.replace(/sent_at/g, 'glwl.sent_at').replace(/user_id/g, 'glwl.user_id').replace(/team_id/g, 'glwl.team_id') : ''}
     GROUP BY glwl.team_id, t.name
     ORDER BY total DESC`,
    params
  );

  const byDayResult = await query(
    `SELECT
       sent_at::date as dia,
       COUNT(*)::int as total,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas
     FROM gerador_leads_whatsapp_logs ${where}
     GROUP BY sent_at::date
     ORDER BY dia ASC`,
    params
  );

  const byBatchResult = await query(
    `SELECT
       batch_id,
       user_email,
       MIN(sent_at) as started_at,
       COUNT(*)::int as total_leads,
       COUNT(*) FILTER (WHERE success = true)::int as enviados,
       COUNT(*) FILTER (WHERE success = false AND status_envio = 'falha')::int as falhas,
       COUNT(*) FILTER (WHERE status_envio IN ('bloqueado_30_dias','bloqueado_duplicidade'))::int as bloqueados
     FROM gerador_leads_whatsapp_logs ${where}
     ${where ? 'AND' : 'WHERE'} batch_id IS NOT NULL
     GROUP BY batch_id, user_email
     ORDER BY MIN(sent_at) DESC
     LIMIT 50`,
    params
  ).catch(() => ({ rows: [] }));

  return {
    totals: totalsResult.rows[0] || { total: 0, enviados: 0, falhas: 0, bloqueados_30d: 0, bloqueados_dup: 0, taxa_sucesso: 0 },
    byHour: byHourResult.rows,
    byDay: byDayResult.rows,
    byUser: byUserResult.rows,
    byTeam: byTeamResult.rows,
    byBatch: byBatchResult.rows,
  };
}

export async function checkConversions({ erpRecords, from, to }) {
  const conditions = ['success = true'];
  const params = [];

  if (from) {
    params.push(from);
    conditions.push(`sent_at >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`sent_at <= $${params.length}::timestamp`);
  }

  const where = conditions.join(' AND ');
  const logsResult = await query(
    `SELECT DISTINCT ON (lead_number) id, lead_number, lead_name, sent_at, user_id, user_email, batch_id, team_id
     FROM gerador_leads_whatsapp_logs
     WHERE ${where}
     ORDER BY lead_number, sent_at ASC`,
    params
  );

  if (logsResult.rows.length === 0) {
    return { matched: 0, conversions: [] };
  }

  const dispatchMap = new Map();
  for (const log of logsResult.rows) {
    const normalized = normalizePhone(log.lead_number);
    if (normalized) {
      dispatchMap.set(normalized, log);
    }
  }

  const conversions = [];

  for (const record of erpRecords) {
    const celIndicador = record.cel_indicador || record.cel || '';
    const normalizedErp = normalizePhone(celIndicador);

    if (!normalizedErp) continue;

    const matchingLog = dispatchMap.get(normalizedErp);
    if (!matchingLog) continue;

    const erpContractDate = record.data_contrato || record.datafechamentovenda || null;
    if (erpContractDate && matchingLog.sent_at) {
      const contractDateObj = new Date(erpContractDate);
      const dispatchDateObj = new Date(matchingLog.sent_at);
      if (contractDateObj < dispatchDateObj) {
        continue;
      }
    }

    const conversion = {
      lead_number: matchingLog.lead_number,
      lead_number_normalized: normalizedErp,
      lead_name: matchingLog.lead_name,
      dispatch_log_id: matchingLog.id,
      dispatch_date: matchingLog.sent_at,
      dispatch_user_id: matchingLog.user_id,
      dispatch_user_email: matchingLog.user_email,
      dispatch_batch_id: matchingLog.batch_id,
      team_id: matchingLog.team_id,
      erp_titular: record.titular || record.nome_cliente_indicado || '',
      erp_cpf: record.cpf_indicado || record.cpf || '',
      erp_contrato: String(record.contrato_servicos || record.id || ''),
      erp_produto: record.produto || '',
      erp_situacao: record.situacao_contrato || '',
      erp_valor_contrato: parseFloat(record.valor_contrato || 0),
      erp_cel_indicador: celIndicador,
      erp_cel_indicador_normalized: normalizedErp,
      erp_data: record,
    };

    try {
      const insertResult = await query(
        `INSERT INTO gerador_leads_conversoes
          (lead_number, lead_number_normalized, lead_name, dispatch_log_id, dispatch_date,
           dispatch_user_id, dispatch_user_email, dispatch_batch_id, team_id,
           venda_identificada, data_venda, erp_data, erp_titular, erp_cpf, erp_contrato,
           erp_produto, erp_situacao, erp_valor_contrato, erp_cel_indicador, erp_cel_indicador_normalized, matched_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,NOW(),$10,$11,$12,$13,$14,$15,$16,$17,$18,'phone')
         ON CONFLICT (lead_number_normalized, erp_contrato) DO NOTHING
         RETURNING id`,
        [
          conversion.lead_number, conversion.lead_number_normalized, conversion.lead_name,
          conversion.dispatch_log_id, conversion.dispatch_date,
          conversion.dispatch_user_id, conversion.dispatch_user_email, conversion.dispatch_batch_id, conversion.team_id,
          JSON.stringify(conversion.erp_data), conversion.erp_titular, conversion.erp_cpf, conversion.erp_contrato,
          conversion.erp_produto, conversion.erp_situacao, conversion.erp_valor_contrato,
          conversion.erp_cel_indicador, conversion.erp_cel_indicador_normalized,
        ]
      );
      if (insertResult.rows.length > 0) {
        conversions.push(conversion);
      }
    } catch (err) {
      console.error(`[Conversions] Error inserting conversion for ${normalizedErp}:`, err.message);
    }
  }

  return { matched: conversions.length, conversions };
}

export async function getConversionMetrics({ from, to, userId: filterUserId, teamId: filterTeamId }) {
  const conditions = [];
  const params = [];

  if (from) {
    params.push(from);
    conditions.push(`data_venda >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`data_venda <= $${params.length}::timestamp`);
  }
  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`dispatch_user_id = $${params.length}`);
  }
  if (filterTeamId) {
    params.push(filterTeamId);
    conditions.push(`team_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalsResult = await query(
    `SELECT
       COUNT(*)::int as total_conversoes,
       COUNT(DISTINCT lead_number_normalized)::int as leads_unicos,
       COALESCE(SUM(erp_valor_contrato), 0)::float as valor_total,
       COUNT(DISTINCT dispatch_user_id)::int as usuarios_com_conversao,
       COUNT(DISTINCT dispatch_batch_id)::int as batches_com_conversao
     FROM gerador_leads_conversoes ${where}`,
    params
  );

  const byUserResult = await query(
    `SELECT
       dispatch_user_email,
       COUNT(*)::int as conversoes,
       COUNT(DISTINCT lead_number_normalized)::int as leads_unicos,
       COALESCE(SUM(erp_valor_contrato), 0)::float as valor_total
     FROM gerador_leads_conversoes ${where}
     GROUP BY dispatch_user_email
     ORDER BY conversoes DESC`,
    params
  );

  const byTeamResult = await query(
    `SELECT
       c.team_id,
       t.name as team_name,
       COUNT(*)::int as conversoes,
       COUNT(DISTINCT c.lead_number_normalized)::int as leads_unicos,
       COALESCE(SUM(c.erp_valor_contrato), 0)::float as valor_total
     FROM gerador_leads_conversoes c
     LEFT JOIN teams t ON c.team_id = t.id
     ${where ? where.replace(/data_venda/g, 'c.data_venda').replace(/dispatch_user_id/g, 'c.dispatch_user_id').replace(/team_id(?!=)/g, 'c.team_id') : ''}
     GROUP BY c.team_id, t.name
     ORDER BY conversoes DESC`,
    params
  );

  const byDayResult = await query(
    `SELECT
       data_venda::date as dia,
       COUNT(*)::int as conversoes,
       COALESCE(SUM(erp_valor_contrato), 0)::float as valor
     FROM gerador_leads_conversoes ${where}
     GROUP BY data_venda::date
     ORDER BY dia ASC`,
    params
  );

  const productConditions = [...conditions, 'erp_produto IS NOT NULL'];
  const productWhere = `WHERE ${productConditions.join(' AND ')}`;
  const byProductResult = await query(
    `SELECT
       erp_produto as produto,
       COUNT(*)::int as contratos,
       COALESCE(SUM(erp_valor_contrato), 0)::float as valor_total
     FROM gerador_leads_conversoes ${productWhere}
     GROUP BY erp_produto
     ORDER BY valor_total DESC`,
    params
  ).catch(() => ({ rows: [] }));

  const byBatchConvResult = await query(
    `SELECT
       dispatch_batch_id as batch_id,
       COUNT(*)::int as conversoes,
       COALESCE(SUM(erp_valor_contrato), 0)::float as valor_total
     FROM gerador_leads_conversoes ${where}
     ${where ? 'AND' : 'WHERE'} dispatch_batch_id IS NOT NULL
     GROUP BY dispatch_batch_id
     ORDER BY conversoes DESC`,
    params
  ).catch(() => ({ rows: [] }));

  const recentResult = await query(
    `SELECT
       lead_number, lead_name, erp_titular, erp_cpf, erp_contrato, erp_produto,
       erp_situacao, erp_valor_contrato, dispatch_user_email, dispatch_date, data_venda,
       erp_cel_indicador, dispatch_batch_id
     FROM gerador_leads_conversoes ${where}
     ORDER BY data_venda DESC
     LIMIT 50`,
    params
  );

  const dispatchTotalsParams = [...params];
  const dispatchConditions = conditions.map(c => c.replace(/data_venda/g, 'sent_at').replace(/dispatch_user_id/g, 'user_id'));
  dispatchConditions.push('success = true');
  const dispatchWhere = `WHERE ${dispatchConditions.join(' AND ')}`;
  let taxaConversao = 0;
  try {
    const dispatchCount = await query(
      `SELECT COUNT(DISTINCT lead_number)::int as total FROM gerador_leads_whatsapp_logs ${dispatchWhere}`,
      dispatchTotalsParams
    );
    const totalDispatched = dispatchCount.rows[0]?.total || 0;
    const totalConverted = totalsResult.rows[0]?.leads_unicos || 0;
    taxaConversao = totalDispatched > 0 ? ((totalConverted / totalDispatched) * 100) : 0;
  } catch {
    taxaConversao = 0;
  }

  return {
    totals: {
      ...totalsResult.rows[0],
      taxa_conversao: Number(taxaConversao.toFixed(2)),
    },
    byDay: byDayResult.rows,
    byUser: byUserResult.rows,
    byTeam: byTeamResult.rows,
    byProduct: byProductResult.rows,
    byBatch: byBatchConvResult.rows,
    recent: recentResult.rows,
  };
}

export async function getConversionsList({ page = 1, limit = 50, from, to, userId: filterUserId, teamId: filterTeamId }) {
  const conditions = [];
  const params = [];

  if (from) {
    params.push(from);
    conditions.push(`data_venda >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`data_venda <= $${params.length}::timestamp`);
  }
  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`dispatch_user_id = $${params.length}`);
  }
  if (filterTeamId) {
    params.push(filterTeamId);
    conditions.push(`team_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int as total FROM gerador_leads_conversoes ${where}`,
    params
  );

  const offset = (page - 1) * limit;
  const dataParams = [...params, limit, offset];
  const dataResult = await query(
    `SELECT * FROM gerador_leads_conversoes ${where}
     ORDER BY data_venda DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    data: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult.rows[0]?.total || 0) / limit),
  };
}

export async function getLogsWithPagination({ page = 1, limit = 50, status, from, to, userId: filterUserId, batchId }) {
  const conditions = [];
  const params = [];

  if (batchId) {
    params.push(batchId);
    conditions.push(`batch_id = $${params.length}`);
  }
  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`status_envio = $${params.length}`);
  }
  if (from) {
    params.push(from);
    conditions.push(`sent_at >= $${params.length}::timestamp`);
  }
  if (to) {
    params.push(to);
    conditions.push(`sent_at <= $${params.length}::timestamp`);
  }
  if (filterUserId) {
    params.push(filterUserId);
    conditions.push(`user_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(
    `SELECT COUNT(*)::int as total FROM gerador_leads_whatsapp_logs ${where}`,
    params
  );

  const offset = (page - 1) * limit;
  const dataParams = [...params, limit, offset];
  const dataResult = await query(
    `SELECT * FROM gerador_leads_whatsapp_logs ${where}
     ORDER BY sent_at DESC
     LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
    dataParams
  );

  return {
    data: dataResult.rows,
    total: countResult.rows[0]?.total || 0,
    page,
    limit,
    totalPages: Math.ceil((countResult.rows[0]?.total || 0) / limit),
  };
}

export async function recoverStuckQueues() {
  const startTime = new Date().toISOString();
  console.log(`[Recovery] Iniciando verificação de itens presos na fila... (${startTime})`);

  try {
    const stuckResult = await query(
      `SELECT * FROM gerador_leads_queue
       WHERE status_envio = 'enviando'
         AND updated_at < NOW() - INTERVAL '10 minutes'
       ORDER BY batch_id, created_at ASC`
    );

    if (stuckResult.rows.length === 0) {
      console.log('[Recovery] Nenhum item preso encontrado na inicialização.');
      return;
    }

    console.log(`[Recovery] Encontrados ${stuckResult.rows.length} itens presos em 'enviando'.`);

    let recovered = 0;
    let markedAsFailed = 0;
    const batchIds = new Set();

    for (const item of stuckResult.rows) {
      if (item.tentativa_numero < item.max_tentativas) {
        await query(
          `UPDATE gerador_leads_queue
           SET status_envio = 'reenvio_agendado',
               motivo_bloqueio = 'Recovery automático: servidor reiniciado durante processamento',
               updated_at = NOW()
           WHERE id = $1`,
          [item.id]
        );
        recovered++;
        batchIds.add(item.batch_id);
      } else {
        await query(
          `UPDATE gerador_leads_queue
           SET status_envio = 'falha',
               motivo_bloqueio = 'Esgotadas as tentativas após recovery automático',
               updated_at = NOW()
           WHERE id = $1`,
          [item.id]
        );
        markedAsFailed++;
      }
    }

    console.log(`[Recovery] Resultado: ${recovered} recuperados para reenvio, ${markedAsFailed} marcados como falha.`);

    for (const batchId of batchIds) {
      const batchCount = stuckResult.rows.filter(r => r.batch_id === batchId).length;
      console.log(`[Recovery] Batch ${batchId}: ${batchCount} itens — iniciando reprocessamento...`);
      processQueue(batchId).catch(err => {
        console.error(`[Recovery] Erro ao reprocessar batch ${batchId}:`, err.message);
      });
    }

    const endTime = new Date().toISOString();
    console.log(`[Recovery] Verificação concluída. (${endTime})`);
  } catch (err) {
    console.error('[Recovery] Erro durante verificação de itens presos:', err.message);
  }
}
