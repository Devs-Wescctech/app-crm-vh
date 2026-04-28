import { useState, useMemo, useEffect } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Loader2,
  ShieldX,
  UserCog,
  Users,
  ArrowRight,
  PieChart as PieChartIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  hasFullVisibility,
  hasTeamVisibility,
  canAccessReports,
  getDataVisibilityKey,
  getVisibleTeams,
  getVisibleAgentsForFilter,
} from "@/components/utils/permissions";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { LEAD_PJ_STAGES, getStageLabel } from "@/constants/stages";
import {
  deriveLeadAgentPeriods,
  parseDateLoose,
  periodOverlapsRange,
  getPeriodOverlapMs,
} from "@/utils/leadPjAgentPeriods";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const CHART_COLORS = [
  "#6366f1",
  "#22c55e",
  "#f97316",
  "#eab308",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#94a3b8",
];

const CHART_TOP_N = 6;

const formatBRL = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);

const formatDays = (days) => {
  if (!Number.isFinite(days) || days <= 0) return "0";
  if (days >= 10) return days.toFixed(0);
  return days.toFixed(1).replace(".", ",");
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(1).replace(".", ",")}%`;
};

const formatDate = (value) => {
  const d = parseDateLoose(value);
  if (!d) return "—";
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
};

const formatDateOnly = (value) => {
  const d = parseDateLoose(value);
  if (!d) return "";
  return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
};

const formatDuration = (start, end) => {
  const startDate = parseDateLoose(start);
  if (!startDate) return null;
  const endDate = parseDateLoose(end) || new Date();
  const diffMs = endDate - startDate;
  if (diffMs < 0) return null;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (minutes > 0) return `${minutes}m`;
  return "<1m";
};

const csvCell = (value) => {
  const v = value === null || value === undefined ? "" : String(value);
  return `"${v.replace(/"/g, '""')}"`;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];

/**
 * Aggregates a list of derived periods (rows) into per-agent commission
 * summaries — used both by the on-screen card (current page) and by the
 * CSV export (full dataset across all pages).
 */
function computeAgentSummary(rowsList) {
  const buckets = new Map();
  let totalDays = 0;

  rowsList.forEach((r) => {
    const agentId = r.period.agentId || `__none__:${r.period.agentName}`;
    const days = r.overlapDays;
    totalDays += days;

    let bucket = buckets.get(agentId);
    if (!bucket) {
      bucket = {
        agentId: r.period.agentId || null,
        agentName: r.period.agentName || "Sem agente",
        teamName: r.teamName,
        teamId: r.teamId || null,
        totalDays: 0,
        leadIds: new Set(),
        leadValues: new Map(),
      };
      buckets.set(agentId, bucket);
    }

    bucket.totalDays += days;
    bucket.leadIds.add(r.leadId);
    if (!bucket.leadValues.has(r.leadId)) {
      bucket.leadValues.set(r.leadId, r.leadValue || 0);
    }
  });

  const summary = Array.from(buckets.values()).map((b) => {
    const totalValue = Array.from(b.leadValues.values()).reduce(
      (acc, v) => acc + (v || 0),
      0
    );
    return {
      agentId: b.agentId,
      agentName: b.agentName,
      teamName: b.teamName,
      teamId: b.teamId,
      leadCount: b.leadIds.size,
      totalDays: b.totalDays,
      totalValue,
      percent: totalDays > 0 ? (b.totalDays / totalDays) * 100 : 0,
    };
  });

  summary.sort((a, b) => b.totalDays - a.totalDays);

  const uniqueLeadValues = new Map();
  rowsList.forEach((r) => {
    if (!uniqueLeadValues.has(r.leadId)) {
      uniqueLeadValues.set(r.leadId, r.leadValue || 0);
    }
  });

  const totals = {
    uniqueLeads: uniqueLeadValues.size,
    totalDays: summary.reduce((acc, s) => acc + s.totalDays, 0),
    totalValue: Array.from(uniqueLeadValues.values()).reduce(
      (acc, v) => acc + (v || 0),
      0
    ),
  };

  return { summary, totals };
}

