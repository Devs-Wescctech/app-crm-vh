import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  XCircle,
  Download,
  Users,
  DollarSign,
  TrendingDown,
  Eye,
  Search,
  ShieldX,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  BarChart3,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { hasFullVisibility, hasTeamVisibility, getVisibleAgentIds, getDataVisibilityKey, getVisibleTeams, getVisibleAgentsForFilter } from "@/components/utils/permissions.jsx";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { toast } from "sonner";

const createPageUrl = (pageName) => `/${pageName}`;

const ITEMS_PER_PAGE = 20;

const fmtCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

export default function SalesPJLostReport() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPeriod, setSelectedPeriod] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [reopenDialog, setReopenDialog] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = hasFullVisibility(currentAgent);
  const hasPermission = !!user;

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user && hasPermission,
  });

  const { data: leadsPJ = [], isLoading } = useQuery({
    queryKey: ['leads-pj-lost-report', getDataVisibilityKey(user, currentAgent), allAgents.length],
    queryFn: async () => {
      const allLeads = await base44.entities.LeadPJ.list('-createdDate', 10000);
      const lostLeads = allLeads.filter(l => l.lost || l.stage === 'fechado_perdido');

      if (isAdmin) return lostLeads;
      if (!currentAgent) return [];

      const visibleIds = getVisibleAgentIds(currentAgent, allAgents, teams);
      return lostLeads.filter(l => visibleIds.includes(l.agentId || l.agent_id));
    },
    enabled: !!user && hasPermission && allAgents.length > 0,
  });

  const reopenLeadMutation = useMutation({
    mutationFn: (leadId) => base44.entities.LeadPJ.update(leadId, {
      lost: false,
      concluded: false,
      stage: 'qualificacao',
      lostReason: null,
      lostDetails: null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads-pj-lost-report'] });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      toast.success('Lead reaberto com sucesso!');
      setReopenDialog(null);
    },
    onError: () => {
      toast.error('Erro ao reabrir lead');
    },
  });

  const agentMap = useMemo(() => {
    const map = {};
    allAgents.forEach(a => { map[a.id] = a; });
    return map;
  }, [allAgents]);

  const teamMap = useMemo(() => {
    const map = {};
    teams.forEach(t => { map[t.id] = t; });
    return map;
  }, [teams]);

  const sources = useMemo(() => {
    const s = new Set();
    leadsPJ.forEach(l => { if (l.source) s.add(l.source); });
    return [...s].sort();
  }, [leadsPJ]);

  const segments = useMemo(() => {
    const s = new Set();
    leadsPJ.forEach(l => { if (l.segment) s.add(l.segment); });
    return [...s].sort();
  }, [leadsPJ]);

  const visibleAgents = useMemo(() => {
    return getVisibleAgentsForFilter(currentAgent, allAgents);
  }, [currentAgent, allAgents]);

  const visibleTeamsList = useMemo(() => {
    return getVisibleTeams(currentAgent, teams, allAgents);
  }, [currentAgent, teams, allAgents]);

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return visibleAgents;
    return visibleAgents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [visibleAgents, selectedTeam]);

  const filteredLeads = useMemo(() => {
    return leadsPJ.filter(lead => {
      if (searchText) {
        const s = searchText.toLowerCase();
        if (
          !lead.razaoSocial?.toLowerCase().includes(s) &&
          !lead.razao_social?.toLowerCase().includes(s) &&
          !lead.nomeFantasia?.toLowerCase().includes(s) &&
          !lead.nome_fantasia?.toLowerCase().includes(s) &&
          !lead.cnpj?.toLowerCase().includes(s) &&
          !lead.contactName?.toLowerCase().includes(s) &&
          !lead.contact_name?.toLowerCase().includes(s)
        ) return false;
      }

      if (dateRange?.from) {
        const d = new Date(lead.updatedAt || lead.updated_at || lead.createdAt);
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        if (d < start) return false;
      }
      if (dateRange?.to) {
        const d = new Date(lead.updatedAt || lead.updated_at || lead.createdAt);
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        if (d > end) return false;
      }

      if (selectedAgent) {
        const agentId = lead.agentId || lead.agent_id;
        if (agentId !== selectedAgent) return false;
      }

      if (selectedTeam) {
        const teamAgentIds = displayAgents.map(a => String(a.id));
        const leadAgentId = String(lead.agentId || lead.agent_id);
        if (!teamAgentIds.includes(leadAgentId)) return false;
      }

      if (selectedSource && lead.source !== selectedSource) return false;
      if (selectedSegment && lead.segment !== selectedSegment) return false;

      return true;
    });
  }, [leadsPJ, searchText, dateRange, selectedAgent, selectedTeam, selectedSource, selectedSegment, displayAgents]);

  const getLeadValue = (l) => parseFloat(l.value) || parseFloat(l.monthlyValue) || parseFloat(l.monthly_value) || 0;
  const totalRegistros = filteredLeads.length;
  const valorTotal = filteredLeads.reduce((sum, l) => sum + getLeadValue(l), 0);
  const ticketMedio = totalRegistros > 0 ? valorTotal / totalRegistros : 0;

  const lostReasons = useMemo(() => {
    const reasons = {};
    filteredLeads.forEach(l => {
      const reason = l.lostReason || l.lost_reason || 'Não informado';
      reasons[reason] = (reasons[reason] || 0) + 1;
    });
    return Object.entries(reasons).sort((a, b) => b[1] - a[1]);
  }, [filteredLeads]);

  const totalPages = Math.ceil(totalRegistros / ITEMS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedTeam(null);
    setSearchText("");
    setSelectedSource(null);
    setSelectedSegment(null);
    setCurrentPage(1);
  };

  const exportToExcel = () => {
    const periodLabel = dateRange?.from && dateRange?.to
      ? `${format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

    const csvContent = [
      ['RELATÓRIO DE PERDIDOS - VENDAS PJ'],
      [`Período: ${periodLabel}`],
      [`Total: ${totalRegistros} | Valor Total: R$ ${(valorTotal || 0).toFixed(2)} | Ticket Médio: R$ ${(ticketMedio || 0).toFixed(2)}`],
      [''],
      ['Razão Social', 'Nome Fantasia', 'CNPJ', 'Contato', 'Telefone', 'Segmento', 'Valor', 'Motivo Perda', 'Agente', 'Dt. Criação', 'Dt. Atualização'],
      ...filteredLeads.map(lead => {
        const agent = agentMap[lead.agentId || lead.agent_id];
        return [
          lead.razaoSocial || lead.razao_social || '',
          lead.nomeFantasia || lead.nome_fantasia || '',
          lead.cnpj || '',
          lead.contactName || lead.contact_name || '',
          lead.contactPhone || lead.contact_phone || '',
          lead.segment || '',
          `R$ ${getLeadValue(lead).toFixed(2)}`,
          lead.lostReason || lead.lost_reason || '',
          agent?.name || '',
          lead.createdAt ? format(new Date(lead.createdAt), 'dd/MM/yyyy', { locale: ptBR }) : '',
          lead.updatedAt ? format(new Date(lead.updatedAt), 'dd/MM/yyyy', { locale: ptBR }) : '',
        ];
      }),
    ].map(row => row.join(';')).join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio-perdidos-pj-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar este relatório.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Relatório de Perdidos</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Vendas PJ — Leads B2B perdidos
          </p>
        </div>
        <Button
          onClick={exportToExcel}
          className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600"
        >
          <Download className="w-4 h-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      <DashboardFilters
        teams={visibleTeamsList}
        agents={displayAgents}
        selectedPeriod={selectedPeriod}
        dateRange={dateRange}
        selectedAgent={selectedAgent}
        selectedTeam={selectedTeam}
        onPeriodChange={setSelectedPeriod}
        onDateRangeChange={(v) => { setDateRange(v); setCurrentPage(1); }}
        onAgentChange={(v) => { setSelectedAgent(v); setCurrentPage(1); }}
        onTeamChange={(v) => { setSelectedTeam(v); setCurrentPage(1); }}
        onClearFilters={handleClearFilters}
        showAgentFilter={true}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por razão social, CNPJ, contato..."
            value={searchText}
            onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
            className="pl-9 bg-white dark:bg-gray-900"
          />
        </div>
        {sources.length > 0 && (
          <Select value={selectedSource || "all"} onValueChange={v => { setSelectedSource(v === "all" ? null : v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[160px] bg-white dark:bg-gray-900"><SelectValue placeholder="Origem" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas origens</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {segments.length > 0 && (
          <Select value={selectedSegment || "all"} onValueChange={v => { setSelectedSegment(v === "all" ? null : v); setCurrentPage(1); }}>
            <SelectTrigger className="w-[160px] bg-white dark:bg-gray-900"><SelectValue placeholder="Segmento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos segmentos</SelectItem>
              {segments.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total de Perdidos</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{totalRegistros}</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-950 rounded-xl">
                <Users className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-red-200 dark:border-red-800 bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-950/50 dark:to-orange-950/50 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Valor Perdido</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {fmtCurrency(valorTotal)}
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl">
                <DollarSign className="w-8 h-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Ticket Médio</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {fmtCurrency(ticketMedio)}
                </p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <TrendingDown className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {lostReasons.length > 0 && (
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800 pb-3">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <BarChart3 className="w-5 h-5 text-red-600" />
              Análise de Motivos de Perda
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">Distribuição por motivo</p>
                {lostReasons.map(([reason, count]) => {
                  const pct = totalRegistros > 0 ? ((count / totalRegistros) * 100).toFixed(1) : 0;
                  return (
                    <div key={reason} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-700 dark:text-gray-300 truncate mr-2">{reason}</span>
                        <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                          className="h-2.5 rounded-full"
                          style={{ width: `${pct}%`, background: 'linear-gradient(to right, #ef4444, #f97316)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-4">Perdidos por agente</p>
                {(() => {
                  const byAgent = {};
                  filteredLeads.forEach(l => {
                    const aid = l.agentId || l.agent_id;
                    const name = agentMap[aid]?.name || 'Sem agente';
                    byAgent[name] = (byAgent[name] || 0) + 1;
                  });
                  const sorted = Object.entries(byAgent).sort((a, b) => b[1] - a[1]);
                  return sorted.map(([name, count]) => {
                    const pct = totalRegistros > 0 ? ((count / totalRegistros) * 100).toFixed(1) : 0;
                    return (
                      <div key={name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700 dark:text-gray-300 truncate mr-2">{name}</span>
                          <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                          <div
                            className="h-2.5 rounded-full"
                            style={{ width: `${pct}%`, background: 'linear-gradient(to right, #8b5cf6, #6366f1)' }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <XCircle className="w-5 h-5 text-red-600" />
            Leads PJ Perdidos ({totalRegistros})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Razão Social</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Nome Fantasia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CNPJ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Contato</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Motivo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agente</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dt. Criação</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Carregando...
                    </td>
                  </tr>
                ) : paginatedLeads.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Nenhum lead PJ perdido encontrado para os filtros selecionados
                    </td>
                  </tr>
                ) : (
                  paginatedLeads.map(lead => {
                    const agent = agentMap[lead.agentId || lead.agent_id];
                    return (
                      <tr key={lead.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="font-medium text-gray-900 dark:text-gray-100">{lead.razaoSocial || lead.razao_social || '-'}</p>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{lead.nomeFantasia || lead.nome_fantasia || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 dark:text-gray-400">{lead.cnpj || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{lead.contactName || lead.contact_name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-semibold text-red-600 dark:text-red-400">
                          {fmtCurrency(getLeadValue(lead))}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400 dark:border-red-700">
                            {lead.lostReason || lead.lost_reason || '-'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 dark:text-gray-300">{agent?.name || '-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-center text-gray-600 dark:text-gray-400">
                          {lead.createdAt ? format(new Date(lead.createdAt), 'dd/MM/yy', { locale: ptBR }) : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate(`${createPageUrl("LeadPJDetail")}?id=${lead.id}`)}
                              className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Ver
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setReopenDialog(lead)}
                              className="text-green-600 hover:text-green-800 dark:text-green-400"
                            >
                              <RotateCcw className="w-4 h-4 mr-1" />
                              Reabrir
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} a {Math.min(currentPage * ITEMS_PER_PAGE, totalRegistros)} de {totalRegistros}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {currentPage} / {totalPages}
                </span>
                <Button variant="outline" size="sm" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!reopenDialog} onOpenChange={(open) => !open && setReopenDialog(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-gray-100">Reabrir Lead</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-600 dark:text-gray-400">
              Tem certeza que deseja reabrir o lead <strong>{reopenDialog?.nomeFantasia || reopenDialog?.nome_fantasia || reopenDialog?.razaoSocial || reopenDialog?.razao_social}</strong>?
              Ele voltará para o estágio de Qualificação no pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => reopenLeadMutation.mutate(reopenDialog?.id)}
              className="bg-green-600 hover:bg-green-700"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Sim, reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
