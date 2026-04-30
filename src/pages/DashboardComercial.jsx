import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ShieldX, RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { isSupervisorType } from "@/components/utils/permissions";

const ACCENT = "#F98F6F";
const ACCENT_DARK = "#E07050";
const PANEL_BG = "#1E2433";
const PANEL_BORDER = "#2A3142";
const TEXT_MUTED = "#9AA3B5";
const TEXT_BRIGHT = "#E5E9F2";

const MESES = [
  { value: "all", label: "Todos os meses" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

function buildAnos() {
  const now = new Date().getFullYear();
  const list = [{ value: "all", label: "Todos os anos" }];
  for (let y = now; y >= now - 4; y--) {
    list.push({ value: String(y), label: String(y) });
  }
  return list;
}
const ANOS = buildAnos();

function formatMonthLabel(ym) {
  if (!ym) return "";
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const date = new Date(y, (m || 1) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function formatDayLabel(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map((n) => parseInt(n, 10));
  const date = new Date(y, (m || 1) - 1, d || 1);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fetchDashboard(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "" && v !== "all") {
      search.append(k, String(v));
    }
  });
  const token = localStorage.getItem("accessToken");
  return fetch(`/api/functions/sales-pj-dashboard-comercial?${search.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }).then(async (r) => {
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || "Erro ao carregar dashboard");
    }
    return r.json();
  });
}

function PanelTitle({ children }) {
  return (
    <h3
      className="text-[11px] font-semibold tracking-[0.2em] uppercase mb-3"
      style={{ color: TEXT_MUTED }}
    >
      {children}
    </h3>
  );
}

function Panel({ title, children, className = "", padding = "p-4" }) {
  return (
    <Card
      className={`${padding} border-0 ${className}`}
      style={{ backgroundColor: PANEL_BG, color: TEXT_BRIGHT }}
    >
      {title && <PanelTitle>{title}</PanelTitle>}
      {children}
    </Card>
  );
}

function BarList({ data, page = 0, pageSize = 8, showPct = true }) {
  if (!data || data.length === 0) {
    return <div className="text-xs py-6 text-center" style={{ color: TEXT_MUTED }}>Sem dados</div>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);
  const slice = data.slice(page * pageSize, page * pageSize + pageSize);
  return (
    <ul className="space-y-1.5">
      {slice.map((row, i) => {
        const widthPct = (row.value / max) * 100;
        return (
          <li
            key={`${row.label}-${i}`}
            className="relative flex items-center justify-between text-xs px-2 py-1.5 rounded overflow-hidden"
            style={{ backgroundColor: "#252B3B" }}
          >
            <div
              className="absolute inset-y-0 left-0 transition-all"
              style={{
                width: `${widthPct}%`,
                backgroundColor: ACCENT,
                opacity: 0.85,
              }}
            />
            <span className="relative truncate pr-2" style={{ color: "#0F1320", fontWeight: 600 }}>
              {row.label}
            </span>
            <span className="relative ml-auto text-[11px] font-mono" style={{ color: "#0F1320", fontWeight: 700 }}>
              {showPct && row.pct !== undefined ? `${row.pct.toFixed(2).replace(".", ",")}%` : row.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ListPaged({ items, pageSize = 8, showPct = false }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil((items?.length || 0) / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * pageSize + 1;
  const end = Math.min((safePage + 1) * pageSize, items?.length || 0);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        <BarList data={items || []} page={safePage} pageSize={pageSize} showPct={showPct} />
      </div>
      {(items?.length || 0) > 0 && (
        <div className="flex items-center justify-between mt-2 text-[10px]" style={{ color: TEXT_MUTED }}>
          <span>{`${start} - ${end} / ${items.length}`}</span>
          <div className="flex items-center gap-1">
            <button
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
            >
              ‹
            </button>
            <button
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/10 disabled:opacity-30"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={safePage >= totalPages - 1}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductBars({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-xs py-6 text-center" style={{ color: TEXT_MUTED }}>Sem dados</div>;
  }
  const top = data.slice(0, 7);
  return (
    <ResponsiveContainer width="100%" height={140}>
      <BarChart data={top} margin={{ top: 18, right: 6, left: 6, bottom: 18 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: TEXT_MUTED, fontSize: 9 }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={32}
        />
        <YAxis hide />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.05)" }}
          contentStyle={{
            backgroundColor: PANEL_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 6,
            color: TEXT_BRIGHT,
            fontSize: 11,
          }}
        />
        <Bar dataKey="value" fill={ACCENT} radius={[2, 2, 0, 0]}>
          <LabelList dataKey="value" position="top" fill={TEXT_BRIGHT} fontSize={10} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthLine({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-xs py-6 text-center" style={{ color: TEXT_MUTED }}>Sem dados</div>;
  }
  const display = data.map((d) => ({ ...d, monthLabel: formatMonthLabel(d.month) }));
  return (
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={display} margin={{ top: 18, right: 12, left: 6, bottom: 18 }}>
        <XAxis
          dataKey="monthLabel"
          tick={{ fill: TEXT_MUTED, fontSize: 9 }}
          interval={0}
          height={32}
          angle={-20}
          textAnchor="end"
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            backgroundColor: PANEL_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 6,
            color: TEXT_BRIGHT,
            fontSize: 11,
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={ACCENT}
          strokeWidth={2}
          dot={{ fill: ACCENT, r: 3 }}
          activeDot={{ r: 5 }}
        >
          <LabelList dataKey="value" position="top" fill={TEXT_BRIGHT} fontSize={10} />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

function DayLine({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-sm py-12 text-center" style={{ color: TEXT_MUTED }}>Sem dados no período</div>;
  }
  const display = data.map((d) => ({ ...d, dayLabel: formatDayLabel(d.day) }));
  // tick density: ~12 ticks
  const tickStep = Math.max(1, Math.floor(display.length / 12));
  const tickValues = display.filter((_, i) => i % tickStep === 0).map((d) => d.dayLabel);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={display} margin={{ top: 24, right: 24, left: 12, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2A3142" vertical={false} />
        <XAxis
          dataKey="dayLabel"
          tick={{ fill: TEXT_MUTED, fontSize: 10 }}
          ticks={tickValues}
          interval={0}
          height={36}
        />
        <YAxis hide />
        <Tooltip
          contentStyle={{
            backgroundColor: PANEL_BG,
            border: `1px solid ${PANEL_BORDER}`,
            borderRadius: 6,
            color: TEXT_BRIGHT,
            fontSize: 11,
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={ACCENT}
          strokeWidth={1.6}
          dot={{ fill: ACCENT, r: 1.6 }}
          activeDot={{ r: 4 }}
        >
          <LabelList
            dataKey="value"
            position="top"
            fill={TEXT_BRIGHT}
            fontSize={9}
            content={({ x, y, value, index }) => {
              // only label local peaks to avoid clutter
              if (!display[index]) return null;
              const v = Number(value) || 0;
              const prev = display[index - 1]?.value || 0;
              const next = display[index + 1]?.value || 0;
              if (v <= prev || v <= next || v < 2) return null;
              return (
                <text x={x} y={y - 4} fill={TEXT_BRIGHT} fontSize={9} textAnchor="middle">
                  {v}
                </text>
              );
            }}
          />
        </Line>
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function DashboardComercial() {
  const [mes, setMes] = useState("all");
  const [ano, setAno] = useState("all");
  const [produto, setProduto] = useState("all");
  const [tabulacao, setTabulacao] = useState("all");

  const { data: user, isLoading: isUserLoading, error: userError } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const agentType = user?.agent?.agentType || user?.agent?.agent_type;
  const allowed =
    user?.role === "admin" ||
    agentType === "admin" ||
    agentType === "coordinator" ||
    isSupervisorType(agentType);

  const filters = useMemo(() => ({ mes, ano, produto, tabulacao }), [mes, ano, produto, tabulacao]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["dashboard-comercial", filters],
    queryFn: () => fetchDashboard(filters),
    enabled: !!user && allowed,
    staleTime: 30000,
  });

  // If we couldn't even load the current user (network error, expired token,
  // backend down) show a clear failure state instead of an empty dashboard
  // shell that the user can't make sense of.
  if (!isUserLoading && (userError || !user)) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: "#0F1320" }}>
        <Card className="max-w-md p-8 text-center border-0" style={{ backgroundColor: PANEL_BG, color: TEXT_BRIGHT }}>
          <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold mb-2">Não foi possível carregar seu usuário</h2>
          <p className="text-sm mb-4" style={{ color: TEXT_MUTED }}>
            Verifique sua conexão e faça login novamente. Se o problema persistir, contate o administrador.
          </p>
          <Button
            onClick={() => window.location.reload()}
            style={{ backgroundColor: ACCENT, color: "#0F1320" }}
          >
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
        </Card>
      </div>
    );
  }

  if (!isUserLoading && user && !allowed) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ backgroundColor: "#0F1320" }}>
        <Card className="max-w-md p-8 text-center border-0" style={{ backgroundColor: PANEL_BG, color: TEXT_BRIGHT }}>
          <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-400" />
          <h2 className="text-xl font-bold mb-2">Acesso restrito</h2>
          <p className="text-sm" style={{ color: TEXT_MUTED }}>
            O Dashboard Comercial está disponível apenas para administradores, coordenadores e supervisores.
          </p>
        </Card>
      </div>
    );
  }

  const tabulacaoOptions = data?.availableTabulacoes || [
    "Sem Conversão",
    "Em Negociação",
    "Remarcar Call",
    "Analisando Proposta",
    "Repetido",
    "Convertido",
  ];

  return (
    <div className="min-h-screen p-4 md:p-6" style={{ backgroundColor: "#0F1320" }}>
      <div className="grid grid-cols-12 gap-4">
        {/* Sidebar with title + filters */}
        <aside className="col-span-12 lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full border-2" style={{ borderColor: ACCENT }} />
            <span className="text-xl font-extrabold tracking-wider" style={{ color: ACCENT }}>
              COMERCIAL
            </span>
          </div>

          <div className="space-y-3">
            <FilterSelect label="MÊS" value={mes} onChange={setMes} options={MESES} />
            <FilterSelect label="ANO" value={ano} onChange={setAno} options={ANOS} />
            <FilterSelect
              label="PRODUTO"
              value={produto}
              onChange={setProduto}
              options={[
                { value: "all", label: "Todos os produtos" },
                ...((data?.availableProducts || []).map((p) => ({ value: String(p.id), label: p.name }))),
              ]}
            />
            <FilterSelect
              label="FILTRO TABULAÇÃO"
              value={tabulacao}
              onChange={setTabulacao}
              options={[
                { value: "all", label: "Todas" },
                ...tabulacaoOptions.map((t) => ({ value: t, label: t })),
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setMes("all");
                setAno("all");
                setProduto("all");
                setTabulacao("all");
              }}
              className="w-full text-xs"
              style={{ color: TEXT_MUTED }}
            >
              Limpar filtros
            </Button>
          </div>

          <Panel title="Tabulação" padding="p-3">
            <ListPaged items={data?.tabulacao || []} pageSize={6} showPct />
          </Panel>
        </aside>

        {/* Main grid */}
        <main className="col-span-12 lg:col-span-10 space-y-4">
          {/* Row 1: Total / Produto / Origem / Lead Mês */}
          <div className="grid grid-cols-12 gap-4">
            <Panel title="Total Leads" className="col-span-12 md:col-span-3 lg:col-span-2">
              <div className="flex flex-col items-center justify-center py-3">
                <span className="text-5xl font-extrabold" style={{ color: ACCENT }}>
                  {isLoading ? "…" : (data?.totalLeads ?? 0).toLocaleString("pt-BR")}
                </span>
              </div>
            </Panel>

            <Panel title="Produto" className="col-span-12 md:col-span-9 lg:col-span-3">
              <ProductBars data={data?.produto} />
            </Panel>

            <Panel title="Origem" className="col-span-12 md:col-span-6 lg:col-span-3">
              <ListPaged items={data?.origem || []} pageSize={6} showPct />
            </Panel>

            <Panel title="Lead/Mês" className="col-span-12 md:col-span-6 lg:col-span-4">
              <MonthLine data={data?.leadPorMes} />
            </Panel>
          </div>

          {/* Row 2: Etapa / Empresa / Nome / Cargo */}
          <div className="grid grid-cols-12 gap-4">
            <Panel title="Etapa" className="col-span-12 md:col-span-6 lg:col-span-3">
              <ListPaged items={data?.etapa || []} pageSize={9} showPct />
            </Panel>

            <Panel title="Lead Empresa" className="col-span-12 md:col-span-6 lg:col-span-3">
              <ListPaged items={data?.leadEmpresa || []} pageSize={9} />
            </Panel>

            <Panel title="Lead Nome" className="col-span-12 md:col-span-6 lg:col-span-3">
              <ListPaged items={data?.leadNome || []} pageSize={9} />
            </Panel>

            <Panel title="Cargo Declarado" className="col-span-12 md:col-span-6 lg:col-span-3">
              <ListPaged items={data?.cargoDeclarado || []} pageSize={9} />
            </Panel>
          </div>

          {/* Row 3: Leads/Dia full-width */}
          <Panel title="Leads/Dia" padding="p-4">
            <DayLine data={data?.leadsPorDia} />
          </Panel>

          {error && (
            <div className="text-sm text-red-400 flex items-center gap-2">
              <span>Erro: {error.message}</span>
              <button
                className="underline inline-flex items-center gap-1"
                onClick={() => refetch()}
              >
                <RefreshCw className="w-3 h-3" /> Tentar novamente
              </button>
            </div>
          )}
          {isFetching && !isLoading && (
            <div className="text-[11px] text-right" style={{ color: TEXT_MUTED }}>
              Atualizando…
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger
          className="w-full h-9 text-xs border"
          style={{
            backgroundColor: PANEL_BG,
            borderColor: PANEL_BORDER,
            color: TEXT_BRIGHT,
          }}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="text-[10px] mt-1 tracking-widest" style={{ color: TEXT_MUTED }}>
        {label}
      </div>
    </div>
  );
}
