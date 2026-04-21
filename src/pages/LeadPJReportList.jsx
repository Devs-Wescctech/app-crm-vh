import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileBarChart,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Building2,
  User as UserIcon,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  Loader2,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getVisibleAgentsForFilter,
} from "@/components/utils/permissions.jsx";
import { LEAD_PJ_STAGES } from "@/constants/stages";
import LeadPJTimeline from "@/components/sales/LeadPJTimeline";

const PAGE_SIZE = 20;

const formatDateTime = (value) => {
  if (!value) return "-";
  try {
    const d = typeof value === "string" ? parseISO(value) : new Date(value);
    if (!isValid(d)) return "-";
    return format(d, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "-";
  }
};

const stageColorMap = LEAD_PJ_STAGES.reduce((acc, s) => {
  acc[s.id] = s.color;
  return acc;
}, {});

const stageLabelMap = LEAD_PJ_STAGES.reduce((acc, s) => {
  acc[s.id] = s.label;
  return acc;
}, {});

function StageBadge({ stage }) {
  const color = stageColorMap[stage] || "#6b7280";
  const label = stageLabelMap[stage] || stage || "-";
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function SortHeader({ label, field, sort, onSort, className = "" }) {
  const active = sort.field === field;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        {label}
        <Icon className="w-3.5 h-3.5" />
      </button>
    </TableHead>
  );
}

function LeadDetailModal({ leadId, open, onClose }) {
  const { data: lead, isLoading: loadingLead } = useQuery({
    queryKey: ["leadPJ-modal", leadId],
    queryFn: () => base44.entities.LeadPJ.get(leadId),
    enabled: !!leadId && open,
  });

  const { data: activities = [], isLoading: loadingActivities } = useQuery({
    queryKey: ["activitiesPJ-modal", leadId],
    queryFn: () => base44.entities.ActivityPJ.filter({ lead_id: leadId }),
    enabled: !!leadId && open,
  });

  const { data: agent } = useQuery({
    queryKey: ["agent-modal", lead?.agentId || lead?.agent_id],
    queryFn: () => base44.entities.Agent.get(lead?.agentId || lead?.agent_id),
    enabled: !!(lead?.agentId || lead?.agent_id) && open,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="w-5 h-5 text-indigo-600" />
            Detalhes do Lead
          </DialogTitle>
        </DialogHeader>

        {loadingLead ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          </div>
        ) : !lead ? (
          <p className="text-center text-gray-500 py-12">Lead não encontrado.</p>
        ) : (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social || lead.contactName || lead.contact_name || "Sem nome"}
                  </h3>
                  {(lead.razaoSocial || lead.razao_social) && (lead.nomeFantasia || lead.nome_fantasia) && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {lead.razaoSocial || lead.razao_social}
                    </p>
                  )}
                  {lead.cnpj && (
                    <p className="text-sm font-mono text-gray-500 mt-1">CNPJ: {lead.cnpj}</p>
                  )}
                </div>
                <StageBadge stage={lead.stage} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoItem icon={UserIcon} label="Contato" value={lead.contactName || lead.contact_name} />
              <InfoItem icon={Phone} label="Telefone" value={lead.contactPhone || lead.contact_phone || lead.phone} />
              <InfoItem icon={Mail} label="E-mail" value={lead.contactEmail || lead.contact_email || lead.email} />
              <InfoItem
                icon={UserIcon}
                label="Vendedor"
                value={agent?.name || "Não atribuído"}
              />
              <InfoItem icon={CalendarIcon} label="Data de Cadastro" value={formatDateTime(lead.createdAt || lead.created_at)} />
              <InfoItem icon={Building2} label="Funcionários" value={lead.employeeCount || lead.employee_count || lead.numEmployees || lead.num_employees || "Não Informado"} />
            </div>

            {(lead.lostReason || lead.lost_reason) && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4">
                <p className="text-xs font-semibold text-red-700 dark:text-red-400 mb-1">Motivo da perda</p>
                <p className="text-sm text-red-800 dark:text-red-300">{lead.lostReason || lead.lost_reason}</p>
              </div>
            )}

            <div>
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                Linha do tempo
                {loadingActivities && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              </h4>
              <LeadPJTimeline activities={activities} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
      <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {value || "-"}
        </p>
      </div>
    </div>
  );
}

export default function LeadPJReportList() {
  const [filters, setFilters] = useState({
    cnpj: "",
    name: "",
    agent: "all",
    stage: "all",
    dateFrom: "",
    dateTo: "",
  });
  const [sort, setSort] = useState({ field: "created_at", dir: "desc" });
  const [page, setPage] = useState(1);
  const [selectedLeadId, setSelectedLeadId] = useState(null);

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const { data: allAgents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user,
  });

  const currentAgent = user?.agent || allAgents.find(a => a.userEmail === user?.email || a.user_email === user?.email);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads-pj-report-list", user?.id || user?.email],
    queryFn: () => base44.entities.LeadPJ.list("-createdDate", 10000),
    enabled: !!user,
  });

  const agentMap = useMemo(() => {
    const m = {};
    allAgents.forEach((a) => {
      m[String(a.id)] = a;
    });
    return m;
  }, [allAgents]);

  const visibleAgents = useMemo(
    () =>
      getVisibleAgentsForFilter(currentAgent, allAgents, teams).filter(
        (a) => (a.agent_type || a.agentType) === "sales"
      ),
    [currentAgent, allAgents]
  );

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (filters.cnpj && !(l.cnpj || "").toLowerCase().includes(filters.cnpj.toLowerCase())) return false;
      if (filters.name) {
        const q = filters.name.toLowerCase();
        const inName =
          (l.nomeFantasia || l.nome_fantasia || "").toLowerCase().includes(q) ||
          (l.razaoSocial || l.razao_social || "").toLowerCase().includes(q) ||
          (l.contactName || l.contact_name || "").toLowerCase().includes(q);
        if (!inName) return false;
      }
      if (filters.agent !== "all" && String(l.agentId || l.agent_id) !== filters.agent) return false;
      if (filters.stage !== "all" && l.stage !== filters.stage) return false;
      if (filters.dateFrom) {
        const created = new Date(l.createdAt || l.created_at);
        const from = new Date(filters.dateFrom);
        from.setHours(0, 0, 0, 0);
        if (!isValid(created) || created < from) return false;
      }
      if (filters.dateTo) {
        const created = new Date(l.createdAt || l.created_at);
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        if (!isValid(created) || created > to) return false;
      }
      return true;
    });
  }, [leads, filters]);

  const sortedLeads = useMemo(() => {
    const arr = [...filteredLeads];
    const { field, dir } = sort;
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av, bv;
      if (field === "cnpj") {
        av = a.cnpj || ""; bv = b.cnpj || "";
      } else if (field === "name") {
        av = a.nomeFantasia || a.nome_fantasia || a.razaoSocial || a.razao_social || a.contactName || a.contact_name || "";
        bv = b.nomeFantasia || b.nome_fantasia || b.razaoSocial || b.razao_social || b.contactName || b.contact_name || "";
      } else if (field === "agent") {
        av = agentMap[String(a.agentId || a.agent_id)]?.name || "";
        bv = agentMap[String(b.agentId || b.agent_id)]?.name || "";
      } else if (field === "stage") {
        av = stageLabelMap[a.stage] || ""; bv = stageLabelMap[b.stage] || "";
      } else {
        av = new Date(a.createdAt || a.created_at).getTime() || 0;
        bv = new Date(b.createdAt || b.created_at).getTime() || 0;
      }
      if (av < bv) return -1 * mult;
      if (av > bv) return 1 * mult;
      return 0;
    });
    return arr;
  }, [filteredLeads, sort, agentMap]);

  const totalPages = Math.max(1, Math.ceil(sortedLeads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedLeads = sortedLeads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleSort = (field) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" }
    );
    setPage(1);
  };

  const updateFilter = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({ cnpj: "", name: "", agent: "all", stage: "all", dateFrom: "", dateTo: "" });
    setPage(1);
  };

  const hasActiveFilters =
    filters.cnpj ||
    filters.name ||
    filters.agent !== "all" ||
    filters.stage !== "all" ||
    filters.dateFrom ||
    filters.dateTo;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
            <FileBarChart className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Relatório de Leads</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Listagem consolidada com detalhes em modal
            </p>
          </div>
        </div>

        <Card className="border-0 shadow-soft">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">CNPJ</label>
                <Input
                  placeholder="00.000.000/0000-00"
                  value={filters.cnpj}
                  onChange={(e) => updateFilter({ cnpj: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Nome / Empresa</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    className="pl-10"
                    placeholder="Razão social, fantasia, contato"
                    value={filters.name}
                    onChange={(e) => updateFilter({ name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Vendedor</label>
                <Select value={filters.agent} onValueChange={(val) => updateFilter({ agent: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os vendedores</SelectItem>
                    {visibleAgents.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Status</label>
                <Select value={filters.stage} onValueChange={(val) => updateFilter({ stage: val })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    {LEAD_PJ_STAGES.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">De</label>
                <Input type="date" value={filters.dateFrom} onChange={(e) => updateFilter({ dateFrom: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1 block">Até</label>
                <Input type="date" value={filters.dateTo} onChange={(e) => updateFilter({ dateTo: e.target.value })} />
              </div>
            </div>
            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="w-4 h-4 mr-1.5" /> Limpar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-soft">
          <CardContent className="p-0">
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {isLoading ? (
                  "Carregando..."
                ) : (
                  <>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{sortedLeads.length}</span>{" "}
                    {sortedLeads.length === 1 ? "lead encontrado" : "leads encontrados"}
                  </>
                )}
              </div>
              <Badge variant="secondary" className="text-xs">
                Página {safePage} de {totalPages}
              </Badge>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <SortHeader label="CNPJ" field="cnpj" sort={sort} onSort={handleSort} />
                  <SortHeader label="Empresa" field="name" sort={sort} onSort={handleSort} />
                  <SortHeader label="Data de Cadastro" field="created_at" sort={sort} onSort={handleSort} />
                  <SortHeader label="Vendedor" field="agent" sort={sort} onSort={handleSort} />
                  <SortHeader label="Status" field="stage" sort={sort} onSort={handleSort} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                    </TableCell>
                  </TableRow>
                ) : pagedLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                      Nenhum lead encontrado com os filtros atuais.
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedLeads.map((lead) => {
                    const agent = agentMap[String(lead.agentId || lead.agent_id)];
                    return (
                      <TableRow
                        key={lead.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedLeadId(lead.id)}
                      >
                        <TableCell className="font-mono text-xs">{lead.cnpj || "-"}</TableCell>
                        <TableCell>
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social || lead.contactName || lead.contact_name || "Sem nome"}
                          </div>
                          {(lead.razaoSocial || lead.razao_social) && (lead.nomeFantasia || lead.nome_fantasia) && (
                            <div className="text-xs text-gray-500 dark:text-gray-400">{lead.razaoSocial || lead.razao_social}</div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDateTime(lead.createdAt || lead.created_at)}
                        </TableCell>
                        <TableCell>{agent?.name || <span className="text-gray-400 italic">Não atribuído</span>}</TableCell>
                        <TableCell><StageBadge stage={lead.stage} /></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Página {safePage} de {totalPages}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                >
                  Próxima <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <LeadDetailModal
        leadId={selectedLeadId}
        open={!!selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
      />
    </div>
  );
}
