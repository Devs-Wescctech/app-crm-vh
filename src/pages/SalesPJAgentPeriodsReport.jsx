import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  History,
  ShieldX,
  UserCog,
  Users,
  ArrowRight,
} from "lucide-react";
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

export default function SalesPJAgentPeriodsReport() {
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

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

  const { data, isLoading, isFetching } = useQuery({
    queryKey: [
      "lead-pj-agent-periods-report",
      getDataVisibilityKey(user, currentAgent),
      selectedAgent,
      selectedStage,
      selectedTeam,
    ],
    queryFn: () =>
      base44.reports.leadPjAgentPeriods({
        stage: selectedStage || undefined,
        agentId: selectedAgent || undefined,
        teamId: selectedTeam || undefined,
      }),
    enabled: hasPermission && !!user,
  });

  const leads = data?.leads || [];
  const activities = data?.activities || [];

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

  const agentSummary = useMemo(() => {
    const buckets = new Map();
    let totalDays = 0;

    rows.forEach((r) => {
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
    rows.forEach((r) => {
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
  }, [rows]);

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
  };

  const handleExport = () => {
    if (rows.length === 0) {
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

    const csvRows = rows.map((r) => {
      const lead = leads.find((l) => l.id === r.leadId);
      return [
        r.leadName,
        lead?.cnpj || "",
        getStageLabel(r.leadStage, "pj"),
        r.leadValue || 0,
        r.period.agentName,
        r.teamName,
        formatDateOnly(r.period.from),
        r.period.to ? formatDateOnly(r.period.to) : "Atual",
        formatDuration(r.period.from, r.period.to) || "",
        r.period.reassignedByName || "",
        r.period.isCurrent ? "Atual" : "Encerrado",
      ];
    });

    const summaryHeader = [
      "Vendedor",
      "Filial/Equipe",
      "Nº de Leads",
      "Dias de Responsabilidade",
      "Valor Total dos Leads (R$)",
      "% do Total (dias)",
    ];

    const summaryRows = agentSummary.summary.map((s) => [
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
      agentSummary.totals.uniqueLeads,
      formatDays(agentSummary.totals.totalDays),
      (agentSummary.totals.totalValue || 0).toFixed(2).replace(".", ","),
      "100,0%",
    ];

    const csv = [
      ["RELATÓRIO DE PERÍODOS DE RESPONSABILIDADE - LEADS PJ"],
      [`Período: ${periodLabel}`],
      [`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`],
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
          disabled={rows.length === 0}
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
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
                  Períodos
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
                <p className="text-sm text-gray-500 dark:text-gray-400">Leads</p>
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {stats.leads}
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
                  Agentes envolvidos
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

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Resumo por vendedor
          </CardTitle>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Agregado dos períodos filtrados — útil para distribuir comissão
            proporcional ao tempo de posse de cada lead.
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
                {isLoading || isFetching ? (
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
        </CardContent>
      </Card>
    </div>
  );
}
