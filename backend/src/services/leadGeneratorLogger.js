import { query } from '../config/database.js';

export async function registrarLogDisparo({
  batchId,
  leadNumber,
  leadName,
  leadUf,
  leadCidade,
  leadProduto,
  leadSituacao,
  agentId,
  agentName,
  agentEmail,
  templateId,
  templateName,
  channelToken,
  automationName,
  tentativaNumero,
  statusEnvio,
  httpStatus,
  messageSentId,
  apiResponse,
  motivoBloqueio,
  disparadoEm,
  processadoEm,
  duracaoMs,
}) {
  try {
    await query(
      `INSERT INTO gerador_leads_log_estruturado
        (batch_id, lead_number, lead_name, lead_uf, lead_cidade, lead_produto, lead_situacao,
         agent_id, agent_name, agent_email,
         template_id, template_name, channel_token, automation_name,
         tentativa_numero, status_envio, http_status, message_sent_id, api_response, motivo_bloqueio,
         disparado_em, processado_em, duracao_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
      [
        batchId,
        leadNumber,
        leadName || null,
        leadUf || null,
        leadCidade || null,
        leadProduto || null,
        leadSituacao || null,
        agentId || null,
        agentName || null,
        agentEmail || null,
        templateId || null,
        templateName || null,
        channelToken || null,
        automationName || null,
        tentativaNumero || 1,
        statusEnvio,
        httpStatus || null,
        messageSentId || null,
        apiResponse ? JSON.stringify(apiResponse) : null,
        motivoBloqueio || null,
        disparadoEm || new Date(),
        processadoEm || null,
        duracaoMs || null,
      ]
    );
  } catch (err) {
    console.error('[LogEstruturado] Erro ao registrar log:', err.message);
  }
}
