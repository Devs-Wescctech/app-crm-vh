import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Phone,
  Mail,
  DollarSign,
  Building2,
  Filter,
  Search,
  X,
  LayoutGrid,
  List,
  ExternalLink,
  Clock,
  TrendingUp,
  GripVertical,
  Bell,
  CheckCircle2,
  Trash2,
  MapPin,
  Users,
  Target,
  Sparkles,
  Briefcase,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  User,
  Calendar,
  Trophy,
  Eye,
  EyeOff
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import QuickLeadPJForm from "../components/sales/QuickLeadPJForm";
import { createPageUrl } from "@/utils";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { hasFullVisibility, hasTeamVisibility, getVisibleAgentIds, getDataVisibilityKey, getVisibleTeams, getVisibleAgentsForFilter } from "@/components/utils/permissions";
import { computeLeadTemperature, getTemperatureRulesFromSettings, TEMPERATURE_META } from "@/components/utils/temperature";
import TemperatureBadge from "@/components/sales/TemperatureBadge";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { format, differenceInDays, differenceInHours, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
import StatsCard from "@/components/dashboard/StatsCard";

function safeDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function getSortedHistory(lead) {
  const history = [...(lead.stage_history || lead.stageHistory || [])];
  return history
    .filter(e => safeDate(e.changed_at || e.changedAt))
    .sort((a, b) => {
      const da = new Date(a.changed_at || a.changedAt);
      const db = new Date(b.changed_at || b.changedAt);
      return da - db;
    });
}

function formatDuration(fromDate, toDate) {
  const days = differenceInDays(toDate, fromDate);
  const hours = differenceInHours(toDate, fromDate) % 24;
  const mins = differenceInMinutes(toDate, fromDate) % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}min`;
  return `${mins}min`;
}

function getTimeInStage(lead) {
  const history = getSortedHistory(lead);
  let enteredAt = null;
  if (history.length > 0) {
    const lastEntry = history[history.length - 1];
    enteredAt = safeDate(lastEntry.changed_at || lastEntry.changedAt);
  }
  if (!enteredAt) {
    enteredAt = safeDate(lead.createdDate || lead.createdAt || lead.created_at);
  }
  if (!enteredAt) return { label: '-', days: 0, color: 'gray' };
  const now = new Date();
  const totalMinutes = differenceInMinutes(now, enteredAt);
  const totalHours = differenceInHours(now, enteredAt);
  const totalDays = differenceInDays(now, enteredAt);
  let label;
  if (totalMinutes < 60) label = `${totalMinutes}min`;
  else if (totalHours < 24) label = `${totalHours}h`;
  else if (totalDays < 30) label = `${totalDays}d`;
  else label = `${Math.floor(totalDays / 30)}m`;
  let color;
  if (totalDays <= 2) color = 'green';
  else if (totalDays <= 7) color = 'yellow';
  else if (totalDays <= 14) color = 'orange';
  else color = 'red';
  return { label, days: totalDays, hours: totalHours, minutes: totalMinutes, color, enteredAt };
}

function getStageHistoryTimeline(lead, stages) {
  const history = getSortedHistory(lead);
  if (history.length === 0) return [];
  const createdDate = safeDate(lead.createdDate || lead.createdAt || lead.created_at);
  const timeline = [];
  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const changedAt = safeDate(entry.changed_at || entry.changedAt);
    if (!changedAt) continue;
    let prevDate;
    if (i === 0) prevDate = createdDate || changedAt;
    else prevDate = safeDate(history[i - 1].changed_at || history[i - 1].changedAt) || changedAt;
    const durationLabel = formatDuration(prevDate, changedAt);
    const fromId = entry.from || entry.previousStage || entry.from_stage;
    const toId = entry.to || entry.stage || entry.to_stage;
    const fromStage = stages.find(s => s.id === fromId);
    const toStage = stages.find(s => s.id === toId);
    timeline.push({
      from: fromStage?.label || fromId || lead.stage || '-',
      to: toStage?.label || toId || '-',
      duration: durationLabel,
      date: changedAt,
    });
  }
  return timeline;
}

const LIST_PAGE_SIZE = 20;

const STAGES_PJ = [
  { id: 'novo', label: 'Novo', color: 'from-purple-500 to-purple-600', lightBg: 'bg-purple-50 dark:bg-purple-950/30', gradient: 'from-purple-500 to-purple-600', borderColor: 'border-purple-500', shadowColor: 'shadow-purple-200/50 dark:shadow-purple-900/30', textColor: 'text-purple-500 dark:text-purple-400' },
  { id: 'qualificacao', label: 'Qualificação', color: 'from-blue-500 to-blue-600', lightBg: 'bg-blue-50 dark:bg-blue-950/30', gradient: 'from-blue-500 to-blue-600', borderColor: 'border-blue-500', shadowColor: 'shadow-blue-200/50 dark:shadow-blue-900/30', textColor: 'text-blue-500 dark:text-blue-400' },
  { id: 'apresentacao', label: 'Apresentação', color: 'from-cyan-500 to-cyan-600', lightBg: 'bg-cyan-50 dark:bg-cyan-950/30', gradient: 'from-cyan-500 to-cyan-600', borderColor: 'border-cyan-500', shadowColor: 'shadow-cyan-200/50 dark:shadow-cyan-900/30', textColor: 'text-cyan-500 dark:text-cyan-400' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: 'from-orange-500 to-orange-600', lightBg: 'bg-orange-50 dark:bg-orange-950/30', gradient: 'from-orange-500 to-orange-600', borderColor: 'border-orange-500', shadowColor: 'shadow-orange-200/50 dark:shadow-orange-900/30', textColor: 'text-orange-500 dark:text-orange-400' },
  { id: 'negociacao', label: 'Negociação', color: 'from-pink-500 to-pink-600', lightBg: 'bg-pink-50 dark:bg-pink-950/30', gradient: 'from-pink-500 to-pink-600', borderColor: 'border-pink-500', shadowColor: 'shadow-pink-200/50 dark:shadow-pink-900/30', textColor: 'text-pink-500 dark:text-pink-400' },
  { id: 'fechado_ganho', label: 'Fechado - Ganho', color: 'from-green-500 to-green-600', lightBg: 'bg-green-50 dark:bg-green-950/30', gradient: 'from-green-500 to-green-600', borderColor: 'border-green-500', shadowColor: 'shadow-green-200/50 dark:shadow-green-900/30', textColor: 'text-green-500 dark:text-green-400' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'from-red-500 to-red-600', lightBg: 'bg-red-50 dark:bg-red-950/30', gradient: 'from-red-500 to-red-600', borderColor: 'border-red-500', shadowColor: 'shadow-red-200/50 dark:shadow-red-900/30', textColor: 'text-red-500 dark:text-red-400' },
];

function DroppableColumnPJ({ id, stage, children, overId, activeId }) {
  const { setNodeRef } = useDroppable({ id });
  const isOver = overId === id && activeId !== null;
  
  return (
    <div className={`w-64 sm:w-72 flex-shrink-0 transition-all duration-200 snap-start ${
      isOver ? 'scale-[1.02]' : ''
    }`}>
      <Card className={`shadow-sm border-2 flex flex-col rounded-t-none transition-all duration-200 ${
        isOver 
          ? `${stage.borderColor} shadow-xl ${stage.shadowColor}` 
          : 'border-transparent'
      }`}>
        <CardContent className="flex-1 p-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          <div
            ref={setNodeRef}
            className={`p-3 space-y-3 min-h-[200px] transition-all duration-200 ${
              isOver 
                ? `${stage.lightBg} border-2 border-dashed ${stage.borderColor} rounded-lg` 
                : 'bg-gray-50 dark:bg-gray-900'
            }`}
          >
            {children}
            {isOver && (
              <div className={`flex items-center justify-center py-4 ${stage.textColor}`}>
                <div className="flex items-center gap-2 text-sm font-medium animate-pulse">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Soltar aqui
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SortableLeadPJCard({ lead, stage, pendingTasksCount, agentData, navigate, formatCurrency, formatDate, updateLeadMutation, TasksPopover, onMarkLost, temperature, temperatureRules }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lead.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition: isDragging ? 'none' : (transition || 'transform 150ms ease'),
    opacity: isDragging ? 0.7 : 1,
    touchAction: 'none',
    willChange: isDragging ? 'transform' : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-sortable-id={lead.id}
      className={isDragging ? 'rotate-1 scale-[1.03] z-50' : ''}
    >
      <div 
        onClick={() => navigate(`${createPageUrl("LeadPJDetail")}?id=${lead.id}`)}
        className={`group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 ${
          isDragging 
            ? 'shadow-2xl scale-[1.02] ring-2 ring-indigo-400/50' 
            : 'shadow-[0_2px_8px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.15)]'
        }`}
      >
        <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${stage.gradient}`} />
        
        <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4">
          <div className="flex items-start gap-3">
            <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg bg-gradient-to-br ${stage.gradient}`}>
              {(lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social || 'E')[0].toUpperCase()}
              <div className="absolute inset-0 rounded-xl ring-2 ring-white/20" />
            </div>
            
            <div className="flex-1 min-w-0 pt-0.5">
              <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[15px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                {lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social || 'Sem nome'}
              </h4>
              <div className="flex items-center gap-1.5 mt-1">
                <Building2 className="w-3 h-3 text-gray-400" />
                <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
                  {lead.contactName || lead.contact_name || 'Sem contato'}
                </span>
              </div>
              {(() => {
                const d = safeDate(lead.created_at || lead.createdAt);
                return d ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <Calendar className="w-3 h-3 text-gray-400" />
                    <span className="text-gray-400 dark:text-gray-500 text-[11px]">
                      {d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>

            {pendingTasksCount > 0 && (
              <Popover>
                <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="relative flex-shrink-0 group/btn">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-100 to-orange-100 dark:from-amber-900/40 dark:to-orange-900/40 flex items-center justify-center shadow-sm group-hover/btn:shadow-md transition-shadow">
                      <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-r from-rose-500 to-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold shadow-lg">
                      {pendingTasksCount}
                    </span>
                  </button>
                </PopoverTrigger>
                <TasksPopover leadId={lead.id} leadName={lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social} />
              </Popover>
            )}
          </div>

          {(lead.value || lead.monthly_value || lead.monthlyValue) > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/30 dark:to-green-900/30 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {formatCurrency(lead.value || lead.monthly_value || lead.monthlyValue)}
              </span>
            </div>
          )}

          {(lead.porte || temperature) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {temperature && (
                <TemperatureBadge
                  temperature={temperature}
                  rules={temperatureRules}
                  size="md"
                />
              )}
              {lead.porte && (
                <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-medium">
                  {lead.porte}
                </span>
              )}
            </div>
          )}

          {(stage.id === 'fechado_ganho' || stage.id === 'fechado_perdido') && (
            <div className="mt-3">
              <Button
                size="sm"
                variant="outline"
                className={`w-full text-xs font-medium ${
                  stage.id === 'fechado_ganho' 
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' 
                    : 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (stage.id === 'fechado_ganho') {
                    updateLeadMutation.mutate({ id: lead.id, data: { concluded: true } });
                  } else {
                    onMarkLost?.(lead.id);
                  }
                }}
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                {stage.id === 'fechado_ganho' ? 'Dar Baixa (Ganho)' : 'Dar Baixa (Perdido)'}
              </Button>
            </div>
          )}

          {(() => {
            const timeInfo = getTimeInStage(lead);
            const timeline = getStageHistoryTimeline(lead, STAGES_PJ);
            const colorClasses = {
              green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
              yellow: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
              orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
              red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
              gray: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
            };
            return (
              <>
                {timeline.length > 0 && (
                  <div className="mt-3 space-y-1">
                    {timeline.slice(-2).map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                        <TrendingUp className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{entry.from} → {entry.to}</span>
                        <span className="ml-auto font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{entry.duration}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    {agentData ? (
                      <>
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center overflow-hidden shadow-sm">
                          {agentData.photo_url ? (
                            <img src={agentData.photo_url} alt={agentData.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-white text-[10px] font-semibold">{agentData.name?.charAt(0)}</span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[70px]">{agentData.name?.split(' ')[0]}</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Não atribuído</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${colorClasses[timeInfo.color]}`}>
                      <Clock className="w-3 h-3" />
                      {timeInfo.label}
                    </span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

export default function LeadsPJKanban() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showClosedLeads, setShowClosedLeads] = useState(() => {
    try {
      return localStorage.getItem('leadsPJKanbanShowClosed') === 'true';
    } catch (e) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('leadsPJKanbanShowClosed', String(showClosedLeads));
    } catch (e) {}
  }, [showClosedLeads]);

  const displayStages = useMemo(
    () => showClosedLeads
      ? STAGES_PJ
      : STAGES_PJ.filter(s => s.id !== 'fechado_ganho' && s.id !== 'fechado_perdido'),
    [showClosedLeads]
  );
  const [viewMode, setViewMode] = useState('kanban');
  const DEFAULT_FILTERS = { search: '', agent: 'all', team: 'all', porte: 'all', temperature: 'all', dateFrom: '', dateTo: '' };
  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem('leadsPJKanbanFilters');
    if (saved) {
      try {
        return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
      } catch (e) {
        return { ...DEFAULT_FILTERS };
      }
    }
    return { ...DEFAULT_FILTERS };
  });

  useEffect(() => {
    localStorage.setItem('leadsPJKanbanFilters', JSON.stringify(filters));
  }, [filters]);

  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    localStorage.removeItem('leadsPJKanbanFilters');
  };

  const hasActiveFilters = filters.search || filters.agent !== 'all' || filters.team !== 'all' || filters.porte !== 'all' || filters.temperature !== 'all' || filters.dateFrom || filters.dateTo;
  const [listPage, setListPage] = useState(1);
  const [isDraggingCard, setIsDraggingCard] = useState(false);
  const [lostReasonDialog, setLostReasonDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: null });
  const [lostReasonText, setLostReasonText] = useState('');

  // Refs para arrastar o kanban horizontalmente
  const kanbanContainerRef = useRef(null);
  const headersRef = useRef(null);
  const isDraggingCanvasRef = useRef(false);
  const dragStartX = useRef(0);
  const savedScrollPosition = useRef(null);
  const dragScrollLeft = useRef(0);
  const [activeId, setActiveId] = useState(null);
  const [overId, setOverId] = useState(null);

  // Sensores do dnd-kit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCanvasMouseDown = useCallback((e) => {
    if (activeId) return;
    if (e.target.closest('[data-sortable-id]')) return;
    const container = kanbanContainerRef.current;
    const headers = headersRef.current;
    if (!container && !headers) return;
    isDraggingCanvasRef.current = true;
    const ref = container || headers;
    dragStartX.current = e.pageX - ref.offsetLeft;
    dragScrollLeft.current = container?.scrollLeft || headers?.scrollLeft || 0;
    if (container) container.style.cursor = 'grabbing';
    if (headers) headers.style.cursor = 'grabbing';
  }, [activeId]);

  const handleCanvasMouseMove = useCallback((e) => {
    if (!isDraggingCanvasRef.current) return;
    if (activeId) return;
    e.preventDefault();
    const container = kanbanContainerRef.current;
    const headers = headersRef.current;
    if (!container && !headers) return;
    const ref = container || headers;
    const x = e.pageX - ref.offsetLeft;
    const walk = (x - dragStartX.current) * 1.5;
    const newScrollLeft = dragScrollLeft.current - walk;
    if (container) container.scrollLeft = newScrollLeft;
    if (headers) headers.scrollLeft = newScrollLeft;
  }, [activeId]);

  const handleCanvasMouseUp = useCallback(() => {
    isDraggingCanvasRef.current = false;
    const container = kanbanContainerRef.current;
    const headers = headersRef.current;
    if (container) container.style.cursor = 'grab';
    if (headers) headers.style.cursor = 'grab';
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    if (isDraggingCanvasRef.current) {
      isDraggingCanvasRef.current = false;
      const container = kanbanContainerRef.current;
      const headers = headersRef.current;
      if (container) container.style.cursor = 'grab';
      if (headers) headers.style.cursor = 'grab';
    }
  }, []);

  const handleDragStart = useCallback((event) => {
    setActiveId(event.active.id);
    setIsDraggingCard(true);
    setOverId(null);
  }, []);

  useEffect(() => {
    setListPage(1);
  }, [filters, viewMode]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [], isLoading: isLoadingAgents } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 15000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 60000,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);
  const isAdmin = hasFullVisibility(currentAgent) || hasTeamVisibility(currentAgent);

  const { data: leadsPJ = [], isLoading } = useQuery({
    queryKey: ['leadsPJ', getDataVisibilityKey(user, currentAgent), allAgents.length, teams.length],
    queryFn: async () => {
      const allLeads = await base44.entities.LeadPJ.list('-created_at');
      
      if (hasFullVisibility(currentAgent) || hasTeamVisibility(currentAgent)) {
        const visibleIds = getVisibleAgentIds(currentAgent, allAgents, teams);
        return allLeads.filter(l =>
          !l.lost && !l.concluded &&
          (hasFullVisibility(currentAgent) || visibleIds.includes(l.agentId) || visibleIds.includes(l.agent_id))
        );
      }

      if (!currentAgent) return [];

      return allLeads.filter(l =>
        !l.lost && !l.concluded &&
        (l.agentId === currentAgent.id || l.agent_id === currentAgent.id)
      );
    },
    enabled: !!user && !isLoadingAgents && (isAdmin || !!currentAgent),
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const handleDragOver = useCallback((event) => {
    const { over } = event;
    if (!over) {
      setOverId(null);
      return;
    }
    
    if (STAGES_PJ.find(s => s.id === over.id)) {
      setOverId(over.id);
    } else {
      const overLead = leadsPJ.find(l => l.id === over.id);
      if (overLead) {
        setOverId(overLead.stage);
      }
    }
  }, [leadsPJ]);

  const salesAgents = useMemo(() => {
    return getVisibleAgentsForFilter(currentAgent, allAgents, teams);
  }, [currentAgent, allAgents, teams]);

  const visibleTeamsList = useMemo(() => {
    return getVisibleTeams(currentAgent, teams, allAgents);
  }, [currentAgent, teams, allAgents]);

  const { data: allActivitiesPJ = [] } = useQuery({
    queryKey: ['allActivitiesPJ'],
    queryFn: () => base44.entities.ActivityPJ.list(),
    staleTime: 15000,
    refetchInterval: 30000,
  });

  const { data: systemSettings = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 60000,
  });

  const temperatureRules = useMemo(
    () => getTemperatureRulesFromSettings(systemSettings),
    [systemSettings]
  );

  const temperatureByLead = useMemo(() => {
    const now = new Date();
    const map = new Map();
    for (const lead of leadsPJ) {
      map.set(String(lead.id), computeLeadTemperature(lead, allActivitiesPJ, temperatureRules, now));
    }
    return map;
  }, [leadsPJ, allActivitiesPJ, temperatureRules]);

  const leadsQueryKey = ['leadsPJ', isAdmin ? 'admin' : currentAgent?.id];
  
  const updateLeadMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadPJ.update(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: leadsQueryKey });
      const previousLeads = queryClient.getQueryData(leadsQueryKey);
      
      queryClient.setQueryData(leadsQueryKey, (old) => {
        if (!old) return old;
        return old.map(lead => 
          String(lead.id) === String(id) 
            ? { ...lead, ...data } 
            : lead
        );
      });
      
      return { previousLeads };
    },
    onError: (err, variables, context) => {
      if (context?.previousLeads) {
        queryClient.setQueryData(leadsQueryKey, context.previousLeads);
      }
      toast.error('Erro ao mover lead');
    },
    onSettled: () => {
      const scrollPos = savedScrollPosition.current;
      queryClient.invalidateQueries({ queryKey: leadsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      if (scrollPos) {
        requestAnimationFrame(() => {
          const container = kanbanContainerRef.current;
          const headers = headersRef.current;
          const pageEl = container?.closest('.overflow-y-auto, .overflow-auto, main');
          if (container) container.scrollLeft = scrollPos.scrollLeft;
          if (headers) headers.scrollLeft = scrollPos.scrollLeft;
          if (pageEl) pageEl.scrollTop = scrollPos.scrollTop;
          requestAnimationFrame(() => {
            if (container) container.scrollLeft = scrollPos.scrollLeft;
            if (headers) headers.scrollLeft = scrollPos.scrollLeft;
            if (pageEl) pageEl.scrollTop = scrollPos.scrollTop;
            savedScrollPosition.current = null;
          });
        });
      }
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: ({ taskId }) => base44.entities.ActivityPJ.update(taskId, {
      completed: true,
      completedAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allActivitiesPJ'] });
      toast.success('Tarefa concluída!');
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: ({ taskId }) => base44.entities.ActivityPJ.delete(taskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allActivitiesPJ'] });
      toast.success('Tarefa excluída!');
    },
  });

  const handleStageChange = useCallback((leadId, newStage, fromStage = null) => {
    const lead = leadsPJ.find(l => String(l.id) === String(leadId));
    if (!lead) return;

    const currentStage = fromStage || lead.stage;
    if (currentStage === newStage) return;

    if (newStage === 'fechado_perdido') {
      setLostReasonDialog({ leadId, fromStage: currentStage });
      setLostReasonText('');
      return;
    }

    const stageHistory = [...(lead.stageHistory || lead.stage_history || [])];
    stageHistory.push({
      from: currentStage,
      to: newStage,
      changedAt: new Date().toISOString(),
      changedBy: user?.email,
    });

    updateLeadMutation.mutate({
      id: leadId,
      data: {
        stage: newStage,
        stageHistory: stageHistory,
      }
    });

    toast.success('Lead movido com sucesso!');
  }, [leadsPJ, user?.email, updateLeadMutation]);

  const handleDragMove = useCallback(() => {
    if (kanbanContainerRef.current && headersRef.current) {
      headersRef.current.scrollLeft = kanbanContainerRef.current.scrollLeft;
    }
  }, []);

  // Estado para ordem local dos cards
  const [localOrder, setLocalOrder] = useState({});

  const filteredLeads = leadsPJ.filter(lead => {
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (
        !lead.razao_social?.toLowerCase().includes(searchLower) &&
        !lead.nome_fantasia?.toLowerCase().includes(searchLower) &&
        !lead.cnpj?.toLowerCase().includes(searchLower) &&
        !lead.contact_name?.toLowerCase().includes(searchLower) &&
        !lead.phone?.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }

    if (filters.team !== 'all') {
      const teamAgentIds = allAgents
        .filter(a => String(a.team_id) === String(filters.team) || String(a.teamId) === String(filters.team))
        .map(a => String(a.id));
      if (!teamAgentIds.includes(String(lead.agent_id)) && !teamAgentIds.includes(String(lead.agentId))) {
        return false;
      }
    }

    if (filters.agent !== 'all' && String(lead.agent_id) !== filters.agent) {
      return false;
    }

    if (filters.porte !== 'all' && lead.porte && lead.porte !== filters.porte) {
      return false;
    }

    if (filters.temperature !== 'all') {
      const t = temperatureByLead.get(String(lead.id));
      if (!t || t.key !== filters.temperature) return false;
    }

    if (filters.dateFrom && lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      const fromDate = new Date(filters.dateFrom);
      fromDate.setHours(0, 0, 0, 0);
      if (!isNaN(leadDate.getTime()) && leadDate < fromDate) return false;
    }

    if (filters.dateTo && lead.createdAt) {
      const leadDate = new Date(lead.createdAt);
      const toDate = new Date(filters.dateTo);
      toDate.setHours(23, 59, 59, 999);
      if (!isNaN(leadDate.getTime()) && leadDate > toDate) return false;
    }

    return true;
  });

  const getLeadsByStage = (stage) => {
    return filteredLeads.filter(lead => lead.stage === stage);
  };

  const getOrderedLeadsByStage = useCallback((stage) => {
    const stageLeads = filteredLeads.filter(lead => lead.stage === stage);
    if (localOrder[stage]) {
      const orderMap = {};
      localOrder[stage].forEach((id, index) => {
        orderMap[id] = index;
      });
      return [...stageLeads].sort((a, b) => {
        const orderA = orderMap[a.id] ?? 999;
        const orderB = orderMap[b.id] ?? 999;
        return orderA - orderB;
      });
    }
    return stageLeads;
  }, [filteredLeads, localOrder]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;
    setActiveId(null);
    setIsDraggingCard(false);
    setOverId(null);

    const containerEl = kanbanContainerRef.current;
    const pageEl = containerEl?.closest('.overflow-y-auto, .overflow-auto, main');
    savedScrollPosition.current = {
      scrollLeft: containerEl?.scrollLeft || 0,
      scrollTop: pageEl?.scrollTop || window.scrollY || 0,
    };

    if (!over) return;

    const activeLeadId = active.id;
    const overIdValue = over.id;

    const activeLead = leadsPJ.find(l => l.id === activeLeadId);
    if (!activeLead) return;

    const sourceStage = activeLead.stage;
    let destStage = null;

    if (STAGES_PJ.find(s => s.id === overIdValue)) {
      destStage = overIdValue;
    } else {
      const overLead = leadsPJ.find(l => l.id === overIdValue);
      if (overLead) {
        destStage = overLead.stage;
      }
    }

    if (!destStage) return;

    if (sourceStage !== destStage) {
      handleStageChange(activeLeadId, destStage, sourceStage);
    } else {
      const stageLeads = getOrderedLeadsByStage(sourceStage);
      const oldIndex = stageLeads.findIndex(l => l.id === activeLeadId);
      const newIndex = stageLeads.findIndex(l => l.id === overIdValue);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = [...stageLeads];
        const [removed] = newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, removed);
        
        setLocalOrder(prev => ({
          ...prev,
          [sourceStage]: newOrder.map(l => l.id)
        }));
        
        toast.success('Ordem atualizada');
      }
    }
  }, [leadsPJ, handleStageChange, getOrderedLeadsByStage]);

  const actionableTypes = ['task', 'visit', 'call', 'meeting', 'email', 'presentation', 'proposal'];

  const getPendingTasksCount = (leadId) => {
    return allActivitiesPJ.filter(a =>
      a.leadPjId === leadId &&
      actionableTypes.includes(a.type) &&
      !a.completed
    ).length;
  };

  const getPendingTasks = (leadId) => {
    return allActivitiesPJ.filter(a =>
      a.leadPjId === leadId &&
      actionableTypes.includes(a.type) &&
      !a.completed
    );
  };

  // KPIs corrigidos
  const wonLeads = getLeadsByStage('fechado_ganho');
  const lostLeads = getLeadsByStage('fechado_perdido');
  const activeLeads = filteredLeads.filter(l => l.stage !== 'fechado_ganho' && l.stage !== 'fechado_perdido');
  const totalLeadsCount = filteredLeads.length;
  
  // Valor total em pipeline (apenas leads ativos)
  const getLeadValue = (lead) => {
    return parseFloat(lead.value) || parseFloat(lead.monthly_value) || parseFloat(lead.monthlyValue) || parseFloat(lead.monthly_revenue) || parseFloat(lead.monthlyRevenue) || 0;
  };
  
  const totalValue = activeLeads.reduce((sum, lead) => sum + getLeadValue(lead), 0);
  
  // Valor ganho (leads fechados com sucesso)
  const wonValue = wonLeads.reduce((sum, lead) => sum + getLeadValue(lead), 0);
  
  // Ticket médio baseado em leads ativos
  const avgValue = activeLeads.length > 0 ? totalValue / activeLeads.length : 0;
  
  // Taxa de conversão: leads ganhos / total de leads
  const conversionRate = totalLeadsCount > 0
    ? ((wonLeads.length / totalLeadsCount) * 100).toFixed(1)
    : 0;

  const getAgentData = (agentId) => {
    if (!agentId) return null;
    return salesAgents.find(a => String(a.id) === String(agentId));
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR');
  };

  const getCompanySizeLabel = (size) => {
    const sizes = {
      mei: 'MEI',
      micro: 'Microempresa',
      pequena: 'Pequena',
      media: 'Média',
      grande: 'Grande'
    };
    return sizes[size] || size;
  };

  const getTaskIcon = (type) => {
    const icons = {
      visit: <MapPin className="w-3.5 h-3.5" />,
      call: <Phone className="w-3.5 h-3.5" />,
      meeting: <Users className="w-3.5 h-3.5" />,
      email: <Mail className="w-3.5 h-3.5" />,
      presentation: <TrendingUp className="w-3.5 h-3.5" />,
      proposal: <DollarSign className="w-3.5 h-3.5" />,
      task: <AlertCircle className="w-3.5 h-3.5" />,
    };
    return icons[type] || <AlertCircle className="w-3.5 h-3.5" />;
  };

  const getTaskTypeLabel = (type) => {
    const labels = {
      visit: 'Visita',
      call: 'Ligação',
      meeting: 'Reunião',
      email: 'E-mail',
      presentation: 'Apresentação',
      proposal: 'Proposta',
      task: 'Tarefa',
    };
    return labels[type] || 'Tarefa';
  };

  const getTaskTypeColor = (type) => {
    const colors = {
      visit: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
      call: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
      meeting: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400',
      email: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-400',
      presentation: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
      proposal: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
      task: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
    };
    return colors[type] || colors.task;
  };

  const TasksPopover = ({ leadId, leadName }) => {
    const tasks = getPendingTasks(leadId);

    return (
      <PopoverContent className="w-80 p-0 glass-card border-0 shadow-soft-lg" align="start">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-950/50 dark:to-violet-950/50 rounded-t-xl">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
              <Bell className="w-3 h-3" />
            </div>
            Tarefas Pendentes
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{leadName}</p>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {tasks.length === 0 ? (
            <div className="p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                Nenhuma tarefa pendente
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {tasks.map((task) => (
                <motion.div
                  key={task.id}
                  className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-0.5 p-1.5 rounded-lg flex-shrink-0 ${getTaskTypeColor(task.type)}`}>
                      {getTaskIcon(task.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${getTaskTypeColor(task.type)}`}>
                          {getTaskTypeLabel(task.type)}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2 mt-1">
                        {task.title}
                      </p>
                      {(task.scheduledAt || task.scheduled_at) && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(task.scheduledAt || task.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:bg-emerald-100 dark:hover:bg-emerald-950 hover:text-emerald-700 dark:hover:text-emerald-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          completeTaskMutation.mutate({ taskId: task.id });
                        }}
                        disabled={completeTaskMutation.isPending}
                        title="Marcar como concluída"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-700 dark:hover:text-red-400"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDialog({
                            isOpen: true,
                            title: 'Excluir tarefa',
                            message: 'Tem certeza que deseja excluir esta tarefa?',
                            confirmLabel: 'Excluir',
                            variant: 'danger',
                            onConfirm: () => { deleteTaskMutation.mutate({ taskId: task.id }); setConfirmDialog(prev => ({ ...prev, isOpen: false })); },
                          });
                        }}
                        disabled={deleteTaskMutation.isPending}
                        title="Excluir tarefa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
          <Button
            onClick={(e) => { e.stopPropagation(); navigate(`${createPageUrl("LeadPJDetail")}?id=${leadId}`); }}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <ExternalLink className="w-3 h-3 mr-2" />
            Ver Detalhes e Dar Baixa
          </Button>
        </div>
      </PopoverContent>
    );
  };

  return (
    <motion.div
      className="min-h-screen"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <div className="space-y-4 md:space-y-6">
        <motion.div
          className="page-header-title-section"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold font-display bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
              Pipeline de Vendas PJ
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Gerencie seus leads corporativos através do funil de vendas</span>
              <span className="sm:hidden">Leads corporativos</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="glass"
              onClick={() => setShowClosedLeads(prev => !prev)}
              className={`flex-1 sm:flex-none ${showClosedLeads ? 'ring-2 ring-emerald-500/50' : ''}`}
              size="sm"
              title={showClosedLeads ? 'Ocultar leads finalizados' : 'Mostrar leads finalizados'}
            >
              {showClosedLeads ? (
                <Eye className="w-4 h-4 sm:mr-2" />
              ) : (
                <EyeOff className="w-4 h-4 sm:mr-2" />
              )}
              <span className="hidden sm:inline">
                {showClosedLeads ? 'Ocultar Finalizados' : 'Mostrar Finalizados'}
              </span>
            </Button>
            <Button
              variant="glass"
              onClick={() => setShowFilters(!showFilters)}
              className={`flex-1 sm:flex-none ${hasActiveFilters ? 'ring-2 ring-purple-500/50' : ''}`}
              size="sm"
            >
              <Filter className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <Badge variant="info" className="ml-2">
                  {[filters.search, filters.agent !== 'all', filters.team !== 'all', filters.porte !== 'all', filters.temperature !== 'all', filters.dateFrom, filters.dateTo].filter(Boolean).length}
                </Badge>
              )}
            </Button>
            <Link to={createPageUrl('NewLeadPJ')} className="flex-1 sm:flex-none">
              <Button variant="gradient" size="sm" className="w-full bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white border-0">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Novo Lead PJ</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </Link>
          </div>
        </motion.div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <Card className="glass-card border-0 shadow-soft overflow-hidden">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Buscar
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          placeholder="Empresa, CNPJ, contato..."
                          value={filters.search}
                          onChange={(e) => setFilters({...filters, search: e.target.value})}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Time
                      </label>
                      <Select value={filters.team} onValueChange={(val) => setFilters({...filters, team: val, agent: 'all'})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os times" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os times</SelectItem>
                          {visibleTeamsList.map(team => (
                            <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Agente
                      </label>
                      <Select value={filters.agent} onValueChange={(val) => setFilters({...filters, agent: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os agentes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os agentes</SelectItem>
                          {(filters.team !== 'all' ? salesAgents.filter(a => String(a.team_id) === String(filters.team) || String(a.teamId) === String(filters.team)) : salesAgents).map(agent => (
                            <SelectItem key={agent.id} value={String(agent.id)}>{agent.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Porte
                      </label>
                      <Select value={filters.porte} onValueChange={(val) => setFilters({...filters, porte: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todos os portes" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os portes</SelectItem>
                          <SelectItem value="mei">MEI</SelectItem>
                          <SelectItem value="micro">Microempresa</SelectItem>
                          <SelectItem value="pequena">Pequena</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="grande">Grande</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Temperatura
                      </label>
                      <Select value={filters.temperature} onValueChange={(val) => setFilters({...filters, temperature: val})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Todas as temperaturas" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as temperaturas</SelectItem>
                          <SelectItem value="hot">{TEMPERATURE_META.hot.label}</SelectItem>
                          <SelectItem value="warm">{TEMPERATURE_META.warm.label}</SelectItem>
                          <SelectItem value="cold">{TEMPERATURE_META.cold.label}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Data Inicial
                      </label>
                      <Input
                        type="date"
                        value={filters.dateFrom}
                        onChange={(e) => setFilters({...filters, dateFrom: e.target.value})}
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                        Data Final
                      </label>
                      <Input
                        type="date"
                        value={filters.dateTo}
                        onChange={(e) => setFilters({...filters, dateTo: e.target.value})}
                      />
                    </div>
                  </div>

                  {hasActiveFilters && (
                    <div className="mt-4 flex justify-end">
                      <Button variant="ghost" size="sm" onClick={clearFilters}>
                        <X className="w-4 h-4 mr-2" />
                        Limpar Filtros
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatsCard
            title="Leads PJ Ativos"
            value={activeLeads.length}
            subtitle={`${wonLeads.length} ganhos, ${lostLeads.length} perdidos`}
            icon={Building2}
            color="purple"
            delay={0}
            helpText="Quantidade de leads PJ em andamento no pipeline (exclui ganhos e perdidos já baixados)"
          />
          <StatsCard
            title="Vendas Fechadas"
            value={formatCurrency(wonValue)}
            subtitle={`${wonLeads.length} vendas ganhas`}
            icon={Trophy}
            color="green"
            delay={0.05}
            helpText="Valor total de todas as vendas PJ já fechadas (leads com status Ganho)"
          />
          <StatsCard
            title="Valor em Pipeline"
            value={formatCurrency(totalValue)}
            icon={DollarSign}
            color="blue"
            delay={0.1}
            helpText="Soma dos valores de todos os leads PJ ativos no pipeline"
          />
          <StatsCard
            title="Ticket Médio"
            value={formatCurrency(avgValue)}
            icon={Target}
            color="blue"
            delay={0.2}
            helpText="Valor médio por lead PJ ativo no pipeline"
          />
          <StatsCard
            title="Taxa de Conversão"
            value={`${conversionRate}%`}
            subtitle={`${wonLeads.length}/${totalLeadsCount} leads`}
            icon={TrendingUp}
            color="orange"
            delay={0.3}
            helpText="Porcentagem de leads PJ ganhos sobre o total de leads (ativos + fechados)"
          />
        </motion.div>

        <div className="flex justify-end">
          <div className="inline-flex rounded-xl glass-card p-1">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className={viewMode === 'kanban' ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white' : ''}
            >
              <LayoutGrid className="w-4 h-4 mr-2" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className={viewMode === 'list' ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white' : ''}
            >
              <List className="w-4 h-4 mr-2" />
              Lista
            </Button>
          </div>
        </div>

        {viewMode === 'kanban' && (
          <>
            {/* Sticky Headers */}
            <div 
              ref={headersRef}
              className="sticky top-0 z-20 bg-gray-50 dark:bg-gray-950 pb-2 overflow-x-auto cursor-grab select-none"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onScroll={(e) => {
                if (kanbanContainerRef.current) {
                  kanbanContainerRef.current.scrollLeft = e.target.scrollLeft;
                }
              }}
            >
              <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                {displayStages.map((stage) => {
                  const stageLeads = getOrderedLeadsByStage(stage.id);
                  const stageValue = stageLeads.reduce((sum, lead) => sum + getLeadValue(lead), 0);
                  return (
                    <div key={stage.id} className="w-64 sm:w-72 flex-shrink-0 snap-start">
                      <div className={`bg-gradient-to-r ${stage.color} text-white p-4 rounded-lg shadow-md`}>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-lg">{stage.label}</h3>
                          <Badge variant="secondary" className="bg-white/20 text-white backdrop-blur-sm">
                            {stageLeads.length}
                            </Badge>
                          </div>
                          <div className="space-y-1 text-xs text-white/90">
                            <div className="flex items-center justify-between">
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-3 h-3" />
                                Valor:
                              </span>
                              <span className="font-semibold">{formatCurrency(stageValue)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            {/* Kanban Columns with dnd-kit */}
            <div 
              ref={kanbanContainerRef}
              className="pb-4 cursor-grab select-none overflow-x-auto"
              style={{ scrollbarWidth: 'thin', WebkitOverflowScrolling: 'touch' }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onScroll={(e) => {
                if (headersRef.current) {
                  headersRef.current.scrollLeft = e.target.scrollLeft;
                }
              }}
            >
              <style>{`.overflow-x-auto::-webkit-scrollbar { display: none; }`}</style>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragMove={handleDragMove}
                onDragOver={handleDragOver}
                autoScroll={{
                  threshold: { x: 0.15, y: 0.15 },
                  acceleration: 5,
                  interval: 10,
                }}
              >
                <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
                  {displayStages.map((stage) => {
                    const stageLeads = getOrderedLeadsByStage(stage.id);

                    return (
                      <DroppableColumnPJ key={stage.id} id={stage.id} stage={stage} overId={overId} activeId={activeId}>
                        <SortableContext
                          items={stageLeads.map(l => l.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {stageLeads.map((lead) => {
                            const pendingTasksCount = getPendingTasksCount(lead.id);
                            const agentData = getAgentData(lead.agentId || lead.agent_id);

                            return (
                              <SortableLeadPJCard
                                key={lead.id}
                                lead={lead}
                                stage={stage}
                                pendingTasksCount={pendingTasksCount}
                                agentData={agentData}
                                navigate={navigate}
                                formatCurrency={formatCurrency}
                                formatDate={formatDate}
                                updateLeadMutation={updateLeadMutation}
                                TasksPopover={TasksPopover}
                                temperature={temperatureByLead.get(String(lead.id))}
                                temperatureRules={temperatureRules}
                                onMarkLost={(leadId) => {
                                  setLostReasonDialog({ leadId, fromStage: lead.stage, isDarBaixa: true });
                                  setLostReasonText('');
                                }}
                              />
                            );
                          })}
                        </SortableContext>
                        {stageLeads.length === 0 && (
                          <div className="text-center py-12 text-gray-400 text-sm">
                            <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                              <Building2 className="w-8 h-8" />
                            </div>
                            <p>Nenhum lead</p>
                          </div>
                        )}
                        <div style={{ minHeight: '80px' }} />
                      </DroppableColumnPJ>
                    );
                  })}
                </div>
                
                <DragOverlay>
                  {activeId ? (() => {
                    const lead = leadsPJ.find(l => l.id === activeId);
                    if (!lead) return null;
                    const stage = STAGES_PJ.find(s => s.id === lead.stage) || STAGES_PJ[0];
                    return (
                      <div className="w-72 rotate-2 scale-105">
                        <div className="group relative overflow-hidden rounded-2xl shadow-2xl ring-2 ring-indigo-400/50">
                          <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${stage.gradient}`} />
                          <div className="relative bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm p-4">
                            <div className="flex items-start gap-3">
                              <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-lg bg-gradient-to-br ${stage.gradient}`}>
                                <Building2 className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <h4 className="font-semibold text-gray-900 dark:text-white truncate text-[15px]">
                                  {lead.nome_fantasia || lead.razao_social || 'Sem nome'}
                                </h4>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Users className="w-3 h-3 text-gray-400" />
                                  <span className="text-gray-500 dark:text-gray-400 text-xs truncate">
                                    {lead.contact_name || 'Sem contato'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })() : null}
                </DragOverlay>
              </DndContext>
            </div>
          </>
        )}

        {viewMode === 'list' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <Card className="glass-card border-0 shadow-soft overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Empresa</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Contato</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Etapa</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Porte</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Temperatura</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Valor</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Agente</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">Criado em</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredLeads.map((lead, index) => {
                        const stage = STAGES_PJ.find(s => s.id === lead.stage);
                        const pendingTasksCount = getPendingTasksCount(lead.id);
                        const agentData = getAgentData(lead.agentId || lead.agent_id);

                        return (
                          <motion.tr
                            key={lead.id}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                            onClick={() => navigate(`${createPageUrl("LeadPJDetail")}?id=${lead.id}`)}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: index * 0.02 }}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-purple-500" />
                                <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                                  {lead.nomeFantasia || lead.razaoSocial || 'Sem nome'}
                                </span>
                                {pendingTasksCount > 0 && (
                                  <Badge variant="warning" className="text-[10px]">
                                    {pendingTasksCount} tarefas
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-col">
                                <span className="text-sm text-gray-900 dark:text-gray-100">{lead.contact_name || '-'}</span>
                                {lead.phone && (
                                  <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Phone className="w-3 h-3" /> {lead.phone}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={`bg-gradient-to-r ${stage?.gradient} text-white border-0`}>
                                {stage?.label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="glass" className="text-xs">
                                {getCompanySizeLabel(lead.porte)}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const t = temperatureByLead.get(String(lead.id));
                                if (!t) return <span className="text-xs text-gray-400">-</span>;
                                return (
                                  <TemperatureBadge
                                    temperature={t}
                                    rules={temperatureRules}
                                    size="sm"
                                  />
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-semibold text-sm text-purple-600 dark:text-purple-400">
                                {formatCurrency(getLeadValue(lead))}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              {agentData ? (
                                <div className="flex items-center gap-2">
                                  {agentData.photo_url ? (
                                    <img
                                      src={agentData.photo_url}
                                      alt={agentData.name}
                                      className="w-6 h-6 rounded-full object-cover ring-2 ring-white dark:ring-gray-800"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                                      {agentData.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <span className="text-sm text-gray-600 dark:text-gray-400">
                                    {agentData.name}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {formatDate(lead.createdAt)}
                              </span>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
          <DialogContent className="max-w-2xl glass-card border-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 text-white">
                  <Building2 className="w-4 h-4" />
                </div>
                Novo Lead PJ
              </DialogTitle>
            </DialogHeader>
            <QuickLeadPJForm
              onSuccess={() => {
                setIsFormOpen(false);
                queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
              }}
              onCancel={() => setIsFormOpen(false)}
            />
          </DialogContent>
        </Dialog>
        <Dialog open={!!lostReasonDialog} onOpenChange={(open) => { if (!open) setLostReasonDialog(null); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                Motivo da Perda
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Informe o motivo pelo qual este lead foi perdido:
              </p>
              <textarea
                className="w-full min-h-[100px] p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                placeholder="Ex: Preço acima do orçamento, escolheu concorrente, sem resposta..."
                value={lostReasonText}
                onChange={(e) => setLostReasonText(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setLostReasonDialog(null)}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={!lostReasonText.trim()}
                  onClick={() => {
                    if (!lostReasonDialog) return;
                    const { leadId, fromStage, isDarBaixa } = lostReasonDialog;
                    const lead = leadsPJ.find(l => String(l.id) === String(leadId));

                    const stageHistory = [...(lead?.stageHistory || lead?.stage_history || [])];
                    if (fromStage) {
                      stageHistory.push({
                        from: fromStage,
                        to: 'fechado_perdido',
                        changedAt: new Date().toISOString(),
                        changedBy: user?.email,
                      });
                    }

                    const updateData = {
                      stage: 'fechado_perdido',
                      stageHistory,
                      lostReason: lostReasonText.trim(),
                      lost: true,
                    };

                    updateLeadMutation.mutate({ id: leadId, data: updateData });
                    toast.success('Lead marcado como perdido');
                    setLostReasonDialog(null);
                    setLostReasonText('');
                  }}
                >
                  Confirmar Perda
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel="Cancelar"
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </motion.div>
  );
}