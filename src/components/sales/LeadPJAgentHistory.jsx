import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  User,
  ArrowRight,
  Clock,
  CircleDot,
  History,
  UserCog,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { getAgentDisplayName } from "@/utils/agents";

const parseDate = (value) => {
  if (!value) return null;
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(value);
    return isValid(d) ? d : null;
  } catch {
    return null;
  }
};

const formatDate = (value) => {
  const d = parseDate(value);
  if (!d) return "—";
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
};

const formatDuration = (start, end) => {
  const startDate = parseDate(start);
  if (!startDate) return null;
  const endDate = parseDate(end) || new Date();
  const diffMs = endDate - startDate;
  if (diffMs < 0) return null;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return "< 1m";
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

export default function LeadPJAgentHistory({ lead, activities = [], agents: agentsProp }) {
  const { data: agentsFetched = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !agentsProp,
  });
  const agents = agentsProp || agentsFetched;

  const periods = useMemo(() => {
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

    // Período inicial: do criar do lead até a primeira reatribuição
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

    // Períodos intermediários e final
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
  }, [lead, activities, agents]);

  if (!lead) return null;

  const totalChanges = Math.max(0, periods.length - 1);

  if (periods.length === 0) {
    return (
      <div className="text-center py-12">
        <UserCog className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Nenhuma informação de responsabilidade disponível.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
              <History className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Reatribuições
            </span>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{totalChanges}</p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <User className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Responsável atual
            </span>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {periods[periods.length - 1]?.agentName || "Sem agente"}
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/50">
              <Clock className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Tempo c/ atual
            </span>
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white">
            {formatDuration(periods[periods.length - 1]?.from, null) || "—"}
          </p>
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-5 top-2 bottom-2 w-px bg-gradient-to-b from-indigo-200 via-purple-200 to-emerald-200 dark:from-indigo-800 dark:via-purple-800 dark:to-emerald-800" />

        <ul className="space-y-4">
          {periods.map((period, idx) => {
            const duration = formatDuration(period.from, period.to);
            return (
              <li key={`${period.from || "start"}-${idx}`} className="relative pl-12">
                <div
                  className={`absolute left-0 top-1 flex items-center justify-center w-10 h-10 rounded-full border-4 ${
                    period.isCurrent
                      ? "bg-gradient-to-br from-indigo-500 to-purple-600 border-white dark:border-gray-900 shadow-lg shadow-indigo-500/30 ring-4 ring-indigo-100 dark:ring-indigo-900/40"
                      : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  }`}
                >
                  {period.isCurrent ? (
                    <CircleDot className="w-4 h-4 text-white animate-pulse" />
                  ) : (
                    <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  )}
                </div>

                <div
                  className={`rounded-xl border p-4 ${
                    period.isCurrent
                      ? "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800"
                      : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <p className="font-semibold text-gray-900 dark:text-white">
                      {period.agentName}
                    </p>
                    {period.isCurrent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">
                        ATUAL
                      </span>
                    )}
                    {duration && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                        <Clock className="w-2.5 h-2.5" />
                        {duration}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-gray-500 dark:text-gray-500">Desde:</span>
                    <span>{formatDate(period.from)}</span>
                    <ArrowRight className="w-3 h-3 text-gray-400" />
                    <span className="font-medium text-gray-500 dark:text-gray-500">Até:</span>
                    <span>{period.to ? formatDate(period.to) : "Atual"}</span>
                  </div>

                  {period.to && period.reassignedByName && (
                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <UserCog className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        Reatribuído por{" "}
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {period.reassignedByName}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
