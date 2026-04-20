const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value) {
  return typeof value === "string" && UUID_REGEX.test(value);
}

export function buildAgentMap(agents = []) {
  const map = new Map();
  for (const a of agents) {
    if (!a) continue;
    const id = a.id || a.agentId;
    if (id) map.set(String(id), a);
  }
  return map;
}

export function getAgentDisplayName(agentOrId, agents = [], fallback = "Não definido") {
  if (agentOrId === null || agentOrId === undefined || agentOrId === "") {
    return fallback;
  }

  if (typeof agentOrId === "object") {
    return (
      agentOrId.name ||
      agentOrId.fullName ||
      agentOrId.full_name ||
      fallback
    );
  }

  const value = String(agentOrId);

  if (!isUuid(value)) {
    return value;
  }

  const list = Array.isArray(agents) ? agents : [];
  const found = list.find((a) => a && String(a.id || a.agentId) === value);
  if (found) {
    return found.name || found.fullName || found.full_name || fallback;
  }

  return fallback;
}
