import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Activity,
  Clock,
  MessageSquare,
  Bell,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Trash2,
  Search,
  User,
  Phone,
  Play,
  FileText,
  X,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Info,
  UserCheck,
  ExternalLink
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function AutomationLogsPanel({ automationType, colorScheme = "amber" }) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedLogs, setExpandedLogs] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 15;

  const colorClasses = {
    yellow: {
      button: "bg-yellow-600 hover:bg-yellow-700 text-white",
      iconBg: "bg-yellow-100 dark:bg-yellow-950",
      icon: "text-yellow-600 dark:text-yellow-400",
      tabActive: "data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700 dark:data-[state=active]:bg-yellow-950 dark:data-[state=active]:text-yellow-400",
    },
    indigo: {
      button: "bg-indigo-600 hover:bg-indigo-700 text-white",
      iconBg: "bg-indigo-100 dark:bg-indigo-950",
      icon: "text-indigo-600 dark:text-indigo-400",
      tabActive: "data-[state=active]:bg-indigo-100 data-[state=active]:text-indigo-700 dark:data-[state=active]:bg-indigo-950 dark:data-[state=active]:text-indigo-400",
    },
    amber: {
      button: "bg-amber-600 hover:bg-amber-700 text-white",
      iconBg: "bg-amber-100 dark:bg-amber-950",
      icon: "text-amber-600 dark:text-amber-400",
      tabActive: "data-[state=active]:bg-amber-100 data-[state=active]:text-amber-700 dark:data-[state=active]:bg-amber-950 dark:data-[state=active]:text-amber-400",
    }
  };

  const colors = colorClasses[colorScheme] || colorClasses.amber;

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['automationLogs', automationType],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('automationType', automationType);
      
      const response = await fetch(`/api/whatsapp/automation-logs?${params.toString()}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (!response.ok) throw new Error('Erro ao carregar logs');
      return response.json();
    },
    enabled: isOpen,
    refetchInterval: isOpen ? 10000 : false
  });

  const runAutomationsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/whatsapp/run-automations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
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
      const response = await fetch(`/api/whatsapp/automation-logs?automationType=${automationType}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      if (!response.ok) throw new Error('Falha ao limpar logs');
      return response.json();
    },
    onSuccess: () => {
      toast.success('Logs limpos com sucesso!');
      queryClient.invalidateQueries(['automationLogs']);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const getStatusInfo = (status, success) => {
    if (success || status === 'executed' || status === 'sent') {
      return { 
        badge: <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Enviado</Badge>,
        type: 'success'
      };
    }
    if (status === 'pending') {
      return { 
        badge: <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 text-xs gap-1"><Clock className="w-3 h-3" />Pendente</Badge>,
        type: 'pending'
      };
    }
    if (status === 'skipped') {
      return { 
        badge: <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300 text-xs gap-1"><SkipForward className="w-3 h-3" />Ignorado</Badge>,
        type: 'skipped'
      };
    }
    return { 
      badge: <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300 text-xs gap-1"><XCircle className="w-3 h-3" />Erro</Badge>,
      type: 'error'
    };
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

  const parseActionResult = (log) => {
    try {
      const result = typeof log.action_result === 'string' 
        ? JSON.parse(log.action_result || '{}') 
        : log.action_result || {};
      return {
        ...log,
        automation_name: result.automation_name || 'Automação',
        lead_name: result.lead_name,
        lead_phone: result.lead_phone,
        agent_name: result.agent_name || log.agent_name,
        agent_id: result.agent_id || log.agent_id,
        status: result.status || (log.success ? 'executed' : 'error'),
        message: result.message,
        raw_result: result
      };
    } catch {
      return {
        ...log,
        automation_name: 'Automação',
        status: log.success ? 'executed' : 'error',
        raw_result: {}
      };
    }
  };

  const toggleExpand = (logId) => {
    setExpandedLogs(prev => ({
      ...prev,
      [logId]: !prev[logId]
    }));
  };

  const enrichedLogs = Array.isArray(logs) ? logs.map(parseActionResult) : [];

  const filterByTab = (log) => {
    const statusInfo = getStatusInfo(log.status, log.success);
    switch (activeTab) {
      case 'success': return statusInfo.type === 'success';
      case 'error': return statusInfo.type === 'error';
      case 'skipped': return statusInfo.type === 'skipped';
      case 'pending': return statusInfo.type === 'pending';
      default: return true;
    }
  };

  const filterBySearch = (log) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.lead_name?.toLowerCase().includes(term) ||
      log.automation_name?.toLowerCase().includes(term) ||
      log.lead_phone?.includes(searchTerm) ||
      log.agent_name?.toLowerCase().includes(term)
    );
  };

  const filteredLogs = enrichedLogs.filter(log => filterByTab(log) && filterBySearch(log));

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);
  const paginatedLogs = filteredLogs.slice(
    (currentPage - 1) * logsPerPage,
    currentPage * logsPerPage
  );

  const stats = {
    total: enrichedLogs.length,
    success: enrichedLogs.filter(l => getStatusInfo(l.status, l.success).type === 'success').length,
    errors: enrichedLogs.filter(l => getStatusInfo(l.status, l.success).type === 'error').length,
    skipped: enrichedLogs.filter(l => getStatusInfo(l.status, l.success).type === 'skipped').length,
    pending: enrichedLogs.filter(l => getStatusInfo(l.status, l.success).type === 'pending').length
  };

  const handleTabChange = (value) => {
    setActiveTab(value);
    setCurrentPage(1);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <FileText className="w-4 h-4" />
        Ver Logs
        {stats.total > 0 && (
          <Badge variant="secondary" className="ml-1 text-xs">{stats.total}</Badge>
        )}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="fixed inset-0 bg-black/50" 
            onClick={() => setIsOpen(false)}
          />
          <div className="relative z-50 w-full max-w-5xl mx-4 bg-white dark:bg-gray-900 rounded-lg shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <Activity className={`w-5 h-5 ${colors.icon}`} />
                Logs de Automações
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isLoading}
                  className="gap-1"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Atualizar
                </Button>
                <Button
                  onClick={() => runAutomationsMutation.mutate()}
                  disabled={runAutomationsMutation.isPending}
                  size="sm"
                  className={`gap-1 ${colors.button}`}
                >
                  {runAutomationsMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  Executar Agora
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-hidden flex flex-col">
              <div className="grid grid-cols-5 gap-3">
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
                    <p className="font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Enviados</p>
                    <p className="font-bold text-green-600 dark:text-green-400">{stats.success}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Erros</p>
                    <p className="font-bold text-red-600 dark:text-red-400">{stats.errors}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <SkipForward className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Ignorados</p>
                    <p className="font-bold text-gray-600 dark:text-gray-400">{stats.skipped}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pendentes</p>
                    <p className="font-bold text-yellow-600 dark:text-yellow-400">{stats.pending}</p>
                  </div>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <TabsList className="grid grid-cols-5 w-auto">
                    <TabsTrigger value="all" className={colors.tabActive}>
                      Todos ({stats.total})
                    </TabsTrigger>
                    <TabsTrigger value="success" className="data-[state=active]:bg-green-100 data-[state=active]:text-green-700">
                      Enviados ({stats.success})
                    </TabsTrigger>
                    <TabsTrigger value="error" className="data-[state=active]:bg-red-100 data-[state=active]:text-red-700">
                      Erros ({stats.errors})
                    </TabsTrigger>
                    <TabsTrigger value="skipped" className="data-[state=active]:bg-gray-200 data-[state=active]:text-gray-700">
                      Ignorados ({stats.skipped})
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="data-[state=active]:bg-yellow-100 data-[state=active]:text-yellow-700">
                      Pendentes ({stats.pending})
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        className="pl-9 w-56"
                      />
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={enrichedLogs.length === 0}
                          className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                          Limpar
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
                          <AlertDialogAction 
                            onClick={() => clearLogsMutation.mutate()}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Confirmar
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>

                <TabsContent value={activeTab} className="mt-4">
                  <div className="border rounded-lg dark:border-gray-700 overflow-hidden">
                    {isLoading ? (
                      <div className="flex items-center justify-center h-64">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                      </div>
                    ) : paginatedLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-64 text-center p-4">
                        <Activity className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-3" />
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Nenhum log encontrado</p>
                        <p className="text-gray-500 dark:text-gray-500 text-sm mt-1">
                          {searchTerm ? 'Tente ajustar sua busca' : 'As automações ainda não foram executadas'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[400px] overflow-y-auto">
                          <div className="divide-y dark:divide-gray-700">
                            {paginatedLogs.map(log => {
                              const statusInfo = getStatusInfo(log.status, log.success);
                              const isExpanded = expandedLogs[log.id];
                              
                              return (
                                <div key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                  <div 
                                    className="p-3 cursor-pointer"
                                    onClick={() => toggleExpand(log.id)}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className={`p-2 rounded-lg ${
                                          statusInfo.type === 'success' ? 'bg-green-100 dark:bg-green-900/50' :
                                          statusInfo.type === 'error' ? 'bg-red-100 dark:bg-red-900/50' :
                                          statusInfo.type === 'skipped' ? 'bg-gray-100 dark:bg-gray-800' :
                                          'bg-yellow-100 dark:bg-yellow-900/50'
                                        }`}>
                                          {getActionIcon(log.action_type)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                              {log.automation_name}
                                            </span>
                                            {statusInfo.badge}
                                          </div>
                                          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                                            {log.lead_name && (
                                              <span className="flex items-center gap-1">
                                                <User className="w-3 h-3" />
                                                {log.lead_name}
                                              </span>
                                            )}
                                            {log.lead_phone && (
                                              <span className="flex items-center gap-1">
                                                <Phone className="w-3 h-3" />
                                                {log.lead_phone}
                                              </span>
                                            )}
                                            {log.agent_name && (
                                              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                                <UserCheck className="w-3 h-3" />
                                                {log.agent_name}
                                              </span>
                                            )}
                                          </div>
                                          {log.error_message && (
                                            <div className="flex items-start gap-1 mt-1.5 text-xs text-red-600 dark:text-red-400">
                                              <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                              <span className="line-clamp-1">{log.error_message}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                          {(log.executed_at || log.created_at) && format(new Date(log.executed_at || log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                        </span>
                                        {isExpanded ? (
                                          <ChevronUp className="w-4 h-4 text-gray-400" />
                                        ) : (
                                          <ChevronDown className="w-4 h-4 text-gray-400" />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {isExpanded && (
                                    <div className="px-3 pb-3 ml-12">
                                      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 space-y-3">
                                        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-1">
                                          <Info className="w-3 h-3" />
                                          Detalhes da Execução
                                        </h4>
                                        
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">ID do Log</p>
                                            <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate" title={log.id}>
                                              {log.id?.slice(0, 8)}...
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Tipo de Ação</p>
                                            <p className="text-gray-700 dark:text-gray-300">
                                              {log.action_type === 'send_whatsapp' ? 'WhatsApp' : 
                                               log.action_type === 'internal_alert' ? 'Alerta Interno' : log.action_type}
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Lead/Indicação ID</p>
                                            <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate" title={log.lead_id}>
                                              {log.lead_id?.slice(0, 8)}...
                                            </p>
                                          </div>
                                          <div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Automação ID</p>
                                            <p className="font-mono text-xs text-gray-700 dark:text-gray-300 truncate" title={log.automation_id}>
                                              {log.automation_id?.slice(0, 8)}...
                                            </p>
                                          </div>
                                        </div>

                                        {log.agent_name && (
                                          <div className="pt-2 border-t dark:border-gray-700">
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Atendente Responsável</p>
                                            <div className="flex items-center gap-2">
                                              <UserCheck className="w-4 h-4 text-blue-600" />
                                              <span className="text-sm text-gray-700 dark:text-gray-300">{log.agent_name}</span>
                                              {log.agent_id && (
                                                <span className="text-xs text-gray-400 font-mono">({log.agent_id.slice(0, 8)}...)</span>
                                              )}
                                            </div>
                                          </div>
                                        )}

                                        {log.message && (
                                          <div className="pt-2 border-t dark:border-gray-700">
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Mensagem/Template</p>
                                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-white dark:bg-gray-900 p-2 rounded border dark:border-gray-700">
                                              {log.message}
                                            </p>
                                          </div>
                                        )}

                                        {log.error_message && (
                                          <div className="pt-2 border-t dark:border-gray-700">
                                            <p className="text-xs text-red-500 mb-1">Mensagem de Erro</p>
                                            <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50 p-2 rounded">
                                              {log.error_message}
                                            </p>
                                          </div>
                                        )}

                                        {log.raw_result?.api_response && (
                                          <div className="pt-2 border-t dark:border-gray-700">
                                            <p className="text-xs text-green-600 dark:text-green-400 mb-1 font-medium">Resposta da API WHU</p>
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-200 dark:border-green-900 overflow-x-auto max-h-48">
                                              {JSON.stringify(log.raw_result.api_response, null, 2)}
                                            </pre>
                                          </div>
                                        )}

                                        {log.raw_result && Object.keys(log.raw_result).length > 0 && (
                                          <div className="pt-2 border-t dark:border-gray-700">
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Dados Completos do Log</p>
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 p-2 rounded border dark:border-gray-700 overflow-x-auto max-h-32">
                                              {JSON.stringify(log.raw_result, null, 2)}
                                            </pre>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {totalPages > 1 && (
                          <div className="flex items-center justify-between p-3 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              Página {currentPage} de {totalPages} ({filteredLogs.length} registros)
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                              >
                                Início
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                              >
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                              >
                                Fim
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
