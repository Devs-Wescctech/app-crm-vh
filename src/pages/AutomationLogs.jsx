import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Activity,
  Clock,
  MessageSquare,
  Bell,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Search,
  User,
  Phone,
  Filter,
  Play
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function AutomationLogs() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState({
    automationType: 'all',
    status: 'all',
    search: ''
  });

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['automationLogs', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.automationType !== 'all') params.append('automationType', filters.automationType);
      if (filters.status !== 'all') params.append('status', filters.status);
      
      const response = await fetch(`/api/whatsapp/automation-logs?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      return response.json();
    },
    refetchInterval: 30000
  });

  const runAutomationsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/whatsapp/run-automations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Falha ao executar automações');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Automações executadas com sucesso!');
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      const params = filters.automationType !== 'all' 
        ? `?automationType=${filters.automationType}` 
        : '';
      const response = await fetch(`/api/whatsapp/automation-logs${params}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (!response.ok) throw new Error('Falha ao limpar logs');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Logs limpos com sucesso!');
      queryClient.invalidateQueries(['automationLogs']);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'executed':
      case 'success':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Executado</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"><XCircle className="w-3 h-3 mr-1" />Erro</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getActionIcon = (actionType) => {
    switch (actionType) {
      case 'send_whatsapp':
        return <MessageSquare className="w-4 h-4 text-green-600" />;
      case 'internal_alert':
        return <Bell className="w-4 h-4 text-yellow-600" />;
      default:
        return <Activity className="w-4 h-4 text-gray-600" />;
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'lead': return 'Vendas PF';
      case 'lead_pj': return 'Vendas PJ';
      case 'referral': return 'Indicações';
      default: return type;
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'lead': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300';
      case 'lead_pj': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300';
      case 'referral': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const parseActionResult = (log) => {
    const result = typeof log.action_result === 'string' 
      ? JSON.parse(log.action_result) 
      : log.action_result || {};
    return {
      ...log,
      automation_name: result.automation_name || 'Automação',
      lead_name: result.lead_name,
      lead_phone: result.lead_phone,
      status: result.status || (log.success ? 'executed' : 'error'),
      message: result.message
    };
  };

  const enrichedLogs = logs.map(parseActionResult);

  const filteredLogs = enrichedLogs.filter(log => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        log.lead_name?.toLowerCase().includes(searchLower) ||
        log.automation_name?.toLowerCase().includes(searchLower) ||
        log.lead_phone?.includes(filters.search)
      );
    }
    return true;
  });

  const stats = {
    total: enrichedLogs.length,
    pending: enrichedLogs.filter(l => l.status === 'pending').length,
    executed: enrichedLogs.filter(l => l.status === 'executed' || l.status === 'sent' || l.success).length,
    errors: enrichedLogs.filter(l => l.status === 'error' || (!l.success && l.error_message)).length
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Activity className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              Logs de Automações
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Acompanhe todas as execuções de automações do sistema
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              onClick={() => runAutomationsMutation.mutate()}
              disabled={runAutomationsMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {runAutomationsMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Executar Agora
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <Activity className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Total de Logs</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-950 rounded-lg">
                  <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Executados</p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.executed}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-yellow-100 dark:bg-yellow-950 rounded-lg">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Pendentes</p>
                  <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 dark:bg-red-950 rounded-lg">
                  <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Erros</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.errors}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white dark:bg-gray-900">
          <CardHeader className="border-b dark:border-gray-800">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Filter className="w-5 h-5" />
                Filtros
              </CardTitle>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" disabled={logs.length === 0}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Limpar Logs
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limpar todos os logs?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. Todos os logs de automação serão removidos permanentemente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => clearLogsMutation.mutate()}>
                      Confirmar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nome ou telefone..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-9"
                />
              </div>
              <Select
                value={filters.automationType}
                onValueChange={(val) => setFilters({ ...filters, automationType: val })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  <SelectItem value="lead">Vendas PF</SelectItem>
                  <SelectItem value="lead_pj">Vendas PJ</SelectItem>
                  <SelectItem value="referral">Indicações</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={filters.status}
                onValueChange={(val) => setFilters({ ...filters, status: val })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                  <SelectItem value="executed">Executado</SelectItem>
                  <SelectItem value="error">Erro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white dark:bg-gray-900">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                <p className="text-gray-600 dark:text-gray-400 font-medium">Nenhum log encontrado</p>
                <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
                  As automações ainda não foram executadas ou os filtros não retornaram resultados.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="divide-y dark:divide-gray-800">
                  {filteredLogs.map(log => (
                    <div key={log.id} className="p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                            {getActionIcon(log.action_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {log.automation_name || 'Automação'}
                              </span>
                              <Badge className={getTypeColor(log.automation_type)}>
                                {getTypeLabel(log.automation_type)}
                              </Badge>
                              {getStatusBadge(log.status)}
                            </div>
                            {log.lead_name && (
                              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                                <span className="flex items-center gap-1">
                                  <User className="w-3 h-3" />
                                  {log.lead_name}
                                </span>
                                {log.lead_phone && (
                                  <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {log.lead_phone}
                                  </span>
                                )}
                              </div>
                            )}
                            {log.message && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                {log.message}
                              </p>
                            )}
                            {log.error_message && (
                              <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                                Erro: {log.error_message}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right text-sm text-gray-500 dark:text-gray-500 whitespace-nowrap">
                          {(log.executed_at || log.created_at) && format(new Date(log.executed_at || log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
