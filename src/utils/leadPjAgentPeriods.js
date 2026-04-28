import { isValid, parseISO } from "date-fns";
import { getAgentDisplayName } from "@/utils/agents";

export const parseDateLoose = (value) => {
  if (!value) return null;
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(value);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
};

const pickMetadata = (activity) => {
  const meta = activity?.metadata || activity?.Metadata || null;
  if (!meta) return {};
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return meta;
};

const resolveAgentName = (id, fallbackName, agents) => {
  if (id) {
    const name = getAgentDisplayName(id, agents, "");
    if (name) return name;
  }
  return fallbackName || "Sem agente";
};

export function deriveLeadAgentPeriods(lead, activities = [], agents = []) {
  if (!lead) return [];

  const leadCreatedAt =
    lead.createdAt || lead.createdDate || lead.created_at || lead.created_date;

  const changes = (activities || [])
    .filter((a) => a && (a.type === "agent_change" || a.Type === "agent_change"))
    .map((a) => {
      const meta = pickMetadata(a);
      const changedAt =
        a.createdAt || a.created_at || a.scheduledAt || a.scheduled_at;
      return {
        changedAt,
        fromAgentId: meta.from_agent_id || meta.fromAgentId || null,
        toAgentId:
          meta.to_agent_id ||
          meta.toAgentId ||
          a.assignedTo ||
          a.assigned_to ||
          null,
        fromAgentName: meta.from_agent_name || meta.fromAgentName || null,
        toAgentName: meta.to_agent_name || meta.toAgentName || null,
        actorId:
          meta.actor_id ||
          meta.actorId ||
          a.createdBy ||
          a.created_by ||
          null,
        actorName: meta.actor_name || meta.actorName || null,
      };
    })
    .filter((c) => !!c.changedAt)
    .sort((a, b) => new Date(a.changedAt) - new Date(b.changedAt));

  const list = [];

  if (changes.length === 0) {
    list.push({
      agentId: lead.agentId || lead.agent_id || null,
      agentName: resolveAgentName(
        lead.agentId || lead.agent_id || null,
        null,
        agents
      ),
      from: leadCreatedAt,
      to: null,
      reassignedById: null,
      reassignedByName: null,
      isCurrent: true,
    });
    return list;
  }

  const first = changes[0];
  list.push({
    agentId: first.fromAgentId,
    agentName: resolveAgentName(first.fromAgentId, first.fromAgentName, agents),
    from: leadCreatedAt,
    to: first.changedAt,
    reassignedById: first.actorId,
    reassignedByName: resolveAgentName(first.actorId, first.actorName, agents),
    isCurrent: false,
  });

  for (let i = 0; i < changes.length; i += 1) {
    const current = changes[i];
    const next = changes[i + 1] || null;
    list.push({
      agentId: current.toAgentId,
      agentName: resolveAgentName(current.toAgentId, current.toAgentName, agents),
      from: current.changedAt,
      to: next ? next.changedAt : null,
      reassignedById: next ? next.actorId : null,
      reassignedByName: next
        ? resolveAgentName(next.actorId, next.actorName, agents)
        : null,
      isCurrent: !next,
    });
  }

  return list;
}

export function periodOverlapsRange(period, fromDate, toDate) {
  const start = parseDateLoose(period.from);
  const end = period.to ? parseDateLoose(period.to) : new Date();
  if (!start) return false;

  if (fromDate && end && end < fromDate) return false;
  if (toDate && start > toDate) return false;
  return true;
}

export function getPeriodOverlapMs(period, fromDate, toDate) {
  const start = parseDateLoose(period.from);
  const end = period.to ? parseDateLoose(period.to) : new Date();
  if (!start || !end) return 0;

  const effectiveStart = fromDate && start < fromDate ? fromDate : start;
  const effectiveEnd = toDate && end > toDate ? toDate : end;

  const diff = effectiveEnd - effectiveStart;
  return diff > 0 ? diff : 0;
}