export default function SalesPJAgentPeriodsReport() {
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(null);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user,
  });

  const currentAgent = user?.agent;
  const isAdmin = hasFullVisibility(currentAgent);
  const isSupervisor = hasTeamVisibility(currentAgent) && !isAdmin;
  const hasPermission = isAdmin || isSupervisor || canAccessReports(currentAgent);

  const visibleAgents = useMemo(
    () => getVisibleAgentsForFilter(currentAgent, allAgents, teams),
    [currentAgent, allAgents, teams]
  );

  const visibleTeamsList = useMemo(
    () => getVisibleTeams(currentAgent, teams, allAgents),
    [currentAgent, teams, allAgents]
  );

  const salesAgents = useMemo(() => {
    return visibleAgents.filter((a) => {
      const agentType = a.agentType || a.agent_type;
      return (
        agentType === "sales" ||
        agentType === "pre_sales" ||
        agentType === "sales_supervisor" ||
        agentType === "admin"
      );
    });
  }, [visibleAgents]);

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return salesAgents;
    return salesAgents.filter(
      (a) => String(a.teamId || a.team_id) === String(selectedTeam)
    );
  }, [salesAgents, selectedTeam]);

  // Reset to page 1 whenever a server-side filter changes.
  useEffect(() => {
    setPage(1);
  }, [selectedAgent, selectedStage, selectedTeam, pageSize]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "lead-pj-agent-periods-report",
      getDataVisibilityKey(user, currentAgent),
      selectedAgent,
      selectedStage,
      selectedTeam,
      page,
      pageSize,
    ],
    queryFn: () =>
      base44.reports.leadPjAgentPeriods({
        stage: selectedStage || undefined,
        agentId: selectedAgent || undefined,
        teamId: selectedTeam || undefined,
        page,
        pageSize,
      }),
    enabled: hasPermission && !!user,
    placeholderData: keepPreviousData,
  });

  const leads = data?.leads || [];
  const activities = data?.activities || [];
  const totalLeads = data?.total ?? leads.length;
  const totalPages = data?.totalPages ?? (leads.length > 0 ? 1 : 0);
  const safePage = Math.max(1, Math.min(page, totalPages || 1));

  // Snap back if total shrinks (e.g. after filters change).
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const teamMap = useMemo(() => {
    const map = {};
    teams.forEach((t) => {
      map[t.id] = t;
    });
    return map;
  }, [teams]);

  const agentMap = useMemo(() => {
    const map = {};
    allAgents.forEach((a) => {
      map[a.id] = a;
    });
    return map;
  }, [allAgents]);

  const fromDate = useMemo(() => {
    if (!dateRange?.from) return null;
    const d = new Date(dateRange.from);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [dateRange?.from]);

  const toDate = useMemo(() => {
    if (!dateRange?.to) return null;
    const d = new Date(dateRange.to);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [dateRange?.to]);

  const rows = useMemo(() => {
    const activitiesByLead = new Map();
    activities.forEach((a) => {
      const leadId = a.leadId || a.lead_id;
      if (!leadId) return;
      const list = activitiesByLead.get(leadId) || [];
      list.push(a);
      activitiesByLead.set(leadId, list);
    });

    const result = [];
    leads.forEach((lead) => {
      const leadActivities = activitiesByLead.get(lead.id) || [];
      const periods = deriveLeadAgentPeriods(lead, leadActivities, allAgents);

      periods.forEach((period, idx) => {
        if (!periodOverlapsRange(period, fromDate, toDate)) return;
        if (selectedAgent && period.agentId !== selectedAgent) return;

        const agent = period.agentId ? agentMap[period.agentId] : null;
        const teamId = agent?.teamId || agent?.team_id || null;
        const team = teamId ? teamMap[teamId] : null;
        if (selectedTeam && String(teamId) !== String(selectedTeam)) return;

        const overlapMs = getPeriodOverlapMs(period, fromDate, toDate);

        result.push({
          key: `${lead.id}-${idx}`,
          leadId: lead.id,
          leadName:
            lead.nomeFantasia || lead.razaoSocial || lead.cnpj || "Sem nome",
          leadStage: lead.stage,
          leadValue: lead.value || lead.monthlyValue || 0,
          period,
          agent,
          teamId,
          teamName: team?.name || "—",
          overlapMs,
          overlapDays: overlapMs / MS_PER_DAY,
        });
      });
    });

    return result;
  }, [
    leads,
    activities,
    allAgents,
    agentMap,
    teamMap,
    fromDate,
    toDate,
    selectedAgent,
    selectedTeam,
  ]);

  const agentSummary = useMemo(() => computeAgentSummary(rows), [rows]);

  const chartData = useMemo(() => {
    const sorted = [...agentSummary.summary]
      .filter((s) => s.totalDays > 0)
      .sort((a, b) => b.totalDays - a.totalDays);

    if (sorted.length <= CHART_TOP_N) {
      return sorted.map((s) => ({
        name: s.agentName,
        value: Number(s.totalDays.toFixed(2)),
        leadCount: s.leadCount,
      }));
    }

    const top = sorted.slice(0, CHART_TOP_N);
    const others = sorted.slice(CHART_TOP_N);
    const othersDays = others.reduce((acc, s) => acc + s.totalDays, 0);
    const othersLeads = others.reduce((acc, s) => acc + s.leadCount, 0);

    return [
      ...top.map((s) => ({
        name: s.agentName,
        value: Number(s.totalDays.toFixed(2)),
        leadCount: s.leadCount,
      })),
      {
        name: `Outros (${others.length})`,
        value: Number(othersDays.toFixed(2)),
        leadCount: othersLeads,
        isOthers: true,
      },
    ];
  }, [agentSummary]);

  const stats = useMemo(() => {
    const leadIds = new Set();
    const agentIds = new Set();
    rows.forEach((r) => {
      leadIds.add(r.leadId);
      if (r.period.agentId) agentIds.add(r.period.agentId);
    });
    return {
      totalRows: rows.length,
      leads: leadIds.size,
      agents: agentIds.size,
    };
  }, [rows]);

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
    setPage(1);
  };

  const buildExportRows = (allLeads, allActivities) => {
    const activitiesByLead = new Map();
    allActivities.forEach((a) => {
      const leadId = a.leadId || a.lead_id;
      if (!leadId) return;
      const list = activitiesByLead.get(leadId) || [];
      list.push(a);
      activitiesByLead.set(leadId, list);
    });

    const result = [];
    allLeads.forEach((lead) => {
      const leadActivities = activitiesByLead.get(lead.id) || [];
      const periods = deriveLeadAgentPeriods(lead, leadActivities, allAgents);
      periods.forEach((period, idx) => {
        if (!periodOverlapsRange(period, fromDate, toDate)) return;
        if (selectedAgent && period.agentId !== selectedAgent) return;
        const agent = period.agentId ? agentMap[period.agentId] : null;
        const teamId = agent?.teamId || agent?.team_id || null;
        const team = teamId ? teamMap[teamId] : null;
        if (selectedTeam && String(teamId) !== String(selectedTeam)) return;
        const overlapMs = getPeriodOverlapMs(period, fromDate, toDate);
        result.push({
          key: `${lead.id}-${idx}`,
          leadId: lead.id,
          leadCnpj: lead.cnpj || "",
          leadName:
            lead.nomeFantasia || lead.razaoSocial || lead.cnpj || "Sem nome",
          leadStage: lead.stage,
          leadValue: lead.value || lead.monthlyValue || 0,
          period,
          agent,
          teamId,
          teamName: team?.name || "—",
          overlapMs,
          overlapDays: overlapMs / MS_PER_DAY,
        });
      });
    });
    return result;
  };

  const handleExport = async () => {
    if (totalLeads === 0) {
      alert("Nenhum lead para exportar");
      return;
    }

    setIsExporting(true);
    setExportProgress({ page: 0, totalPages: 0 });

    try {
      const all = await base44.reports.leadPjAgentPeriodsAll({
        stage: selectedStage || undefined,
        agentId: selectedAgent || undefined,
        teamId: selectedTeam || undefined,
        pageSize: 200,
        onProgress: (info) => setExportProgress(info),
      });

      const exportRows = buildExportRows(all.leads, all.activities);

      if (exportRows.length === 0) {
        alert("Nenhum período para exportar");
        return;
      }

      const periodLabel =
        dateRange?.from && dateRange?.to
          ? `${format(dateRange.from, "dd/MM/yyyy", {
              locale: ptBR,
            })} a ${format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}`
          : "Todo o período";

      const header = [
        "Lead",
        "CNPJ",
        "Estágio do Lead",
        "Valor do Lead",
        "Agente Responsável",
        "Filial/Equipe",
        "Desde",
        "Até",
        "Duração",
        "Reatribuído por",
        "Status do Período",
      ];

      const csvRows = exportRows.map((r) => [
        r.leadName,
        r.leadCnpj,
        getStageLabel(r.leadStage, "pj"),
        r.leadValue || 0,
        r.period.agentName,
        r.teamName,
        formatDateOnly(r.period.from),
        r.period.to ? formatDateOnly(r.period.to) : "Atual",
        formatDuration(r.period.from, r.period.to) || "",
        r.period.reassignedByName || "",
        r.period.isCurrent ? "Atual" : "Encerrado",
      ]);

      const exportSummary = computeAgentSummary(exportRows);

      const summaryHeader = [
        "Vendedor",
        "Filial/Equipe",
        "Nº de Leads",
        "Dias de Responsabilidade",
        "Valor Total dos Leads (R$)",
        "% do Total (dias)",
      ];

      const summaryRows = exportSummary.summary.map((s) => [
        s.agentName,
        s.teamName,
        s.leadCount,
        formatDays(s.totalDays),
        (s.totalValue || 0).toFixed(2).replace(".", ","),
        formatPercent(s.percent),
      ]);

      const summaryTotalsRow = [
        "TOTAL",
        "",
        exportSummary.totals.uniqueLeads,
        formatDays(exportSummary.totals.totalDays),
        (exportSummary.totals.totalValue || 0).toFixed(2).replace(".", ","),
        "100,0%",
      ];

      const csv = [
        ["RELATÓRIO DE PERÍODOS DE RESPONSABILIDADE - LEADS PJ"],
        [`Período: ${periodLabel}`],
        [
          `Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm", {
            locale: ptBR,
          })}`,
        ],
        [""],
        ["RESUMO POR VENDEDOR"],
        summaryHeader,
        ...summaryRows,
        summaryTotalsRow,
        [""],
        ["DETALHAMENTO POR PERÍODO"],
        header,
        ...csvRows,
      ]
        .map((row) => row.map(csvCell).join(";"))
        .join("\n");

      const blob = new Blob(["\ufeff" + csv], {
        type: "text/csv;charset=utf-8;",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `relatorio_periodos_responsabilidade_pj_${new Date()
        .toISOString()
        .split("T")[0]}.csv`;
      link.click();
    } catch (err) {
      console.error("Erro ao exportar relatório:", err);
      alert(
        "Não foi possível exportar o relatório. Tente novamente em instantes."
      );
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Acesso Restrito
            </h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar este relatório.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <History className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Períodos de Responsabilidade por Lead
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Auditoria de comissão entre vendedores e filiais — quem foi o dono
            de cada lead em cada período.
          </p>
        </div>
        <Button
          onClick={handleExport}
          className="bg-green-600 hover:bg-green-700"
          disabled={isExporting || totalLeads === 0}
        >
          {isExporting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {exportProgress && exportProgress.totalPages > 0
                ? `Exportando… ${exportProgress.loaded}/${exportProgress.total}`
                : "Exportando…"}
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Exportar CSV
            </>
          )}
        </Button>
      </div>

      <DashboardFilters
        agents={displayAgents}
        stages={LEAD_PJ_STAGES}
        teams={visibleTeamsList}
        selectedAgent={selectedAgent}
        selectedStage={selectedStage}
        selectedTeam={selectedTeam}
        selectedPeriod={selectedPeriod}
        dateRange={dateRange}
        onAgentChange={setSelectedAgent}
        onStageChange={setSelectedStage}
        onTeamChange={setSelectedTeam}
        onPeriodChange={setSelectedPeriod}
        onDateRangeChange={setDateRange}
        onClearFilters={handleClearFilters}
        showAgentFilter={true}
        showStageFilter={true}
        showTeamFilter={true}
        showPeriodFilter={true}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Períodos (nesta página)
                </p>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                  {stats.totalRows}
                </p>
              </div>
              <div className="p-3 bg-indigo-100 dark:bg-indigo-950 rounded-xl">
                <History className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Leads (total filtrado)
                </p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {totalLeads}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {stats.leads} na página atual
                </p>
              </div>
              <div className="p-3 bg-emerald-100 dark:bg-emerald-950 rounded-xl">
                <Users className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Agentes envolvidos (nesta página)
                </p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {stats.agents}
                </p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded-xl">
                <UserCog className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 xl:col-span-1">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5" />
              Divisão de tempo de responsabilidade
            </CardTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Proporção de dias por vendedor — top {CHART_TOP_N}, com
              &quot;Outros&quot; agrupando o restante. Respeita os filtros
              aplicados.
            </p>
          </CardHeader>
          <CardContent className="p-4">
            {isLoading || isFetching ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                Carregando…
              </div>
            ) : chartData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 text-center px-4">
                Sem dados para o gráfico nos filtros atuais.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <RePieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    label={({ percent }) =>
                      percent >= 0.05
                        ? `${(percent * 100).toFixed(0)}%`
                        : ""
                    }
                    labelLine={false}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.isOthers
                            ? "#94a3b8"
                            : CHART_COLORS[index % CHART_COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <ReTooltip
                    formatter={(value, name, item) => {
                      const leadCount = item?.payload?.leadCount ?? 0;
                      return [
                        `${formatDays(value)} dias (${leadCount} leads)`,
                        name,
                      ];
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={48}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 xl:col-span-2">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              Resumo por vendedor
            </CardTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Agregado dos períodos da página atual — útil para distribuir
              comissão proporcional ao tempo de posse de cada lead. Para o
              cálculo completo em todas as páginas, exporte o CSV.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Vendedor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Filial / Equipe
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Leads
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Dias de responsabilidade
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Valor total dos leads
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    % do total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading || isFetching ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      Carregando…
                    </td>
                  </tr>
                ) : agentSummary.summary.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      Sem dados para resumir nos filtros atuais.
                    </td>
                  </tr>
                ) : (
                  <>
                    {agentSummary.summary.map((s) => (
                      <tr
                        key={s.agentId || s.agentName}
                        className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                          {s.agentName}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                          {s.teamName}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                          {s.leadCount}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                          {formatDays(s.totalDays)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                          {formatBRL(s.totalValue)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge
                            variant="outline"
                            className="text-xs font-medium"
                          >
                            {formatPercent(s.percent)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 dark:bg-gray-800 font-semibold">
                      <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                        TOTAL
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        —
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {agentSummary.totals.uniqueLeads}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {formatDays(agentSummary.totals.totalDays)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        {formatBRL(agentSummary.totals.totalValue)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-gray-100">
                        100,0%
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <History className="w-5 h-5" />
            Linhas de responsabilidade
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Lead
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Estágio
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Agente
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Filial / Equipe
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Período
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Reatribuído por
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      Carregando…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                    >
                      Nenhum período encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr
                      key={r.key}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {r.leadName}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Badge variant="outline" className="text-xs">
                          {getStageLabel(r.leadStage, "pj")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {r.period.agentName}
                          </span>
                          {r.period.isCurrent && (
                            <Badge className="bg-indigo-600 text-white text-[10px]">
                              ATUAL
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-300">
                        {r.teamName}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-col gap-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex flex-wrap items-center gap-1">
                            <span className="font-medium text-gray-500">
                              Desde:
                            </span>
                            <span className="text-gray-900 dark:text-gray-100">
                              {formatDate(r.period.from)}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1">
                            <ArrowRight className="w-3 h-3 text-gray-400" />
                            <span className="font-medium text-gray-500">
                              Até:
                            </span>
                            <span className="text-gray-900 dark:text-gray-100">
                              {r.period.to ? formatDate(r.period.to) : "Atual"}
                            </span>
                          </div>
                          {formatDuration(r.period.from, r.period.to) && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 w-fit">
                              {formatDuration(r.period.from, r.period.to)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-300">
                        {r.period.reassignedByName || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalLeads > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  Mostrando leads {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, totalLeads)} de {totalLeads}
                </span>
                {isFetching && !isLoading && (
                  <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    atualizando…
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Por página:</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger className="h-8 w-[80px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
                  Página {safePage} de {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= (totalPages || 1) || isFetching}
                  onClick={() =>
                    setPage((p) => Math.min(totalPages || 1, p + 1))
                  }
                  className="gap-1"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
