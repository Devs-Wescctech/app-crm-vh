import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { hasFullVisibility, hasTeamVisibility, getVisibleAgentIds } from "@/components/utils/permissions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Phone,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Plus,
  MessageSquare,
  Mail,
  User,
  ExternalLink,
  Loader2,
  RefreshCw,
  CalendarDays,
  CalendarRange,
  LayoutList,
  Circle,
  Unlink,
  Link2,
  X,
  Flag,
} from "lucide-react";
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isToday,
  isPast,
  isFuture,
  parseISO,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  isValid,
  isSameMonth,
  getHours,
  getMinutes,
  differenceInMinutes,
  addWeeks,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

const BRAND = { burgundy: "#5A2A3C", coral: "#F98F6F" };

const ACTIVITY_TYPES = {
  visit: { label: "Visita", icon: MapPin, color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
  call: { label: "Ligação", icon: Phone, color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0" },
  whatsapp: { label: "WhatsApp", icon: MessageSquare, color: "#10b981", bg: "#ecfdf5", border: "#a7f3d0" },
  email: { label: "E-mail", icon: Mail, color: "#a855f7", bg: "#faf5ff", border: "#e9d5ff" },
  task: { label: "Tarefa", icon: CheckCircle2, color: "#f97316", bg: "#fff7ed", border: "#fed7aa" },
  meeting: { label: "Reunião", icon: CalendarIcon, color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
};

const HOURS = Array.from({ length: 16 }, (_, i) => i + 6);

function getVal(obj, ...keys) {
  for (const k of keys) { if (obj[k] !== undefined && obj[k] !== null) return obj[k]; }
  return null;
}

export default function SalesAgenda() {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterType, setFilterType] = useState("all");
  const [showGoogleEvents, setShowGoogleEvents] = useState(true);
  const [showTeamGoogleEvents, setShowTeamGoogleEvents] = useState(false);
  const [selectedGcalAgent, setSelectedGcalAgent] = useState("mine");
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({
    title: '',
    description: '',
    type: 'task',
    priority: 'media',
    scheduledAt: '',
  });

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: activitiesPJ = [], isLoading: loading } = useQuery({
    queryKey: ["activitiesPJ"],
    queryFn: () => base44.entities.ActivityPJ.list("-scheduledAt", 500),
    staleTime: 1000 * 60 * 2,
  });

  const activities = useMemo(() =>
    activitiesPJ.map((a) => ({ ...a, _leadType: "pj" })),
  [activitiesPJ]);

  const { data: leadsPJ = [] } = useQuery({
    queryKey: ["leadsPJ"],
    queryFn: () => base44.entities.LeadPJ.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 1000 * 60 * 2,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 1000 * 60 * 5,
  });

  const { data: gcalStatus } = useQuery({
    queryKey: ["gcalStatus"],
    queryFn: async () => {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { configured: false, connected: false };
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const { data: gcalOutboxStatus } = useQuery({
    queryKey: ["gcalOutboxStatus"],
    queryFn: async () => {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/outbox-status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: gcalStatus?.connected === true,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const gcalFetchRange = useMemo(() => {
    const rangeStart = startOfMonth(addMonths(selectedDate, -1));
    const rangeEnd = endOfMonth(addMonths(selectedDate, 1));
    return { start: rangeStart, end: rangeEnd };
  }, [selectedDate.getFullYear(), selectedDate.getMonth()]);

  const { data: googleEvents = [] } = useQuery({
    queryKey: ["googleCalendarEvents", gcalFetchRange.start.toISOString(), showTeamGoogleEvents],
    queryFn: async () => {
      const token = localStorage.getItem("accessToken");
      const endpoint = showTeamGoogleEvents ? '/api/functions/google-calendar/team-events' : '/api/functions/google-calendar/events';
      const res = await fetch(
        `${endpoint}?timeMin=${gcalFetchRange.start.toISOString()}&timeMax=${gcalFetchRange.end.toISOString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: (gcalStatus?.connected === true || showTeamGoogleEvents) && showGoogleEvents,
    staleTime: 1000 * 60 * 3,
  });

  const handleRefreshGcal = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast.error("Erro ao sincronizar com Google Calendar");
        return;
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
      queryClient.invalidateQueries({ queryKey: ["activitiesPJ"] });
      toast.success(`Sincronizado! ${data.synced || 0} novos eventos importados.`);
    } catch {
      toast.error("Erro ao sincronizar");
    }
  };

  const updateActivityMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ActivityPJ.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activitiesPJ"] });
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityPJ.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activitiesPJ"] });
      toast.success("Atividade criada com sucesso!");
      setShowCreateSheet(false);
      setNewTaskForm({ title: '', description: '', type: 'task', priority: 'media', scheduledAt: '' });
    },
    onError: (error) => {
      toast.error("Erro ao criar atividade: " + error.message);
    },
  });

  const handleCreateTask = () => {
    if (!newTaskForm.title.trim()) {
      toast.error("Digite o título da atividade");
      return;
    }
    createActivityMutation.mutate({
      type: newTaskForm.type,
      title: newTaskForm.title,
      description: newTaskForm.description || null,
      priority: newTaskForm.priority,
      scheduledAt: newTaskForm.scheduledAt ? new Date(newTaskForm.scheduledAt).toISOString() : null,
      completed: false,
    });
  };

  const openCreateAtDate = (date) => {
    setNewTaskForm(prev => ({
      ...prev,
      scheduledAt: format(date, "yyyy-MM-dd'T'HH:mm"),
    }));
    setShowCreateSheet(true);
  };

  const currentAgent = user?.agent || agents.find((a) => a.userEmail === user?.email || a.email === user?.email);
  const isAdmin = hasFullVisibility(currentAgent);
  const isSupervisor = hasTeamVisibility(currentAgent) && !isAdmin;
  const canSeeTeam = isAdmin || isSupervisor;

  const myActivities = useMemo(() => {
    if (hasFullVisibility(currentAgent)) return activities;

    const visibleIds = getVisibleAgentIds(currentAgent, agents, teams);

    return activities.filter((act) => {
      if (!currentAgent) return true;
      const assignedTo = getVal(act, "assignedTo", "assigned_to");
      const createdBy = getVal(act, "createdBy", "created_by");
      if (hasTeamVisibility(currentAgent)) {
        return assignedTo ? visibleIds.includes(assignedTo) : (createdBy ? visibleIds.includes(createdBy) : false);
      }
      return assignedTo === user?.email || assignedTo === currentAgent?.id || createdBy === currentAgent?.id;
    });
  }, [activities, currentAgent, user, agents]);

  const filtered = filterType === "all" ? myActivities : myActivities.filter((a) => a.type === filterType);

  const today = new Date();

  const stats = useMemo(() => {
    const todayActs = filtered.filter((a) => {
      if (!a.scheduledAt) return false;
      try { return isSameDay(parseISO(a.scheduledAt), today); } catch { return false; }
    });
    const overdue = filtered.filter((a) => {
      if (!a.scheduledAt || a.completed) return false;
      try { const d = parseISO(a.scheduledAt); return isPast(d) && !isSameDay(d, today); } catch { return false; }
    });
    const weekS = startOfWeek(today, { locale: ptBR });
    const weekE = endOfWeek(today, { locale: ptBR });
    const weekActs = filtered.filter((a) => {
      if (!a.scheduledAt) return false;
      try { const d = parseISO(a.scheduledAt); return d >= weekS && d <= weekE; } catch { return false; }
    });
    return {
      today: todayActs.length,
      todayDone: todayActs.filter((a) => a.completed).length,
      todayPending: todayActs.filter((a) => !a.completed).length,
      overdue: overdue.length,
      overdueList: overdue.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
      week: weekActs.length,
      weekDone: weekActs.filter((a) => a.completed).length,
    };
  }, [filtered, today]);

  const getActivitiesForDay = useCallback((day) =>
    filtered.filter((a) => {
      if (!a.scheduledAt) return false;
      try { return isSameDay(parseISO(a.scheduledAt), day); } catch { return false; }
    }).sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)),
  [filtered]);

  const googleEventsForDay = useCallback((day) => {
    if (!showGoogleEvents || !googleEvents.length) return [];
    return googleEvents.filter((ev) => {
      const start = ev.start?.dateTime || ev.start?.date;
      if (!start) return false;
      try { return isSameDay(parseISO(start), day); } catch { return false; }
    });
  }, [showGoogleEvents, googleEvents]);

  const getLeadById = (leadId) => {
    if (!leadId) return null;
    const pj = leadsPJ.find((l) => String(l.id) === String(leadId));
    if (pj) return { ...pj, _leadType: "pj" };
    return null;
  };

  const handleToggle = (id, current) => {
    updateActivityMutation.mutate({ id, data: { completed: !current, completed_at: !current ? new Date().toISOString() : null } });
    toast.success(current ? "Atividade reaberta" : "Atividade concluída!");
  };

  const navigateDate = (dir) => {
    if (viewMode === "day") setSelectedDate(addDays(selectedDate, dir));
    else if (viewMode === "week") setSelectedDate(dir > 0 ? addWeeks(selectedDate, 1) : subWeeks(selectedDate, 1));
    else setCurrentMonth(dir > 0 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1));
  };

  const goToday = () => {
    setSelectedDate(new Date());
    setCurrentMonth(new Date());
  };

  const headerLabel = () => {
    if (viewMode === "day") return format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (viewMode === "week") {
      const ws = startOfWeek(selectedDate, { locale: ptBR });
      const we = endOfWeek(selectedDate, { locale: ptBR });
      return `${format(ws, "dd MMM", { locale: ptBR })} – ${format(we, "dd MMM yyyy", { locale: ptBR })}`;
    }
    return format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR });
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const calDays = [];
  let d = calStart;
  while (d <= calEnd) { calDays.push(d); d = addDays(d, 1); }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0" style={{ borderBottomColor: '#e5e7eb' }}>
        <div className="flex items-center gap-2 mr-2">
          <CalendarIcon className="w-5 h-5" style={{ color: BRAND.burgundy }} />
          <h1 className="text-lg font-semibold hidden sm:block" style={{ color: BRAND.burgundy }}>Agenda</h1>
        </div>

        <Button variant="outline" size="sm" className="text-xs h-8 px-3" onClick={goToday}>Hoje</Button>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateDate(-1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateDate(1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <h2 className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-100 capitalize min-w-0">
          {headerLabel()}
        </h2>

        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            className="text-xs h-8 gap-1 text-white"
            style={{ background: `linear-gradient(135deg, ${BRAND.burgundy}, ${BRAND.coral})` }}
            onClick={() => {
              setNewTaskForm({ title: '', description: '', type: 'task', priority: 'media', scheduledAt: format(selectedDate, "yyyy-MM-dd'T'09:00") });
              setShowCreateSheet(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" /> Nova Atividade
          </Button>
          {gcalStatus?.connected && (
            <GcalSyncStatusBadge status={gcalOutboxStatus} />
          )}
          {gcalStatus?.connected && (
            <Button variant="ghost" size="sm" onClick={handleRefreshGcal} className="text-xs h-8 gap-1 text-gray-600">
              <RefreshCw className="w-3.5 h-3.5" /> Sincronizar
            </Button>
          )}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {[
              { key: "day", label: "Dia" },
              { key: "week", label: "Semana" },
              { key: "month", label: "Mês" },
            ].map((v) => (
              <button
                key={v.key}
                onClick={() => setViewMode(v.key)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  viewMode === v.key ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <div className="w-60 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto hidden lg:block p-3 space-y-4">
          <SidebarMiniCalendar
            currentMonth={currentMonth}
            setCurrentMonth={setCurrentMonth}
            selectedDate={selectedDate}
            setSelectedDate={(d) => { setSelectedDate(d); if (viewMode === "month") setViewMode("day"); }}
            getActivitiesForDay={getActivitiesForDay}
          />

          {/* Filters */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Filtros</p>
            <div className="space-y-1">
              <button
                onClick={() => setFilterType("all")}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  filterType === "all" ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <div className="w-3 h-3 rounded-sm" style={{ background: `linear-gradient(135deg, ${BRAND.burgundy}, ${BRAND.coral})` }} />
                Todas
              </button>
              {Object.entries(ACTIVITY_TYPES).map(([key, cfg]) => (
                <button
                  key={key}
                  onClick={() => setFilterType(key)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                    filterType === key ? "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Resumo</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-gray-600">
                <span>Hoje</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.today}</span>
              </div>
              {stats.overdue > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Atrasadas</span>
                  <span className="font-semibold">{stats.overdue}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>Esta semana</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">{stats.week}</span>
              </div>
              {gcalStatus?.connected && (
                <div className="flex items-center gap-1.5 text-green-600 pt-1">
                  <Link2 className="w-3 h-3" />
                  <span className="text-[11px]">Google conectado</span>
                </div>
              )}
              {canSeeTeam && (
                <button
                  onClick={() => {
                    setShowTeamGoogleEvents(!showTeamGoogleEvents);
                    queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
                  }}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-colors mt-1 ${
                    showTeamGoogleEvents ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <User className="w-3 h-3" />
                  {isAdmin ? "Ver agenda de todos" : "Ver agenda da equipe"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Calendar area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND.burgundy }} />
            </div>
          ) : (
            <>
              {viewMode === "day" && (
                <TimeGrid
                  days={[selectedDate]}
                  getActivitiesForDay={getActivitiesForDay}
                  googleEventsForDay={googleEventsForDay}
                  showGoogleEvents={showGoogleEvents}
                  onActivityClick={setSelectedActivity}
                  singleDay
                />
              )}
              {viewMode === "week" && (
                <TimeGrid
                  days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(selectedDate, { locale: ptBR }), i))}
                  getActivitiesForDay={getActivitiesForDay}
                  googleEventsForDay={googleEventsForDay}
                  showGoogleEvents={showGoogleEvents}
                  onActivityClick={setSelectedActivity}
                />
              )}
              {viewMode === "month" && (
                <MonthGrid
                  calDays={calDays}
                  currentMonth={currentMonth}
                  selectedDate={selectedDate}
                  setSelectedDate={(d) => { setSelectedDate(d); setViewMode("day"); }}
                  getActivitiesForDay={getActivitiesForDay}
                  googleEventsForDay={googleEventsForDay}
                  showGoogleEvents={showGoogleEvents}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Activity detail popover */}
      <AnimatePresence>
        {selectedActivity && (
          <ActivityPopover
            activity={selectedActivity}
            getLeadById={getLeadById}
            handleToggle={handleToggle}
            onClose={() => setSelectedActivity(null)}
          />
        )}
      </AnimatePresence>

      {/* Create Activity Sheet */}
      <Sheet open={showCreateSheet} onOpenChange={setShowCreateSheet}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${BRAND.burgundy}, ${BRAND.coral})` }}>
                <Plus className="w-4 h-4 text-white" />
              </div>
              Nova Atividade
            </SheetTitle>
            <SheetDescription>Crie uma nova tarefa ou atividade na agenda</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Título *</Label>
              <Input
                value={newTaskForm.title}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, title: e.target.value })}
                placeholder="Ex: Reunião com cliente..."
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Descrição</Label>
              <Textarea
                value={newTaskForm.description}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, description: e.target.value })}
                placeholder="Detalhes da atividade..."
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-gray-500" /> Tipo
                </Label>
                <Select value={newTaskForm.type} onValueChange={(v) => setNewTaskForm({ ...newTaskForm, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACTIVITY_TYPES).map(([key, cfg]) => {
                      const TypeIcon = cfg.icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <TypeIcon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                            {cfg.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5 text-gray-500" /> Prioridade
                </Label>
                <Select value={newTaskForm.priority} onValueChange={(v) => setNewTaskForm({ ...newTaskForm, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="baixa">Baixa</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-500" /> Data e Hora
              </Label>
              <Input
                type="datetime-local"
                value={newTaskForm.scheduledAt}
                onChange={(e) => setNewTaskForm({ ...newTaskForm, scheduledAt: e.target.value })}
              />
            </div>
          </div>
          <SheetFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowCreateSheet(false)}>Cancelar</Button>
            <Button
              onClick={handleCreateTask}
              disabled={createActivityMutation.isPending}
              className="text-white"
              style={{ background: `linear-gradient(135deg, ${BRAND.burgundy}, ${BRAND.coral})` }}
            >
              {createActivityMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Criando...</>
              ) : (
                <><Plus className="w-4 h-4 mr-1" /> Criar Atividade</>
              )}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TimeGrid({ days, getActivitiesForDay, googleEventsForDay, showGoogleEvents, onActivityClick, singleDay = false }) {
  const colCount = days.length;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      {/* Day headers */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex" style={{ marginLeft: '56px' }}>
          {days.map((day) => {
            const isT = isToday(day);
            return (
              <div
                key={day.toISOString()}
                className={`flex-1 text-center py-2 border-l border-gray-100 dark:border-gray-800 ${isT ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
              >
                <p className={`text-[11px] uppercase font-medium ${isT ? "text-blue-600" : "text-gray-500"}`}>
                  {format(day, "EEE", { locale: ptBR })}
                </p>
                <p className={`text-xl font-light mt-0.5 ${isT ? "bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center mx-auto" : "text-gray-800 dark:text-gray-200"}`}
                  style={isT ? {} : {}}
                >
                  {format(day, "d")}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time rows */}
      <div className="relative">
        {HOURS.map((hour) => (
          <div key={hour} className="flex" style={{ height: '60px' }}>
            <div className="w-14 flex-shrink-0 text-right pr-2 -mt-2.5">
              <span className="text-[11px] text-gray-400 font-light">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>
            <div className="flex flex-1">
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`flex-1 border-l border-t border-gray-100 dark:border-gray-800 relative ${isToday(day) ? "bg-blue-50/20" : ""}`}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Current time indicator */}
        {days.some(isToday) && (() => {
          const now = new Date();
          const minutesSince6am = (getHours(now) - 6) * 60 + getMinutes(now);
          if (minutesSince6am < 0 || minutesSince6am > HOURS.length * 60) return null;
          const top = minutesSince6am;
          const todayIdx = days.findIndex(isToday);
          const leftPct = (todayIdx / days.length) * 100;
          const widthPct = 100 / days.length;
          return (
            <div
              className="absolute pointer-events-none z-20"
              style={{ top: `${top}px`, left: `56px`, right: 0 }}
            >
              <div style={{ marginLeft: `${leftPct}%`, width: `${widthPct}%` }} className="relative">
                <div className="absolute left-0 -top-[4px] w-2 h-2 rounded-full bg-red-500" />
                <div className="h-[2px] bg-red-500 w-full" />
              </div>
            </div>
          );
        })()}

        {/* Event blocks */}
        {days.map((day, dayIdx) => {
          const acts = getActivitiesForDay(day);
          const gEvents = googleEventsForDay(day);
          const leftPct = (dayIdx / days.length) * 100;
          const widthPct = 100 / days.length;

          return (
            <div key={day.toISOString()}>
              {acts.map((act) => {
                const scheduled = act.scheduledAt ? parseISO(act.scheduledAt) : null;
                if (!scheduled || !isValid(scheduled)) return null;
                const h = getHours(scheduled);
                const m = getMinutes(scheduled);
                const minutesSince6am = (h - 6) * 60 + m;
                if (minutesSince6am < 0) return null;
                const cfg = ACTIVITY_TYPES[act.type] || ACTIVITY_TYPES.task;

                return (
                  <button
                    key={act.id}
                    onClick={() => onActivityClick(act)}
                    className="absolute z-[15] rounded px-1.5 py-0.5 text-left overflow-hidden cursor-pointer hover:opacity-90 transition-opacity group"
                    style={{
                      top: `${minutesSince6am}px`,
                      left: `calc(56px + ${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 6px)`,
                      height: '54px',
                      backgroundColor: act.completed ? '#f3f4f6' : cfg.bg,
                      borderLeft: `3px solid ${act.completed ? '#9ca3af' : cfg.color}`,
                      borderTop: `1px solid ${act.completed ? '#d1d5db' : cfg.border}`,
                      borderRight: `1px solid ${act.completed ? '#d1d5db' : cfg.border}`,
                      borderBottom: `1px solid ${act.completed ? '#d1d5db' : cfg.border}`,
                    }}
                  >
                    <p className={`text-[11px] font-medium truncate ${act.completed ? "line-through text-gray-400" : ""}`}
                      style={act.completed ? {} : { color: cfg.color }}
                    >
                      {act.title || act.description || cfg.label}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {format(scheduled, "HH:mm")} · {cfg.label}
                    </p>
                  </button>
                );
              })}

              {showGoogleEvents && gEvents.map((ev, evIdx) => {
                const startStr = ev.start?.dateTime || ev.start?.date;
                if (!startStr) return null;
                const start = parseISO(startStr);
                if (!isValid(start)) return null;
                const isAllDay = !ev.start?.dateTime;
                const minutesSince6am = isAllDay ? 0 : (getHours(start) - 6) * 60 + getMinutes(start);
                if (minutesSince6am < 0 && !isAllDay) return null;
                const isSalesTwo = ev.summary?.startsWith("[SalesTwo]");

                return (
                  <div
                    key={`gcal-${ev.id || evIdx}`}
                    className="absolute z-[5] rounded px-1.5 py-0.5 overflow-hidden"
                    style={{
                      top: `${minutesSince6am}px`,
                      left: `calc(56px + ${leftPct}% + 2px)`,
                      width: `calc(${widthPct}% - 6px)`,
                      height: '54px',
                      backgroundColor: isSalesTwo ? '#fef3c7' : '#e0f2fe',
                      borderLeft: `3px solid ${isSalesTwo ? '#f59e0b' : '#0ea5e9'}`,
                      borderTop: `1px solid ${isSalesTwo ? '#fcd34d' : '#bae6fd'}`,
                      borderRight: `1px solid ${isSalesTwo ? '#fcd34d' : '#bae6fd'}`,
                      borderBottom: `1px solid ${isSalesTwo ? '#fcd34d' : '#bae6fd'}`,
                    }}
                  >
                    <p className="text-[11px] font-medium truncate" style={{ color: isSalesTwo ? '#92400e' : '#0369a1' }}>
                      {ev.summary}
                    </p>
                    <p className="text-[10px] text-gray-500 truncate">
                      {format(start, "HH:mm")} · {ev._agentName ? `${ev._agentName}` : 'Google Calendar'}
                    </p>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ calDays, currentMonth, selectedDate, setSelectedDate, getActivitiesForDay, googleEventsForDay, showGoogleEvents }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
        {["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"].map((n) => (
          <div key={n} className="text-center text-[11px] font-medium text-gray-500 py-2">{n}</div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {calDays.map((day, idx) => {
          const acts = getActivitiesForDay(day);
          const gEvents = googleEventsForDay(day);
          const inMonth = isSameMonth(day, currentMonth);
          const isT = isToday(day);
          const isSel = isSameDay(day, selectedDate);

          return (
            <button
              key={idx}
              onClick={() => setSelectedDate(day)}
              className={`border-b border-r border-gray-100 dark:border-gray-800 p-1 text-left overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
                !inMonth ? "opacity-40" : ""
              } ${isT ? "bg-blue-50/40" : ""}`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <span className={`text-xs inline-flex items-center justify-center ${
                  isT ? "bg-blue-600 text-white w-6 h-6 rounded-full font-semibold" : "text-gray-700 dark:text-gray-300"
                }`}>
                  {format(day, "d")}
                </span>
              </div>
              <div className="space-y-0.5">
                {acts.slice(0, 3).map((act) => {
                  const cfg = ACTIVITY_TYPES[act.type] || ACTIVITY_TYPES.task;
                  return (
                    <div
                      key={act.id}
                      className="text-[10px] font-medium truncate rounded px-1 py-0.5"
                      style={{
                        backgroundColor: act.completed ? '#f3f4f6' : cfg.bg,
                        color: act.completed ? '#9ca3af' : cfg.color,
                        borderLeft: `2px solid ${act.completed ? '#d1d5db' : cfg.color}`,
                      }}
                    >
                      {act.title || act.description || cfg.label}
                    </div>
                  );
                })}
                {acts.length > 3 && (
                  <p className="text-[10px] text-gray-400 font-medium pl-1">+{acts.length - 3} mais</p>
                )}
                {showGoogleEvents && gEvents.slice(0, 2).map((ev, i) => (
                  <div
                    key={`g-${i}`}
                    className="text-[10px] font-medium truncate rounded px-1 py-0.5"
                    style={{ backgroundColor: '#e0f2fe', color: '#0369a1', borderLeft: '2px solid #0ea5e9' }}
                  >
                    {ev.summary}
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SidebarMiniCalendar({ currentMonth, setCurrentMonth, selectedDate, setSelectedDate, getActivitiesForDay }) {
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { locale: ptBR });
  const calEnd = endOfWeek(monthEnd, { locale: ptBR });
  const days = [];
  let day = calStart;
  while (day <= calEnd) { days.push(day); day = addDays(day, 1); }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <ChevronLeft className="w-3.5 h-3.5 text-gray-500" />
        </button>
        <p className="text-xs font-semibold capitalize text-gray-700 dark:text-gray-200">
          {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
        </p>
        <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
          <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((n, i) => (
          <div key={i} className="text-center text-[10px] text-gray-400 font-medium py-0.5">{n}</div>
        ))}
        {days.map((d, i) => {
          const isMonth = isSameMonth(d, currentMonth);
          const isT = isToday(d);
          const isSel = isSameDay(d, selectedDate);
          const hasActs = getActivitiesForDay(d).length > 0;
          return (
            <button
              key={i}
              onClick={() => setSelectedDate(d)}
              className={`relative text-[11px] py-1 rounded-full transition-colors ${
                !isMonth ? "text-gray-300 dark:text-gray-600" : "text-gray-700 dark:text-gray-200"
              } ${isSel ? "text-white font-bold" : ""} ${isT && !isSel ? "font-bold" : ""} hover:bg-gray-100 dark:hover:bg-gray-700`}
              style={isSel ? { background: BRAND.burgundy } : isT ? { color: BRAND.coral } : {}}
            >
              {format(d, "d")}
              {hasActs && !isSel && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full" style={{ background: BRAND.coral }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActivityPopover({ activity, getLeadById, handleToggle, onClose }) {
  const cfg = ACTIVITY_TYPES[activity.type] || ACTIVITY_TYPES.task;
  const Icon = cfg.icon;
  const leadId = getVal(activity, "leadId", "lead_id");
  const lead = getLeadById(leadId);
  const scheduledAt = activity.scheduledAt ? parseISO(activity.scheduledAt) : null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[380px] max-w-[90vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-2" style={{ backgroundColor: cfg.color }} />
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg.bg }}>
                <Icon className="w-4 h-4" style={{ color: cfg.color }} />
              </div>
              <div>
                <Badge className="text-[10px] px-1.5 py-0" style={{ backgroundColor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                  {cfg.label}
                </Badge>
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          <h3 className={`text-base font-semibold mb-2 ${activity.completed ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"}`}>
            {activity.title || activity.description || "Atividade"}
          </h3>

          {activity.description && activity.title && (
            <p className="text-sm text-gray-500 mb-3">{activity.description}</p>
          )}

          <div className="space-y-2 text-sm">
            {scheduledAt && isValid(scheduledAt) && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>{format(scheduledAt, "EEEE, dd 'de' MMMM · HH:mm", { locale: ptBR })}</span>
              </div>
            )}
            {lead && (
              <Link
                to={createPageUrl("LeadPJDetail", { id: lead.id })}
                className="flex items-center gap-2 hover:underline"
                style={{ color: BRAND.burgundy }}
              >
                <User className="w-4 h-4 flex-shrink-0" />
                <span>{lead.nomeFantasia || lead.razaoSocial || lead.name || lead.contactName || 'Lead sem nome'}</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
            <Button
              size="sm"
              variant={activity.completed ? "outline" : "default"}
              className="flex-1 text-xs h-8"
              style={activity.completed ? {} : { background: `linear-gradient(135deg, ${BRAND.burgundy}, ${BRAND.coral})` }}
              onClick={() => { handleToggle(activity.id, activity.completed); onClose(); }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
              {activity.completed ? "Reabrir" : "Concluir"}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function GcalSyncStatusBadge({ status }) {
  if (!status) return null;
  const { hasFailedItems, hasPendingItems, pendingCount, failedCount, lastFailedError, lastFailedTimestamp } = status;
  if (!hasFailedItems && !hasPendingItems) return null;

  const isError = hasFailedItems;
  const palette = isError
    ? { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c", icon: AlertCircle }
    : { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8", icon: Loader2 };
  const Icon = palette.icon;
  const label = isError
    ? `Erro de Sincronização (${failedCount})`
    : `Sincronização Pendente (${pendingCount})`;

  const badge = (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs font-medium border transition-colors"
      style={{ backgroundColor: palette.bg, borderColor: palette.border, color: palette.text }}
      title={isError ? "Clique para detalhes" : "Aguardando processamento"}
    >
      <Icon className={`w-3.5 h-3.5 ${!isError ? "animate-spin" : ""}`} />
      {label}
    </button>
  );

  if (!isError) return badge;

  let when = "";
  try {
    if (lastFailedTimestamp) {
      when = format(parseISO(lastFailedTimestamp), "dd/MM/yyyy HH:mm", { locale: ptBR });
    }
  } catch { /* noop */ }

  return (
    <Popover>
      <PopoverTrigger asChild>{badge}</PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertCircle className="w-4 h-4" />
            Erro de sincronização com Google Calendar
          </div>
          <p className="text-xs text-gray-600">
            Algumas atividades não foram sincronizadas. O sistema continuará tentando automaticamente.
          </p>
          <div className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-800 break-words">
            <div className="font-medium text-gray-500 mb-1">Último erro:</div>
            <div className="font-mono text-[11px] leading-snug">{lastFailedError || "Erro não informado."}</div>
          </div>
          {when && (
            <div className="text-[11px] text-gray-500">Ocorrido em {when}</div>
          )}
          {failedCount > 0 && (
            <div className="text-[11px] text-gray-500">{failedCount} item(ns) com falha • {pendingCount} pendente(s)</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
