const WON_STAGE = "fechado_ganho";

function parseMaybeJson(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function extractAgentChanges(activities = []) {
  if (!Array.isArray(activities)) return [];

  return activities
    .filter((a) => {
      if (!a) return false;
      const type = a.type || a.Type;
      return type === "agent_change";
    })
    .map((a) => {
      const meta = parseMaybeJson(a.metadata || a.Metadata) || {};
      const changedAt =
        a.createdAt ||
        a.created_at ||
        a.scheduledAt ||
        a.scheduled_at ||
        null;
      const fromAgentId =
        meta.from_agent_id || meta.fromAgentId || null;
      const toAgentId =
        meta.to_agent_id ||
        meta.toAgentId ||
        a.assignedTo ||
        a.assigned_to ||
        null;
      return {
        changedAt,
        fromAgentId: fromAgentId ? String(fromAgentId) : null,
        toAgentId: toAgentId ? String(toAgentId) : null,
      };
    })
    .filter((c) => !!c.changedAt && asDate(c.changedAt))
    .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));
}

function isAgentChangeList(value) {
  return (
    Array.isArray(value) &&
    (value.length === 0 ||
      Object.prototype.hasOwnProperty.call(value[0] || {}, "changedAt"))
  );
}

export function resolveOwnerAt(lead, activitiesOrChanges, timestamp) {
  const currentAgentId = lead?.agentId || lead?.agent_id || null;
  const currentAgentIdStr = currentAgentId ? String(currentAgentId) : null;

  const ts = asDate(timestamp);
  if (!ts) return currentAgentIdStr;

  const changes = isAgentChangeList(activitiesOrChanges)
    ? activitiesOrChanges
    : extractAgentChanges(activitiesOrChanges);

  if (!changes || changes.length === 0) return currentAgentIdStr;

  const firstChangeAt = asDate(changes[0].changedAt);
  if (firstChangeAt && ts < firstChangeAt) {
    return changes[0].fromAgentId || currentAgentIdStr;
  }

  let owner = currentAgentIdStr;
  for (const change of changes) {
    const changedAt = asDate(change.changedAt);
    if (!changedAt) continue;
    if (changedAt <= ts) {
      owner = change.toAgentId;
    } else {
      break;
    }
  }
  return owner;
}

export function getWonAtTimestamp(lead) {
  if (!lead) return null;

  const history =
    parseMaybeJson(lead.stageHistory) ||
    parseMaybeJson(lead.stage_history) ||
    (Array.isArray(lead.stageHistory) ? lead.stageHistory : null) ||
    (Array.isArray(lead.stage_history) ? lead.stage_history : null) ||
    [];

  if (Array.isArray(history) && history.length > 0) {
    const wonEntries = history
      .filter((entry) => entry && entry.to === WON_STAGE)
      .map((entry) => {
        const at = entry.changedAt || entry.changed_at || null;
        return { ...entry, _rawAt: at, _at: asDate(at) };
      })
      .filter((entry) => !!entry._at)
      .sort((a, b) => b._at - a._at);

    if (wonEntries.length > 0) {
      return wonEntries[0]._rawAt;
    }
  }

  return (
    lead.concludedAt ||
    lead.concluded_at ||
    lead.convertedAt ||
    lead.converted_at ||
    lead.updatedAt ||
    lead.updated_at ||
    null
  );
}

export function resolveCommissionOwner(lead, activities) {
  const ts = getWonAtTimestamp(lead);
  return resolveOwnerAt(lead, activities, ts);
}

export function buildAgentChangesByLead(activities = []) {
  const grouped = new Map();
  if (!Array.isArray(activities)) return grouped;

  for (const a of activities) {
    if (!a) continue;
    const type = a.type || a.Type;
    if (type !== "agent_change") continue;
    const lid = a.leadId || a.lead_id;
    if (!lid) continue;
    const key = String(lid);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(a);
  }

  const result = new Map();
  for (const [lid, acts] of grouped.entries()) {
    result.set(lid, extractAgentChanges(acts));
  }
  return result;
}

export function getCommissionOwnerForLead(lead, changesByLead) {
  if (!lead) return null;
  const key = String(lead.id || "");
  const changes = changesByLead?.get?.(key) || [];
  return resolveCommissionOwner(lead, changes);
}
