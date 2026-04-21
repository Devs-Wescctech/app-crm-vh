import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, isWithinInterval, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Filter, Search, X, Users, Building2, User as UserIcon, Clock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";

import {
  hasFullVisibility,
  hasTeamVisibility,
  isSupervisorType,
  getVisibleAgentIds,
} from "@/components/utils/permissions";

// Lê valor de um objeto suportando snake_case e camelCase
function getVal(obj, ...keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return undefined;
}

// Mapa de status visuais (badge)
const STATUS_STYLES = {
  agendado: { label: "Agendado", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800" },
  concluido: { label: "Concluído", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800" },
  cancelado: { label: "Cancelado", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border-rose-200 dark:border-rose-800" },
  reagendado: { label: "Reagendado", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800" },
};

function getActivityStatus(activity) {
  const completed = getVal(activity, "completed");
  const outcome = getVal(activity, "outcome");
  if (outcome === "cancelado") return "cancelado";
  if (outcome === "reagendado") return "reagendado";
  if (completed) return "concluido";
  return "agendado";
}

function StatusBadge({ activity }) {
  const status = getActivityStatus(activity);
  const cfg = STATUS_STYLES[status] || STATUS_STYLES.agendado;
  return (
    <Badge variant="outline" className={`${cfg.className} font-medium`}>
      {cfg.label}
    </Badge>
  );
}

// Resolve um intervalo de datas a partir do preset selecionado
function resolveDateRange(preset, custom) {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "week":
      return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
    case "next7":
      return { from: startOfDay(now), to: endOfDay(addDays(now, 7)) };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
    case "custom":
      if (custom?.from && custom?.to) {
        return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
      }
      return null;
    case "all":
    default:
      return null;
  }
}

function PeriodFilter({ value, custom, onChange, onCustomChange }) {
  const presets = [
    { id: "today", label: "Hoje" },
    { id: "week", label: "Esta semana" },
    { id: "next7", label: "Próximos 7 dias" },
    { id: "month", label: "Este mês" },
    { id: "all", label: "Todos" },
    { id: "custom", label: "Personalizado" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[180px]">
          <CalendarIcon className="w-4 h-4 mr-2 text-gray-500" />
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value === "custom" && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="justify-start text-left font-normal">
              <CalendarIcon className="w-4 h-4 mr-2" />
              {custom?.from && custom?.to
                ? `${format(custom.from, "dd/MM/yyyy")} – ${format(custom.to, "dd/MM/yyyy")}`
                : "Selecione um intervalo"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={custom}
              onSelect={onCustomChange}
              numberOfMonths={2}
              locale={ptBR}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function SearchableSelect({ value, onChange, options, placeholder, icon: Icon }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, search]);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[200px] justify-start text-left font-normal">
          {Icon && <Icon className="w-4 h-4 mr-2 text-gray-500" />}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="start">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="pl-8 h-9"
            autoFocus
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto -mx-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500">Nada encontrado</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                  value === opt.value
                    ? "bg-[#5A2A3C]/10 text-[#5A2A3C] font-medium"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800"
                }`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FormattedDateTime({ date }) {
  if (!date) return <span className="text-gray-400">—</span>;
  let d;
  try { d = typeof date === "string" ? parseISO(date) : date; } catch { return <span className="text-gray-400">—</span>; }
  if (!d || !isValid(d)) return <span className="text-gray-400">—</span>;
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-medium text-gray-900 dark:text-gray-100">{format(d, "dd/MM/yyyy", { locale: ptBR })}</span>
      <span className="text-xs text-gray-500 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {format(d, "HH:mm")}
      </span>
    </div>
  );
}

function AgendaDetailsModal({ activity, lead, vendedor, supervisor, onClose }) {
  if (!activity) return null;
  const scheduledAt = getVal(activity, "scheduledAt", "scheduled_at");
  let scheduled = scheduledAt ? parseISO(scheduledAt) : null;
  if (scheduled && !isValid(scheduled)) scheduled = null;
  const duration = getVal(activity, "duration", "durationMinutes", "duration_minutes");
  const description = getVal(activity, "description");
  const notes = getVal(activity, "notes");
  const createdAt = getVal(activity, "createdAt", "created_at");
  const updatedAt = getVal(activity, "updatedAt", "updated_at");

  return (
    <Dialog open={!!activity} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div>
              <DialogTitle className="text-xl">
                {getVal(activity, "title") || "Agendamento"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm">
                {scheduled
                  ? `${format(scheduled, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                  : "Sem data definida"}
              </DialogDescription>
            </div>
            <StatusBadge activity={activity} />
          </div>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Informações principais</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
              <Field label="Data" value={scheduled ? format(scheduled, "dd/MM/yyyy", { locale: ptBR }) : "—"} />
              <Field label="Hora" value={scheduled ? format(scheduled, "HH:mm") : "—"} />
              <Field label="Duração" value={duration ? `${duration} min` : "—"} />
              <Field label="Tipo" value={getVal(activity, "type") || "—"} />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Envolvidos</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
              <Field label="Vendedor" value={vendedor?.name || vendedor?.email || "—"} sub={vendedor?.email} />
              <Field label="Supervisor" value={supervisor?.name || "—"} sub={supervisor?.email} />
            </div>
          </section>

          {lead && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Cliente / Empresa</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
                <Field label="Empresa" value={getVal(lead, "razaoSocial", "razao_social") || getVal(lead, "nomeFantasia", "nome_fantasia") || "—"} />
                <Field label="CNPJ" value={getVal(lead, "cnpj") || "—"} />
                <Field label="Contato" value={getVal(lead, "contactName", "contact_name") || "—"} />
                <Field
                  label="Telefone / E-mail"
                  value={getVal(lead, "contactPhone", "contact_phone") || "—"}
                  sub={getVal(lead, "contactEmail", "contact_email")}
                />
              </div>
            </section>
          )}

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Detalhes</h3>
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg">
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Descrição</div>
                <div className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                  {description || <span className="text-gray-400">Sem descrição</span>}
                </div>
              </div>
              {notes && (
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1">Observações internas</div>
                  <div className="text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">{notes}</div>
                </div>
              )}
            </div>
          </section>

          {(createdAt || updatedAt) && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Metadados</h3>
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg text-xs">
                <Field label="Criado em" value={(() => { if (!createdAt) return "—"; const d = parseISO(createdAt); return isValid(d) ? format(d, "dd/MM/yyyy HH:mm") : "—"; })()} />
                <Field label="Atualizado em" value={(() => { if (!updatedAt) return "—"; const d = parseISO(updatedAt); return isValid(d) ? format(d, "dd/MM/yyyy HH:mm") : "—"; })()} />
              </div>
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value, sub }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function AgendasPanel() {
  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => base44.entities.Team.list(),
    enabled: !!user,
  });

  const { data: activities = [], isLoading: loadingActivities, refetch } = useQuery({
    queryKey: ["activitiesPJ", "panel"],
    queryFn: () => base44.entities.ActivityPJ.list("scheduled_at desc", 10000),
    enabled: !!user,
    staleTime: 1000 * 30,
    refetchOnMount: "always",
  });

  const { data: leadsPJ = [] } = useQuery({
    queryKey: ["leadsPJ", "panel"],
    queryFn: () => base44.entities.LeadPJ.list(undefined, 10000),
    enabled: !!user,
    staleTime: 1000 * 60,
  });

  const currentAgent = user?.agent || agents.find((a) => a.userEmail === user?.email || a.email === user?.email);
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isCoordinatorOrAdmin = hasFullVisibility(currentAgent);
  const isSupervisor = isSupervisorType(currentAgentType) && !isCoordinatorOrAdmin;

  // Mapas auxiliares -----
  const leadById = useMemo(() => {
    const m = new Map();
    leadsPJ.forEach((l) => m.set(l.id, l));
    return m;
  }, [leadsPJ]);

  const agentByIdOrEmail = useMemo(() => {
    const m = new Map();
    agents.forEach((a) => {
      m.set(a.id, a);
      if (a.email) m.set(a.email.toLowerCase(), a);
    });
    return m;
  }, [agents]);

  const supervisorByAgentId = useMemo(() => {
    // Resolve o supervisor de cada vendedor: tenta supervisor_id direto, depois o team.supervisor_id
    const teamById = new Map(teams.map((t) => [t.id, t]));
    const m = new Map();
    agents.forEach((a) => {
      const directSupId = a.supervisorId || a.supervisor_id;
      if (directSupId) {
        m.set(a.id, agentByIdOrEmail.get(directSupId) || null);
        return;
      }
      const teamId = a.teamId || a.team_id;
      const team = teamId ? teamById.get(teamId) : null;
      const supId = team?.supervisorId || team?.supervisor_id;
      if (supId) m.set(a.id, agentByIdOrEmail.get(supId) || null);
    });
    return m;
  }, [agents, teams, agentByIdOrEmail]);

  // Lógica de visibilidade por perfil ----
  // Coordenador/Admin: todos os vendedores. Supervisor: apenas seus subordinados.
  const visibleAgentIds = useMemo(() => {
    if (!currentAgent) return [];
    return getVisibleAgentIds(currentAgent, agents);
  }, [currentAgent, agents]);

  const visibleSalesAgents = useMemo(() => {
    return agents.filter((a) => visibleAgentIds.includes(a.id));
  }, [agents, visibleAgentIds]);

  const supervisorsList = useMemo(() => {
    if (!isCoordinatorOrAdmin) return [];
    return agents.filter((a) => isSupervisorType(a.agentType || a.agent_type));
  }, [agents, isCoordinatorOrAdmin]);

  // Filtros -----
  const [periodPreset, setPeriodPreset] = useState("week");
  const [customRange, setCustomRange] = useState(null);
  const [vendedorFilter, setVendedorFilter] = useState("all");
  // Para supervisor logado, fixa o próprio id e oculta o filtro
  const [supervisorFilter, setSupervisorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedActivity, setSelectedActivity] = useState(null);

  const dateRange = useMemo(() => resolveDateRange(periodPreset, customRange), [periodPreset, customRange]);

  // Resolve agent a partir do campo `assigned_to` (que pode ser id, email ou nome)
  const resolveAssignedAgent = (activity) => {
    const raw = getVal(activity, "assignedTo", "assigned_to");
    if (!raw) {
      const createdBy = getVal(activity, "createdBy", "created_by");
      return createdBy ? agentByIdOrEmail.get(createdBy) : null;
    }
    const direct = agentByIdOrEmail.get(raw) || agentByIdOrEmail.get(String(raw).toLowerCase());
    if (direct) return direct;
    return null;
  };

  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      const scheduledAt = getVal(act, "scheduledAt", "scheduled_at");
      if (!scheduledAt) return false;
      let scheduled;
      try { scheduled = parseISO(scheduledAt); } catch { return false; }
      if (!scheduled || !isValid(scheduled)) return false;

      if (dateRange && !isWithinInterval(scheduled, dateRange)) return false;

      const vendedor = resolveAssignedAgent(act);
      const vendedorId = vendedor?.id;

      // Visibilidade por perfil
      if (vendedorId) {
        if (!visibleAgentIds.includes(vendedorId)) return false;
      } else if (!isCoordinatorOrAdmin) {
        // sem vendedor identificado e usuário não é coord/admin: descarta
        return false;
      }

      // Filtro de vendedor
      if (vendedorFilter !== "all" && vendedorId !== vendedorFilter) return false;

      // Filtro de supervisor (apenas para coord/admin)
      if (isCoordinatorOrAdmin && supervisorFilter !== "all") {
        const sup = vendedorId ? supervisorByAgentId.get(vendedorId) : null;
        if (!sup || sup.id !== supervisorFilter) return false;
      }

      return true;
    });
  }, [activities, dateRange, vendedorFilter, supervisorFilter, visibleAgentIds, isCoordinatorOrAdmin, supervisorByAgentId, agentByIdOrEmail]);

  const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredActivities.slice(start, start + pageSize);
  }, [filteredActivities, safePage, pageSize]);

  const handleClearFilters = () => {
    setPeriodPreset("week");
    setCustomRange(null);
    setVendedorFilter("all");
    setSupervisorFilter("all");
    setPage(1);
  };

  const vendedorOptions = useMemo(
    () => [
      { value: "all", label: "Todos os vendedores" },
      ...visibleSalesAgents
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((a) => ({ value: a.id, label: a.name || a.email })),
    ],
    [visibleSalesAgents]
  );

  const supervisorOptions = useMemo(
    () => [
      { value: "all", label: "Todos os supervisores" },
      ...supervisorsList
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
        .map((a) => ({ value: a.id, label: a.name || a.email })),
    ],
    [supervisorsList]
  );

  const totalCount = filteredActivities.length;

  return (
    <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Painel de Agendas</h1>
          <p className="text-gray-500 mt-1">Visualize e gerencie os agendamentos de toda a equipe em um só lugar.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1.5 text-sm bg-white dark:bg-gray-900">
            Total de agendamentos: <span className="font-semibold ml-1">{totalCount}</span>
          </Badge>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={loadingActivities}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loadingActivities ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-300 mr-1">
              <Filter className="w-4 h-4" />
              Filtros
            </div>

            <PeriodFilter
              value={periodPreset}
              custom={customRange}
              onChange={(v) => { setPeriodPreset(v); setPage(1); }}
              onCustomChange={(r) => { setCustomRange(r); setPage(1); }}
            />

            <SearchableSelect
              value={vendedorFilter}
              onChange={(v) => { setVendedorFilter(v); setPage(1); }}
              options={vendedorOptions}
              placeholder="Selecione o vendedor"
              icon={UserIcon}
            />

            {/* Lógica de permissão: filtro de supervisor só aparece para Coordenador/Admin.
                Para Supervisor, a lista já vem restrita aos seus vendedores via getVisibleAgentIds. */}
            {isCoordinatorOrAdmin && (
              <SearchableSelect
                value={supervisorFilter}
                onChange={(v) => { setSupervisorFilter(v); setPage(1); }}
                options={supervisorOptions}
                placeholder="Selecione o supervisor"
                icon={Users}
              />
            )}

            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="text-gray-600">
              <X className="w-4 h-4 mr-1" />
              Limpar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 dark:bg-gray-800/40">
                <TableHead className="w-[140px]">Data / Hora</TableHead>
                <TableHead>Assunto</TableHead>
                <TableHead>Vendedor</TableHead>
                {isCoordinatorOrAdmin && <TableHead>Supervisor</TableHead>}
                <TableHead>Cliente</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingActivities ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={isCoordinatorOrAdmin ? 6 : 5}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              ) : pageItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isCoordinatorOrAdmin ? 6 : 5}>
                    <div className="py-12 text-center">
                      <CalendarIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" />
                      <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                        Nenhum agendamento encontrado para os filtros selecionados.
                      </div>
                      <Button variant="link" onClick={handleClearFilters} className="text-[#5A2A3C]">
                        Limpar filtros
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                pageItems.map((act) => {
                  const vendedor = resolveAssignedAgent(act);
                  const supervisor = vendedor ? supervisorByAgentId.get(vendedor.id) : null;
                  const lead = act.leadId || act.lead_id ? leadById.get(act.leadId || act.lead_id) : null;
                  const empresa = lead
                    ? (getVal(lead, "razaoSocial", "razao_social") || getVal(lead, "nomeFantasia", "nome_fantasia"))
                    : null;
                  return (
                    <TableRow
                      key={act.id}
                      onClick={() => setSelectedActivity(act)}
                      className="cursor-pointer hover:bg-[#5A2A3C]/5 transition-colors"
                    >
                      <TableCell>
                        <FormattedDateTime date={getVal(act, "scheduledAt", "scheduled_at")} />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[280px]" title={getVal(act, "title")}>
                          {getVal(act, "title") || <span className="text-gray-400">Sem título</span>}
                        </div>
                        {getVal(act, "type") && (
                          <div className="text-xs text-gray-500 capitalize mt-0.5">{getVal(act, "type")}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#5A2A3C] to-[#F98F6F] text-white flex items-center justify-center text-xs font-semibold">
                            {(vendedor?.name || vendedor?.email || "?").slice(0, 1).toUpperCase()}
                          </div>
                          <div className="text-sm">
                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[160px]">
                              {vendedor?.name || vendedor?.email || <span className="text-gray-400">—</span>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      {isCoordinatorOrAdmin && (
                        <TableCell>
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {supervisor?.name || <span className="text-gray-400">—</span>}
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-300">
                          <Building2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate max-w-[200px]" title={empresa || ""}>
                            {empresa || <span className="text-gray-400">—</span>}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge activity={act} />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Paginação */}
        {!loadingActivities && filteredActivities.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-800">
            <div className="text-xs text-gray-500">
              Mostrando {((safePage - 1) * pageSize) + 1}–{Math.min(safePage * pageSize, totalCount)} de {totalCount} agendamentos
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Itens por página:</span>
                <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="w-[80px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 25, 50, 100].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  Página {safePage} de {totalPages}
                </span>
                <Button variant="outline" size="sm" onClick={() => setPage(safePage + 1)} disabled={safePage >= totalPages}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <AgendaDetailsModal
        activity={selectedActivity}
        lead={selectedActivity ? leadById.get(selectedActivity.leadId || selectedActivity.lead_id) : null}
        vendedor={selectedActivity ? resolveAssignedAgent(selectedActivity) : null}
        supervisor={(() => {
          if (!selectedActivity) return null;
          const v = resolveAssignedAgent(selectedActivity);
          return v ? supervisorByAgentId.get(v.id) : null;
        })()}
        onClose={() => setSelectedActivity(null)}
      />
    </div>
  );
}
