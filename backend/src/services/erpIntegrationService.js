import { query } from '../config/database.js';

async function getAgentByErpId(erpAgentId) {
  if (!erpAgentId) return null;

  const result = await query(
    'SELECT * FROM agents WHERE erp_agent_id = $1',
    [erpAgentId]
  );

  return result.rows[0] || null;
}

async function getErpAgentMap() {
  const result = await query(
    'SELECT id, name, email, erp_agent_id FROM agents WHERE erp_agent_id IS NOT NULL'
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.erp_agent_id), row);
  }
  return map;
}

async function findAgentByNormalizedName(name) {
  if (!name) return null;

  const normalized = name.trim().toLowerCase();
  const result = await query(
    'SELECT * FROM agents WHERE LOWER(TRIM(name)) = $1',
    [normalized]
  );

  return result.rows[0] || null;
}

async function resolveAgentFromErp(erpRecord) {
  if (erpRecord.id_agente) {
    const agent = await getAgentByErpId(erpRecord.id_agente);
    if (agent) return agent;
  }

  if (erpRecord.nome_completo || erpRecord.vendedor || erpRecord.vendedor_receptivo) {
    const name = erpRecord.nome_completo || erpRecord.vendedor || erpRecord.vendedor_receptivo;
    return await findAgentByNormalizedName(name);
  }

  return null;
}

export { getAgentByErpId, getErpAgentMap, findAgentByNormalizedName, resolveAgentFromErp };
