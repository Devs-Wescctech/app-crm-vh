import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { hasFullVisibility, hasTeamVisibility, getVisibleAgentIds } from "@/components/utils/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Plus, 
  Activity, 
  User, 
  Flag, 
  CalendarDays, 
  FileText, 
  Loader2,
  Search,
  Filter,
  ListTodo,
  Target,
  TrendingUp,
  Trash2,
  ExternalLink,
  Phone,
  Pencil,
  MapPin,
  MessageSquare,
  Mail,
  MoreVertical,
  X,
  ArrowRight,
} from "lucide-react";
import { getAgentDisplayName } from "@/utils/agents";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, isValid, parseISO, isPast, isToday, isFuture } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import StatsCard from "@/components/dashboard/StatsCard";

const PRIORITY_CONFIG = {
  alta: { label: 'Alta', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  media: { label: 'Média', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400', dot: 'bg-yellow-500' },
  baixa: { label: 'Baixa', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400', dot: 'bg-blue-500' },
};

const ACTIVITY_TYPES = {
  task: { label: 'Tarefa', icon: CheckCircle2, color: 'bg-orange-500', gradient: 'from-orange-500 to-orange-600' },
  call: { label: 'Ligação', icon: Phone, color: 'bg-green-500', gradient: 'from-green-500 to-green-600' },
  visit: { label: 'Visita', icon: MapPin, color: 'bg-blue-500', gradient: 'from-blue-500 to-blue-600' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'bg-emerald-500', gradient: 'from-emerald-500 to-emerald-600' },
  email: { label: 'E-mail', icon: Mail, color: 'bg-purple-500', gradient: 'from-purple-500 to-purple-600' },
};

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todas', icon: ListTodo },
  { id: 'pending', label: 'Pendentes', icon: Clock },
  { id: 'overdue', label: 'Atrasadas', icon: AlertCircle },
  { id: 'today', label: 'Hoje', icon: Calendar },
  { id: 'completed', label: 'Concluídas', icon: CheckCircle2 },
];

export default function SalesTasks() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState(null);
  const [leadPopoverOpen, setLeadPopoverOpen] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    leadId: '',
    type: 'task',
    priority: 'media',
    scheduledAt: '',
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 1000 * 60 * 5,
  });

  const currentAgent = user?.agent;
  const isAdmin = hasFullVisibility(currentAgent);
  const isSupervisor = hasTeamVisibility(currentAgent) && !isAdmin;

  const { data: allActivities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ['activitiesPJ'],
    queryFn: () => base44.entities.ActivityPJ.list('-scheduledAt', 500),
    staleTime: 1000 * 60 * 2,
  });

  const activities = useMemo(() => {
    const EXCLUDED_TYPES = new Set(['note', 'stage_change']);
    const tasksOnly = allActivities.filter(a => !EXCLUDED_TYPES.has(a.type));

    if (hasFullVisibility(currentAgent)) return tasksOnly;
    if (!currentAgent) return [];

    const visibleIds = getVisibleAgentIds(currentAgent, allAgents, teams);

    if (hasTeamVisibility(currentAgent)) {
      return tasksOnly.filter(a => {
        const assignedTo = a.assignedTo || a.assigned_to;
        const createdBy = a.createdBy || a.created_by;
        return assignedTo ? visibleIds.includes(assignedTo) : (createdBy ? visibleIds.includes(createdBy) : false);
      });
    }
    return tasksOnly.filter(a => {
      const assignedTo = a.assignedTo || a.assigned_to;
      return assignedTo === currentAgent.id;
    });
  }, [allActivities, currentAgent, allAgents]);

  const { data: leadsPJ = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['leadsPJ'],
    queryFn: () => base44.entities.LeadPJ.list(),
    staleTime: 1000 * 60 * 2,
  });

  const allLeads = useMemo(() =>
    leadsPJ.map(l => ({ ...l, _leadType: 'pj' })),
  [leadsPJ]);

  const updateActivityMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActivityPJ.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
    },
  });

  const deleteActivityMutation = useMutation({
    mutationFn: (id) => base44.entities.ActivityPJ.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
      toast.success('Tarefa excluída!');
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityPJ.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
      toast.success('Atividade criada com sucesso!');
      setShowDialog(false);
      setFormData({ title: '', description: '', leadId: '', type: 'task', priority: 'media', scheduledAt: '' });
    },
    onError: (error) => {
      toast.error('Erro ao criar atividade: ' + error.message);
    },
  });

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      toast.error('Digite o título da atividade');
      return;
    }
    
    const leadId = formData.leadId && formData.leadId !== 'none' && formData.leadId !== '' ? formData.leadId : null;
    
    if (editingTask) {
      updateActivityMutation.mutate({
        id: editingTask.id,
        data: {
          type: formData.type,
          title: formData.title,
          description: formData.description || null,
          leadId: leadId,
          priority: formData.priority,
          scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null,
        }
      });
      toast.success('Atividade atualizada com sucesso!');
      setShowDialog(false);
      setEditingTask(null);
      setFormData({ title: '', description: '', leadId: '', type: 'task', priority: 'media', scheduledAt: '' });
    } else {
      createActivityMutation.mutate({
        type: formData.type,
        title: formData.title,
        description: formData.description || null,
        leadId: leadId,
        priority: formData.priority,
        scheduledAt: formData.scheduledAt ? new Date(formData.scheduledAt).toISOString() : null,
        completed: false,
      });
    }
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    const scheduledDate = task.scheduledAt ? new Date(task.scheduledAt) : null;
    setFormData({
      title: task.title || '',
      description: task.description || '',
      leadId: task.leadId ? String(task.leadId) : '',
      type: task.type || 'task',
      priority: task.priority || 'media',
      scheduledAt: scheduledDate && isValid(scheduledDate) 
        ? format(scheduledDate, "yyyy-MM-dd'T'HH:mm") 
        : '',
    });
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingTask(null);
    setFormData({ title: '', description: '', leadId: '', type: 'task', priority: 'media', scheduledAt: '' });
  };

  const handleDeleteClick = (task) => {
    setTaskToDelete(task);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (taskToDelete) {
      deleteActivityMutation.mutate(taskToDelete.id);
      setDeleteDialogOpen(false);
      setTaskToDelete(null);
    }
  };

  const tasks = activities;
  
  const pendingTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);
  const overdueTasks = pendingTasks.filter(t => {
    if (!t.scheduledAt) return false;
    const date = new Date(t.scheduledAt);
    return isValid(date) && isPast(date) && !isToday(date);
  });
  const todayTasks = pendingTasks.filter(t => {
    if (!t.scheduledAt) return false;
    const date = new Date(t.scheduledAt);
    return isValid(date) && isToday(date);
  });

  const handleToggleComplete = (taskId, currentStatus) => {
    updateActivityMutation.mutate({
      id: taskId,
      data: {
        completed: !currentStatus,
        completedAt: !currentStatus ? new Date().toISOString() : null
      }
    });
    toast.success(currentStatus ? 'Tarefa reaberta' : 'Tarefa concluída!');
  };

  const getLeadById = (leadId) => {
    if (!leadId) return null;
    return allLeads.find(l => l.id === leadId || String(l.id) === String(leadId));
  };

  const filteredLeadsForSearch = useMemo(() => {
    if (!leadSearchQuery) return allLeads;
    const query = leadSearchQuery.toLowerCase();
    return allLeads.filter(l => 
      l.name?.toLowerCase().includes(query) ||
      l.phone?.includes(query) ||
      l.email?.toLowerCase().includes(query) ||
      l.company_name?.toLowerCase().includes(query) ||
      l.companyName?.toLowerCase().includes(query)
    );
  }, [allLeads, leadSearchQuery]);

  const getFilteredTasks = () => {
    let filtered = tasks;

    switch (filter) {
      case 'pending':
        filtered = pendingTasks;
        break;
      case 'overdue':
        filtered = overdueTasks;
        break;
      case 'today':
        filtered = todayTasks;
        break;
      case 'completed':
        filtered = completedTasks;
        break;
      default:
        filtered = tasks;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title?.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        (getLeadById(t.leadId)?.nomeFantasia || getLeadById(t.leadId)?.razaoSocial || getLeadById(t.leadId)?.name || '').toLowerCase().includes(query)
      );
    }

    return filtered;
  };

  const filteredTasks = getFilteredTasks();
  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const formatTaskDate = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    if (!isValid(date)) return null;
    return format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  const getTaskStatus = (task) => {
    if (task.completed) return 'completed';
    if (!task.scheduledAt) return 'pending';
    const date = new Date(task.scheduledAt);
    if (!isValid(date)) return 'pending';
    if (isPast(date) && !isToday(date)) return 'overdue';
    if (isToday(date)) return 'today';
    return 'pending';
  };

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            Tarefas de Vendas
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gerencie suas atividades e follow-ups
          </p>
        </div>
        <Button 
          onClick={() => setShowDialog(true)}
          className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nova Tarefa
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-blue-100 text-sm font-medium">Total de Tarefas</p>
                  <p className="text-3xl font-bold mt-1">{tasks.length}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <ListTodo className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-500 to-orange-500 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-yellow-100 text-sm font-medium">Pendentes</p>
                  <p className="text-3xl font-bold mt-1">{pendingTasks.length}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <Clock className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-red-500 to-red-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-sm font-medium">Atrasadas</p>
                  <p className="text-3xl font-bold mt-1">{overdueTasks.length}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-0 shadow-lg bg-gradient-to-br from-green-500 to-green-600 text-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-100 text-sm font-medium">Concluídas</p>
                  <p className="text-3xl font-bold mt-1">{completedTasks.length}</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b bg-gray-50 dark:bg-gray-800/50">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar tarefas..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10 bg-white dark:bg-gray-900"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {FILTER_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const isActive = filter === opt.id;
                return (
                  <Button
                    key={opt.id}
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setFilter(opt.id); setCurrentPage(1); }}
                    className={isActive ? "bg-blue-600 hover:bg-blue-700" : ""}
                  >
                    <Icon className="w-4 h-4 mr-1" />
                    {opt.label}
                    {opt.id === 'overdue' && overdueTasks.length > 0 && (
                      <Badge className="ml-1 bg-red-500 text-white text-xs px-1.5">
                        {overdueTasks.length}
                      </Badge>
                    )}
                  </Button>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loadingActivities ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Nenhuma tarefa encontrada</h3>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {filter !== 'all' ? 'Tente mudar os filtros' : 'Crie sua primeira tarefa para começar'}
              </p>
              {filter === 'all' && (
                <Button onClick={() => setShowDialog(true)} className="mt-4">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Tarefa
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              <AnimatePresence>
                {paginatedTasks.map((task, index) => {
                  const lead = getLeadById(task.leadId);
                  const status = getTaskStatus(task);
                  const priorityConfig = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.media;

                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ delay: index * 0.05 }}
                      className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                        task.completed ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => handleToggleComplete(task.id, task.completed)}
                          className={`mt-1 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                            task.completed
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'
                          }`}
                        >
                          {task.completed && <CheckCircle2 className="w-4 h-4" />}
                        </button>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className={`font-medium text-gray-900 dark:text-gray-100 ${
                                task.completed ? 'line-through text-gray-500' : ''
                              }`}>
                                {task.title}
                              </h4>
                              {task.description && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                  {task.description}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {lead && (
                                <Link
                                  to={createPageUrl("LeadPJDetail", { id: lead.id })}
                                  className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                                >
                                  <User className="w-3.5 h-3.5" />
                                  <span className="max-w-[120px] truncate">{lead.nomeFantasia || lead.razaoSocial || lead.name || lead.contactName || 'Lead sem nome'}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-gray-400 hover:text-gray-600"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => handleEdit(task)} className="cursor-pointer">
                                    <Pencil className="w-4 h-4 mr-2 text-blue-500" />
                                    <span>Editar</span>
                                  </DropdownMenuItem>
                                  <DropdownMenuItem 
                                    onClick={() => handleDeleteClick(task)} 
                                    className="cursor-pointer text-red-600 focus:text-red-600"
                                  >
                                    <Trash2 className="w-4 h-4 mr-2" />
                                    <span>Excluir</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 mt-3 flex-wrap">
                            {(() => {
                              const typeConfig = ACTIVITY_TYPES[task.type] || ACTIVITY_TYPES.task;
                              const TypeIcon = typeConfig.icon;
                              return (
                                <Badge className={`${typeConfig.color} text-white`}>
                                  <TypeIcon className="w-3 h-3 mr-1" />
                                  {typeConfig.label}
                                </Badge>
                              );
                            })()}
                            <Badge className={priorityConfig.color}>
                              <div className={`w-1.5 h-1.5 rounded-full ${priorityConfig.dot} mr-1.5`} />
                              {priorityConfig.label}
                            </Badge>

                            {task.scheduledAt && (
                              <div className={`flex items-center gap-1.5 text-sm ${
                                status === 'overdue' 
                                  ? 'text-red-600 dark:text-red-400 font-medium' 
                                  : status === 'today'
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-gray-500 dark:text-gray-400'
                              }`}>
                                <Calendar className="w-3.5 h-3.5" />
                                {formatTaskDate(task.scheduledAt)}
                                {status === 'overdue' && (
                                  <Badge variant="destructive" className="ml-1 text-xs">
                                    Atrasada
                                  </Badge>
                                )}
                                {status === 'today' && (
                                  <Badge className="ml-1 text-xs bg-blue-100 text-blue-700">
                                    Hoje
                                  </Badge>
                                )}
                              </div>
                            )}

                            {(() => {
                              const original = task.originalAssignedTo || task.original_assigned_to;
                              const current = task.assignedTo || task.assigned_to;
                              if (!original || String(original) === String(current)) return null;
                              return (
                                <Badge
                                  variant="outline"
                                  className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800"
                                  title="Esta tarefa foi reatribuída"
                                >
                                  <ArrowRight className="w-3 h-3 mr-1" />
                                  Recebida de {getAgentDisplayName(original, allAgents)}
                                </Badge>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
          {filteredTasks.length > 0 && (
            <div className="flex items-center justify-between mt-4 px-4 pb-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Itens por página:</span>
                <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20 h-8">
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
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, filteredTasks.length)} de {filteredTasks.length}
                </span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                  Próximo
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={showDialog} onOpenChange={handleCloseDialog}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader className="pb-6 border-b">
            <SheetTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl text-white">
                {editingTask ? <Pencil className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              </div>
              {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
            </SheetTitle>
            <SheetDescription>
              {editingTask 
                ? 'Atualize as informações da tarefa' 
                : 'Crie uma nova tarefa ou follow-up para acompanhar suas atividades'}
            </SheetDescription>
          </SheetHeader>
          
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Título da Tarefa *
              </Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Ex: Ligar para cliente sobre proposta"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Descrição
              </Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Adicione detalhes importantes sobre esta tarefa..."
                rows={4}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                Vincular a um Lead
              </Label>
              <Popover open={leadPopoverOpen} onOpenChange={setLeadPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={leadPopoverOpen}
                    className="w-full h-11 justify-between font-normal"
                  >
                    {formData.leadId && formData.leadId !== 'none' ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                          <User className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="truncate">
                          {(() => { const l = getLeadById(formData.leadId); return l?.nomeFantasia || l?.razaoSocial || l?.name || l?.contactName || 'Lead selecionado'; })()}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Pesquisar lead pelo nome...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder="Digite o nome, telefone ou e-mail..." 
                      value={leadSearchQuery}
                      onValueChange={setLeadSearchQuery}
                    />
                    <CommandList>
                      <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="none"
                          onSelect={() => {
                            setFormData({ ...formData, leadId: '' });
                            setLeadPopoverOpen(false);
                            setLeadSearchQuery('');
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              !formData.leadId || formData.leadId === 'none' ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="text-gray-500">Nenhum lead</span>
                        </CommandItem>
                        {filteredLeadsForSearch.slice(0, 50).map(lead => (
                          <CommandItem
                            key={lead.id}
                            value={String(lead.id)}
                            onSelect={() => {
                              setFormData({ ...formData, leadId: String(lead.id) });
                              setLeadPopoverOpen(false);
                              setLeadSearchQuery('');
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                formData.leadId === String(lead.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${lead._leadType === 'pj' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-purple-100 dark:bg-purple-900/30'}`}>
                                <User className={`w-4 h-4 ${lead._leadType === 'pj' ? 'text-blue-600 dark:text-blue-400' : 'text-purple-600 dark:text-purple-400'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium truncate flex items-center gap-1.5">
                                  {lead.nomeFantasia || lead.razaoSocial || lead.name || lead.contactName || 'Lead sem nome'}
                                  {lead._leadType === 'pj' && <Badge className="text-[9px] px-1 py-0 bg-blue-100 text-blue-700 flex-shrink-0">PJ</Badge>}
                                </div>
                                {lead.phone && (
                                  <div className="text-xs text-gray-400 flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {lead.phone}
                                  </div>
                                )}
                              </div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <p className="text-xs text-gray-500">
                {filteredLeadsForSearch.length} de {allLeads.length} leads {leadSearchQuery && '(filtrados)'}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-gray-500" />
                Tipo de Atividade
              </Label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_TYPES).map(([key, config]) => {
                    const TypeIcon = config.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-full ${config.color} flex items-center justify-center`}>
                            <TypeIcon className="w-3.5 h-3.5 text-white" />
                          </div>
                          <span>{config.label}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Flag className="w-4 h-4 text-gray-500" />
                  Prioridade
                </Label>
                <Select 
                  value={formData.priority} 
                  onValueChange={(v) => setFormData({ ...formData, priority: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                        Baixa
                      </div>
                    </SelectItem>
                    <SelectItem value="media">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                        Média
                      </div>
                    </SelectItem>
                    <SelectItem value="alta">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        Alta
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-gray-500" />
                  Agendar para
                </Label>
                <Input
                  type="datetime-local"
                  value={formData.scheduledAt}
                  onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                  className="h-11"
                />
              </div>
            </div>
          </div>

          <SheetFooter className="pt-6 border-t gap-3">
            <Button 
              variant="outline" 
              onClick={handleCloseDialog}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createActivityMutation.isPending || updateActivityMutation.isPending}
              className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {(createActivityMutation.isPending || updateActivityMutation.isPending) ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : editingTask ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Salvar Alterações
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Tarefa
                </>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              Excluir Atividade
            </AlertDialogTitle>
            <AlertDialogDescription className="pt-2">
              Tem certeza que deseja excluir <strong>"{taskToDelete?.title}"</strong>? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="mt-0">Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
