import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  TrendingUp,
  DollarSign,
  Users,
  Download,
  BarChart3,
  Target,
  CheckCircle,
  XCircle,
  Clock,
  UserCheck,
  Trophy,
  ShieldX
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RePieChart, Pie, Cell } from 'recharts';
import { format, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { hasFullVisibility, hasTeamVisibility, getVisibleAgentIds, getDataVisibilityKey, canAccessReports, getVisibleTeams, getVisibleAgentsForFilter } from "@/components/utils/permissions";
import DashboardFilters from "@/components/dashboard/DashboardFilters";
import { LEAD_PJ_STAGES } from "@/constants/stages";

const STAGES_PJ = LEAD_PJ_STAGES;

const COLORS = ['#3b82f6', '#8b5cf6', '#6366f1', '#eab308', '#22c55e', '#ef4444'];

export default function SalesPJReports() {
  const [selectedPeriod, setSelectedPeriod] = useState("thisMonth");
  const [dateRange, setDateRange] = useState({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [selectedStage, setSelectedStage] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user,
  });

  const currentAgent = user?.agent;
  const isAdmin = hasFullVisibility(currentAgent);
  const isSupervisor = hasTeamVisibility(currentAgent) && !isAdmin;
  const hasPermission = isAdmin || isSupervisor || canAccessReports(currentAgent);

  const { data: leadsPJ = [] } = useQuery({
    queryKey: ['leadsPJ-reports', getDataVisibilityKey(user, currentAgent)],
    queryFn: async () => {
      const allLeads = await base44.entities.LeadPJ.list('-createdDate');
      
      if (hasFullVisibility(currentAgent)) {
        return allLeads;
      }

      if (!currentAgent) return allLeads;

      const visibleIds = getVisibleAgentIds(currentAgent, allAgents, teams);
      return allLeads.filter(l => visibleIds.includes(l.agentId || l.agent_id));
    },
    enabled: hasPermission && !!user && (isAdmin || isSupervisor || !!currentAgent),
  });

  const visibleAgents = useMemo(() => {
    return getVisibleAgentsForFilter(currentAgent, allAgents);
  }, [currentAgent, allAgents]);

  const visibleTeamsList = useMemo(() => {
    return getVisibleTeams(currentAgent, teams, allAgents);
  }, [currentAgent, teams, allAgents]);

  const salesAgents = useMemo(() => {
    return visibleAgents.filter(a => {
      const agentType = a.agentType || a.agent_type;
      return agentType === 'sales' || agentType === 'pre_sales' || agentType === 'sales_supervisor' || agentType === 'admin';
    });
  }, [visibleAgents]);

  const displayAgents = useMemo(() => {
    if (!selectedTeam) return salesAgents;
    return salesAgents.filter(a => String(a.teamId || a.team_id) === String(selectedTeam));
  }, [salesAgents, selectedTeam]);

  const filteredLeads = useMemo(() => {
    const teamAgentIds = selectedTeam ? displayAgents.map(a => String(a.id)) : null;

    return leadsPJ.filter(lead => {
      const leadDate = new Date(lead.createdAt || lead.created_at || lead.createdDate);
      
      if (dateRange?.from) {
        const start = new Date(dateRange.from);
        start.setHours(0, 0, 0, 0);
        if (leadDate < start) return false;
      }
      
      if (dateRange?.to) {
        const end = new Date(dateRange.to);
        end.setHours(23, 59, 59, 999);
        if (leadDate > end) return false;
      }

      if (selectedAgent && (lead.agentId || lead.agent_id) !== selectedAgent) return false;
      if (selectedStage && lead.stage !== selectedStage) return false;

      if (teamAgentIds && !selectedAgent) {
        const leadAgentId = String(lead.agentId || lead.agent_id);
        if (!teamAgentIds.includes(leadAgentId)) return false;
      }

      return true;
    });
  }, [leadsPJ, dateRange, selectedAgent, selectedStage, selectedTeam, displayAgents]);

  const getLeadValue = (lead) => {
    return parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || 0;
  };

  const totalLeads = filteredLeads.length;
  const leadsAtivos = filteredLeads.filter(l => !['fechado_ganho', 'fechado_perdido'].includes(l.stage)).length;
  const leadsFechados = filteredLeads.filter(l => l.stage === 'fechado_ganho').length;
  const leadsPerdidos = filteredLeads.filter(l => l.stage === 'fechado_perdido').length;
  const totalValue = filteredLeads.reduce((sum, l) => sum + getLeadValue(l), 0);
  const totalFechado = filteredLeads.filter(l => l.stage === 'fechado_ganho').reduce((sum, l) => sum + getLeadValue(l), 0);
  const avgTicket = leadsFechados > 0 ? totalFechado / leadsFechados : 0;
  const taxaConversao = totalLeads > 0 ? ((leadsFechados / totalLeads) * 100).toFixed(1) : 0;

  const stageData = STAGES_PJ.map(stage => ({
    name: stage.label,
    value: filteredLeads.filter(l => l.stage === stage.id).length,
    color: stage.color,
  }));

  const agentStats = useMemo(() => {
    return salesAgents.map(agent => {
      const agentLeads = filteredLeads.filter(l => (l.agentId || l.agent_id) === agent.id);
      const working = agentLeads.filter(l => !['fechado_ganho', 'fechado_perdido'].includes(l.stage));
      const won = agentLeads.filter(l => l.stage === 'fechado_ganho');
      const lost = agentLeads.filter(l => l.stage === 'fechado_perdido');
      const revenue = won.reduce((sum, l) => sum + getLeadValue(l), 0);
      const conversionRate = agentLeads.length > 0 ? ((won.length / agentLeads.length) * 100).toFixed(1) : 0;

      return {
        agent,
        total: agentLeads.length,
        working: working.length,
        won: won.length,
        lost: lost.length,
        revenue,
        conversionRate: parseFloat(conversionRate)
      };
    }).filter(stat => stat.total > 0);
  }, [salesAgents, filteredLeads]);

  const porteData = [
    { name: 'MEI', value: filteredLeads.filter(l => l.porte === 'MEI').length },
    { name: 'ME', value: filteredLeads.filter(l => l.porte === 'ME').length },
    { name: 'EPP', value: filteredLeads.filter(l => l.porte === 'EPP').length },
    { name: 'Médio', value: filteredLeads.filter(l => l.porte === 'Médio').length },
    { name: 'Grande', value: filteredLeads.filter(l => l.porte === 'Grande').length },
  ].filter(p => p.value > 0);

  const sortedAgentStats = [...agentStats].sort((a, b) => b.won - a.won);
  const topPerformer = sortedAgentStats[0];

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const handleClearFilters = () => {
    setSelectedPeriod("all");
    setDateRange({ from: null, to: null });
    setSelectedAgent(null);
    setSelectedStage(null);
    setSelectedTeam(null);
  };

  const handleExport = () => {
    if (filteredLeads.length === 0) {
      alert('Nenhum lead para exportar');
      return;
    }

    const periodLabel = dateRange?.from && dateRange?.to 
      ? `${format(dateRange.from, 'dd/MM/yyyy', { locale: ptBR })} a ${format(dateRange.to, 'dd/MM/yyyy', { locale: ptBR })}`
      : 'Todo o período';

    const csvData = [
      ['RELATÓRIO DE VENDAS PJ'],
      [`Período: ${periodLabel}`],
      [''],
      ['Razão Social', 'Nome Fantasia', 'CNPJ', 'Telefone', 'Email', 'Cidade', 'Estado', 'Porte', 'Stage', 'Valor Estimado', 'Status', 'Data Criação'],
      ...filteredLeads.map(lead => [
        lead.razaoSocial || '',
        lead.nomeFantasia || '',
        lead.cnpj || '',
        lead.phone || '',
        lead.email || '',
        lead.city || '',
        lead.state || '',
        lead.porte || '',
        STAGES_PJ.find(s => s.id === lead.stage)?.label || '',
        lead.value || 0,
        lead.stage === 'fechado_ganho' ? 'Concluído' : lead.stage === 'fechado_perdido' ? 'Perdido' : 'Ativo',
        lead.createdAt ? new Date(lead.createdAt).toLocaleDateString('pt-BR') : '',
      ])
    ].map(row => row.join(';')).join('\n');

    const blob = new Blob(['\ufeff' + csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_vendas_pj_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar os relatórios de vendas PJ.
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
            <BarChart3 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
            Relatórios de Vendas PJ
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Análise completa do pipeline B2B
          </p>
        </div>
        <Button onClick={handleExport} className="bg-green-600 hover:bg-green-700">
          <Download className="w-4 h-4 mr-2" />
          Exportar CSV
        </Button>
      </div>

      <DashboardFilters
        agents={displayAgents}
        stages={STAGES_PJ}
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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Empresas</p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{totalLeads}</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-xl">
                <Building2 className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Vendas Fechadas</p>
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(totalFechado)}
                </p>
                <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">{leadsFechados} vendas</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl">
                <Trophy className="w-8 h-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Em Atendimento</p>
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{leadsAtivos}</p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded-xl">
                <Clock className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Fechados</p>
                <p className="text-3xl font-bold text-green-600 dark:text-green-400">{leadsFechados}</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-xl">
                <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Perdidos</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">{leadsPerdidos}</p>
              </div>
              <div className="p-3 bg-red-100 dark:bg-red-950 rounded-xl">
                <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-lg transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Taxa Conversão</p>
                <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{taxaConversao}%</p>
              </div>
              <div className="p-3 bg-indigo-100 dark:bg-indigo-950 rounded-xl">
                <Target className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
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
                  {formatCurrency(avgTicket)}
                </p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <DollarSign className="w-8 h-8 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {topPerformer && (
        <Card className="border-2 border-yellow-300 dark:border-yellow-700 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-yellow-400 dark:bg-yellow-600 rounded-full">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">TOP PERFORMER DO PERÍODO</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{topPerformer.agent.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {topPerformer.won} vendas fechadas • {topPerformer.conversionRate}% conversão • {formatCurrency(topPerformer.revenue)} em receita
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100">Funil de Vendas B2B</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={stageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#6366f1" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-gray-900 dark:text-gray-100">Distribuição por Porte</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RePieChart>
                <Pie
                  data={porteData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {porteData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RePieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <UserCheck className="w-5 h-5" />
            Performance por Agente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Agente
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Empresas
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Ativas
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Fechadas
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Perdidas
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Taxa Conversão
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Receita
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {sortedAgentStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                      Nenhum dado disponível para o período selecionado
                    </td>
                  </tr>
                ) : (
                  sortedAgentStats.map((stat, idx) => (
                    <tr key={stat.agent.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-sm">
                              {stat.agent.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-gray-100">{stat.agent.name}</p>
                            {idx === 0 && <Badge className="bg-yellow-100 text-yellow-700 text-xs mt-1">Top</Badge>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="outline" className="font-semibold">{stat.total}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                          {stat.working}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                          {stat.won}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                          {stat.lost}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <span className={`font-semibold ${
                          stat.conversionRate >= 30 ? 'text-green-600 dark:text-green-400' :
                          stat.conversionRate >= 15 ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-red-600 dark:text-red-400'
                        }`}>
                          {stat.conversionRate}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right font-semibold text-green-600 dark:text-green-400">
                        {formatCurrency(stat.revenue)}
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
