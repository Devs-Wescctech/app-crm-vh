import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  TrendingUp,
  DollarSign,
  Target,
  Building2,
  CheckCircle,
  Clock,
  ArrowUpRight,
  Briefcase,
  Calendar,
  XCircle,
  Activity,
  BarChart3,
} from "lucide-react";
import { format, isToday, isThisWeek, isThisMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LEAD_PJ_STAGES } from "@/constants/stages";

const fmtCurrency = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.08 } }
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

const STAGES_PJ = LEAD_PJ_STAGES;

export default function MyDashboardPJ() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;

  const { data: rawLeads = [], isLoading: leadsLoading } = useQuery({
    queryKey: ['my-leads-pj', currentAgent?.id],
    queryFn: async () => {
      const allLeads = await base44.entities.LeadPJ.list('-createdDate');
      return allLeads.filter(l => (l.agentId || l.agent_id) === currentAgent?.id);
    },
    enabled: !!currentAgent,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['my-activities-pj', currentAgent?.id],
    queryFn: async () => {
      const all = await base44.entities.ActivityPJ.list('-scheduledDate', 200);
      return all.filter(a => (a.agentId || a.agent_id) === currentAgent?.id);
    },
    enabled: !!currentAgent,
  });

  const getLeadValue = (lead) =>
    parseFloat(lead.value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_value) || 0;

  const totalLeads = rawLeads.length;
  const leadsAtivos = rawLeads.filter(l => l.stage !== 'fechado_ganho' && l.stage !== 'fechado_perdido' && !l.lost && !l.concluded).length;
  const vendas = rawLeads.filter(l => l.stage === 'fechado_ganho').length;
  const perdidos = rawLeads.filter(l => l.stage === 'fechado_perdido' || l.lost).length;
  const taxaConversao = totalLeads > 0 ? ((vendas / totalLeads) * 100).toFixed(1) : 0;
  const receitaTotal = rawLeads
    .filter(l => l.stage === 'fechado_ganho')
    .reduce((sum, l) => sum + getLeadValue(l), 0);
  const ticketMedio = vendas > 0 ? receitaTotal / vendas : 0;

  const pendingTasks = activities.filter(a => !a.completed && a.type !== 'note');
  const todayTasks = pendingTasks.filter(a => {
    const d = a.scheduledDate || a.scheduled_date;
    if (!d) return false;
    try { return isToday(parseISO(d)); } catch { return false; }
  });
  const overdueTasks = pendingTasks.filter(a => {
    const d = a.scheduledDate || a.scheduled_date;
    if (!d) return false;
    try { return parseISO(d) < new Date() && !isToday(parseISO(d)); } catch { return false; }
  });

  const pipelineData = STAGES_PJ
    .filter(s => s.id !== 'fechado_perdido')
    .map(stage => ({
      ...stage,
      count: rawLeads.filter(l => l.stage === stage.id && !l.lost && !l.concluded).length,
      value: rawLeads
        .filter(l => l.stage === stage.id && !l.lost && !l.concluded)
        .reduce((sum, l) => sum + getLeadValue(l), 0),
    }));

  const thisMonthLeads = rawLeads.filter(l => {
    const d = l.createdAt || l.created_at || l.createdDate;
    if (!d) return false;
    try { return isThisMonth(parseISO(d)); } catch { return false; }
  });
  const thisMonthVendas = thisMonthLeads.filter(l => l.stage === 'fechado_ganho').length;

  if (leadsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: '#5A2A3C' }} />
          <p className="text-gray-500">Carregando seu dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="p-6 space-y-6 min-h-screen"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" style={{ background: 'linear-gradient(to right, #5A2A3C, #F98F6F)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Meu Dashboard
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Olá, {currentAgent?.name || 'Agente'}! Aqui está seu painel de vendas PJ.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={createPageUrl("SalesAgenda")}>
            <Button variant="outline" size="sm" className="gap-2">
              <Calendar className="w-4 h-4" />
              Minha Agenda
            </Button>
          </Link>
          <Link to={createPageUrl("LeadsPJKanban")}>
            <Button size="sm" className="gap-2 text-white" style={{ background: 'linear-gradient(to right, #5A2A3C, #F98F6F)' }}>
              <TrendingUp className="w-4 h-4" />
              Meu Pipeline
            </Button>
          </Link>
        </div>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-white dark:bg-gray-900 border-blue-200 dark:border-blue-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Leads Ativos</p>
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{leadsAtivos}</p>
                <p className="text-xs text-gray-500 mt-1">{totalLeads} total</p>
              </div>
              <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-xl">
                <Briefcase className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900 border-green-200 dark:border-green-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">Vendas Fechadas</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{vendas}</p>
                <p className="text-xs text-gray-500 mt-1">Conv: {taxaConversao}%</p>
              </div>
              <div className="p-3 bg-green-100 dark:bg-green-950 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900 border-purple-200 dark:border-purple-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Receita Total</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{fmtCurrency(receitaTotal)}</p>
                <p className="text-xs text-gray-500 mt-1">Ticket: {fmtCurrency(ticketMedio)}</p>
              </div>
              <div className="p-3 bg-purple-100 dark:bg-purple-950 rounded-xl">
                <DollarSign className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900 border-orange-200 dark:border-orange-800">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Este Mês</p>
                <p className="text-3xl font-bold text-orange-700 dark:text-orange-300">{thisMonthVendas}</p>
                <p className="text-xs text-gray-500 mt-1">{thisMonthLeads.length} leads novos</p>
              </div>
              <div className="p-3 bg-orange-100 dark:bg-orange-950 rounded-xl">
                <Target className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="grid md:grid-cols-2 gap-6">
        <Card className="bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-5 h-5" style={{ color: '#5A2A3C' }} />
              Meu Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {pipelineData.map(stage => {
              const maxCount = Math.max(...pipelineData.map(s => s.count), 1);
              const pct = (stage.count / maxCount) * 100;
              return (
                <div key={stage.id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">{stage.label}</span>
                    <span className="text-gray-500">{stage.count} leads · {fmtCurrency(stage.value)}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="h-2 rounded-full bg-gradient-to-r" style={{
                      width: `${pct}%`,
                      background: stage.id === 'fechado_ganho' ? '#22c55e' : 'linear-gradient(to right, #5A2A3C, #F98F6F)',
                    }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-5 h-5" style={{ color: '#F98F6F' }} />
              Minhas Tarefas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {overdueTasks.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-700 dark:text-red-300">Atrasadas</span>
                </div>
                <Badge className="bg-red-600 text-white">{overdueTasks.length}</Badge>
              </div>
            )}
            {todayTasks.length > 0 && (
              <div className="flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Hoje</span>
                </div>
                <Badge className="bg-amber-600 text-white">{todayTasks.length}</Badge>
              </div>
            )}
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Total pendentes</span>
              </div>
              <Badge className="bg-blue-600 text-white">{pendingTasks.length}</Badge>
            </div>
            <Link to={createPageUrl("SalesTasks")}>
              <Button variant="outline" size="sm" className="w-full mt-2 gap-2">
                <ArrowUpRight className="w-4 h-4" />
                Ver todas as tarefas
              </Button>
            </Link>
          </CardContent>
        </Card>
      </motion.div>

      {perdidos > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="bg-white dark:bg-gray-900 border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Leads Perdidos</p>
                    <p className="text-2xl font-bold text-red-600">{perdidos}</p>
                  </div>
                </div>
                <Link to={createPageUrl("SalesPJLostReport")}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowUpRight className="w-4 h-4" />
                    Ver relatório
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </motion.div>
  );
}
