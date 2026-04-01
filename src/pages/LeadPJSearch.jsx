
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Building2,
  Phone,
  Mail,
  MapPin,
  DollarSign,
  Users,
  Calendar,
  Filter,
  X,
  ExternalLink,
  TrendingUp,
  Bell,
  FileText,
  CheckCircle,
  XCircle,
  Info,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { canViewAll, canViewTeam } from "@/components/utils/permissions";

const STAGES_PJ = [
  { value: 'novo', label: 'Novo', color: 'bg-blue-100 text-blue-800' },
  { value: 'qualificacao', label: 'Qualificação', color: 'bg-purple-100 text-purple-800' },
  { value: 'apresentacao', label: 'Apresentação', color: 'bg-indigo-100 text-indigo-800' },
  { value: 'proposta_enviada', label: 'Proposta', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'negociacao', label: 'Negociação', color: 'bg-orange-100 text-orange-800' },
  { value: 'fechado_ganho', label: 'Fechado', color: 'bg-green-100 text-green-800' },
  { value: 'fechado_perdido', label: 'Perdido', color: 'bg-red-100 text-red-800' },
];

export default function LeadPJSearch() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 0,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');

  const { data: leadsPJ = [], isLoading } = useQuery({
    queryKey: ['leadsPJ', isAdmin ? 'admin' : isSupervisor ? 'supervisor' : currentAgent?.id],
    queryFn: async () => {
      const allLeads = await base44.entities.LeadPJ.list('-createdDate');
      
      if (isAdmin || isSupervisor) {
        return allLeads;
      }

      if (!currentAgent) return allLeads;

      const canSeeAll = canViewAll(currentAgent, 'leads');
      if (canSeeAll) {
        return allLeads;
      }

      const canSeeTeam = canViewTeam(currentAgent, 'leads');
      if (canSeeTeam) {
        const teamAgents = allAgents.filter(a => (a.teamId || a.team_id) === (currentAgent.teamId || currentAgent.team_id));
        const teamAgentIds = teamAgents.map(a => a.id);
        return allLeads.filter(l => teamAgentIds.includes(l.agentId || l.agent_id));
      }

      return allLeads.filter(l => (l.agentId || l.agent_id) === currentAgent.id);
    },
    enabled: !!user && !!currentAgent,
  });

  const normalizeString = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const getLeadValue = (lead) => {
    return parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || 0;
  };

  const getFilteredLeads = () => {
    let leads = [...leadsPJ];

    if (stageFilter !== 'all') {
      leads = leads.filter(l => l.stage === stageFilter);
    }

    if (agentFilter !== 'all') {
      leads = leads.filter(l => (l.agentId || l.agent_id) === agentFilter);
    }

    if (dateFrom) {
      const from = new Date(dateFrom);
      from.setHours(0, 0, 0, 0);
      leads = leads.filter(l => {
        const d = new Date(l.createdDate || l.createdAt || l.created_date);
        return !isNaN(d) && d >= from;
      });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      leads = leads.filter(l => {
        const d = new Date(l.createdDate || l.createdAt || l.created_date);
        return !isNaN(d) && d <= to;
      });
    }

    if (searchQuery.trim()) {
      const query = normalizeString(searchQuery);
      const queryNumbers = searchQuery.replace(/\D/g, '');

      leads = leads.filter(lead => {
        if (searchType === 'all' || searchType === 'cnpj') {
          const leadCNPJ = (lead.cnpj || '')?.replace(/\D/g, '') || '';
          if (leadCNPJ.includes(queryNumbers) && queryNumbers) return true;
        }
        if (searchType === 'all' || searchType === 'phone') {
          const leadPhone = (lead.phone || lead.contactPhone || lead.contact_phone || '')?.replace(/\D/g, '') || '';
          if (leadPhone.includes(queryNumbers) && queryNumbers) return true;
        }
        if (searchType === 'all' || searchType === 'name') {
          const razao = normalizeString(lead.razaoSocial || lead.razao_social || '');
          const fantasia = normalizeString(lead.nomeFantasia || lead.nome_fantasia || '');
          const contactName = normalizeString(lead.contactName || lead.contact_name || '');
          if (razao.includes(query) || fantasia.includes(query) || contactName.includes(query)) return true;
        }
        if (searchType === 'all') {
          const leadEmail = normalizeString(lead.email || '');
          if (leadEmail.includes(query)) return true;
          const city = normalizeString(lead.city || '');
          if (city.includes(query)) return true;
        }
        return false;
      });
    }

    return leads;
  };

  const filteredLeads = getFilteredLeads();
  const totalResults = filteredLeads.length;
  const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedLeads = filteredLeads.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleFilterChange = (setter) => (value) => {
    setter(value);
    setCurrentPage(1);
  };

  const getAgentName = (agentId) => {
    const agent = allAgents.find(a => a.id === agentId);
    return agent?.name || agent?.fullName || agent?.full_name || '-';
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatCNPJ = (cnpj) => {
    if (!cnpj) return '-';
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length === 14) {
      return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return cnpj;
  };

  const getStageLabel = (stage) => {
    const stageObj = STAGES_PJ.find(s => s.value === stage);
    return stageObj?.label || stage || '-';
  };

  const getStageColor = (stage) => {
    const stageObj = STAGES_PJ.find(s => s.value === stage);
    return stageObj?.color || 'bg-gray-100 text-gray-800';
  };

  const stats = {
    total: leadsPJ.length,
    active: leadsPJ.filter(l => l.stage && !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).length,
    won: leadsPJ.filter(l => l.stage === 'fechado_ganho').length,
    lost: leadsPJ.filter(l => l.stage === 'fechado_perdido').length,
  };

  const hasActiveFilters = stageFilter !== 'all' || agentFilter !== 'all' || dateFrom || dateTo || searchQuery;

  const clearFilters = () => {
    setStageFilter('all');
    setAgentFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearchQuery('');
    setSearchType('all');
    setCurrentPage(1);
  };

  const exportToCSV = () => {
    const dataToExport = filteredLeads;
    
    if (dataToExport.length === 0) {
      alert('Nenhum lead para exportar');
      return;
    }

    const headers = ['Razão Social', 'Nome Fantasia', 'CNPJ', 'Telefone', 'Email', 'Contato', 'Cidade', 'UF', 'Porte', 'Etapa', 'Valor', 'Agente', 'Data Criação'];
    
    const rows = dataToExport.map(lead => [
      lead.razaoSocial || lead.razao_social || '',
      lead.nomeFantasia || lead.nome_fantasia || '',
      lead.cnpj || '',
      lead.phone || lead.contactPhone || lead.contact_phone || '',
      lead.email || '',
      lead.contactName || lead.contact_name || '',
      lead.city || '',
      lead.state || '',
      lead.porte || '',
      getStageLabel(lead.stage),
      getLeadValue(lead),
      getAgentName(lead.agentId || lead.agent_id),
      (lead.createdDate || lead.createdAt || lead.created_date) ? format(new Date(lead.createdDate || lead.createdAt || lead.created_date), 'dd/MM/yyyy', { locale: ptBR }) : ''
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_pj_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Busca de Leads PJ
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Encontre empresas no seu pipeline de vendas B2B
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Ativos</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{stats.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Ganhos</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.won}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Perdidos</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{stats.lost}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros e Busca
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-3">
                <Label>Buscar por</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    placeholder="Buscar por razão social, nome fantasia, CNPJ, telefone, email..."
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>Campo</Label>
                <Select value={searchType} onValueChange={handleFilterChange(setSearchType)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="name">Nome/Razão</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="phone">Telefone</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label>Estágio</Label>
                <Select value={stageFilter} onValueChange={handleFilterChange(setStageFilter)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os estágios</SelectItem>
                    {STAGES_PJ.map(stage => (
                      <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
              <div className="md:col-span-2">
                <Label>Agente</Label>
                <Select value={agentFilter} onValueChange={handleFilterChange(setAgentFilter)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os agentes</SelectItem>
                    {allAgents.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name || agent.fullName || agent.full_name || agent.userEmail || agent.user_email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data de</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Data até</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Por página</Label>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Button onClick={exportToCSV} variant="outline" className="w-full gap-2 mt-1">
                  <Download className="w-4 h-4" />
                  Exportar CSV
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" />
                <span>{totalResults} empresa(s) encontrada(s)</span>
              </div>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-xs"
                >
                  Limpar filtros
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : paginatedLeads.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Nenhuma empresa encontrada
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                {hasActiveFilters
                  ? 'Tente ajustar os filtros ou a busca'
                  : 'Comece cadastrando seu primeiro lead PJ'
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-100 dark:bg-gray-800">
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Razão Social / Nome Fantasia</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Telefone</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden lg:table-cell">Email</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden lg:table-cell">CNPJ</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300">Estágio</th>
                      <th className="text-right p-3 font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Valor</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden lg:table-cell">Agente</th>
                      <th className="text-left p-3 font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">Data Criação</th>
                      <th className="text-center p-3 font-semibold text-gray-700 dark:text-gray-300">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLeads.map((lead, idx) => {
                      const leadValue = getLeadValue(lead);
                      const displayName = lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social || 'Sem nome';
                      const subName = (lead.nomeFantasia || lead.nome_fantasia) && (lead.razaoSocial || lead.razao_social) && (lead.nomeFantasia || lead.nome_fantasia) !== (lead.razaoSocial || lead.razao_social)
                        ? (lead.razaoSocial || lead.razao_social)
                        : null;
                      const createdDate = lead.createdDate || lead.createdAt || lead.created_date;

                      return (
                        <tr
                          key={lead.id}
                          className={`border-b cursor-pointer hover:bg-indigo-50 dark:hover:bg-gray-800 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-950'}`}
                          onClick={() => navigate(`${createPageUrl("LeadPJDetail")}?id=${lead.id}`)}
                        >
                          <td className="p-3">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{displayName}</div>
                            {subName && <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">{subName}</div>}
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                            {lead.phone || lead.contactPhone || lead.contact_phone || '-'}
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                            <span className="truncate max-w-[180px] inline-block">{lead.email || '-'}</span>
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                            {formatCNPJ(lead.cnpj)}
                          </td>
                          <td className="p-3">
                            <Badge className={`${getStageColor(lead.stage)} text-xs`}>
                              {getStageLabel(lead.stage)}
                            </Badge>
                          </td>
                          <td className="p-3 text-right text-gray-700 dark:text-gray-300 hidden md:table-cell">
                            {leadValue > 0 ? formatCurrency(leadValue) : '-'}
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400 hidden lg:table-cell">
                            {getAgentName(lead.agentId || lead.agent_id)}
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400 hidden md:table-cell">
                            {createdDate && !isNaN(new Date(createdDate))
                              ? format(new Date(createdDate), "dd/MM/yyyy", { locale: ptBR })
                              : '-'}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`${createPageUrl("LeadPJDetail")}?id=${lead.id}`);
                              }}
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Mostrando {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, totalResults)} de {totalResults} empresa(s)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Anterior
                </Button>
                <span className="text-sm text-gray-700 dark:text-gray-300 px-2">
                  Página {safePage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="gap-1"
                >
                  Próxima
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
