import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { Calendar } from "@/components/ui/calendar";
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Filter, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const PERIOD_PRESETS = [
  { id: "today", label: "Hoje", getDates: () => ({ from: new Date(), to: new Date() }) },
  { id: "yesterday", label: "Ontem", getDates: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { id: "last7days", label: "Últimos 7 dias", getDates: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
  { id: "last30days", label: "Últimos 30 dias", getDates: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
  { id: "thisMonth", label: "Este mês", getDates: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { id: "lastMonth", label: "Mês passado", getDates: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { id: "thisYear", label: "Este ano", getDates: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
  { id: "all", label: "Todo período", getDates: () => ({ from: null, to: null }) },
  { id: "custom", label: "Personalizado", getDates: () => null },
];

export default function DashboardFilters({
  agents = [],
  stages = [],
  teams = [],
  selectedAgent,
  selectedStage,
  selectedTeam,
  selectedPeriod,
  dateRange,
  onAgentChange,
  onStageChange,
  onTeamChange,
  onPeriodChange,
  onDateRangeChange,
  onClearFilters,
  showAgentFilter = true,
  showStageFilter = true,
  showTeamFilter = true,
  showPeriodFilter = true,
  compact = false,
}) {
  const [isOpen, setIsOpen] = useState(!compact);

  const hasActiveFilters = selectedAgent || selectedStage || selectedTeam || (selectedPeriod && selectedPeriod !== "all");

  const handlePeriodChange = (presetId) => {
    const preset = PERIOD_PRESETS.find(p => p.id === presetId);
    if (preset && preset.getDates) {
      const dates = preset.getDates();
      if (dates) {
        onDateRangeChange?.(dates);
      } else {
        onDateRangeChange?.({ from: null, to: null });
      }
    }
    onPeriodChange?.(presetId);
  };

  const selectedPeriodLabel = PERIOD_PRESETS.find(p => p.id === selectedPeriod)?.label || "Selecionar período";

  if (compact && !isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className={cn("gap-2", hasActiveFilters && "border-primary text-primary")}
      >
        <Filter className="h-4 w-4" />
        Filtros
        {hasActiveFilters && (
          <span className="ml-1 bg-primary text-primary-foreground rounded-full w-5 h-5 text-xs flex items-center justify-center">
            {[selectedAgent, selectedStage, selectedTeam, selectedPeriod !== "all" && selectedPeriod].filter(Boolean).length}
          </span>
        )}
      </Button>
    );
  }

  return (
    <Card className="mb-6">
      <CardContent className="pt-4 pb-4">
        <div className="flex flex-wrap items-end gap-4">
          {showPeriodFilter && (
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select value={selectedPeriod || "all"} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecionar período" />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_PRESETS.map((preset) => (
                    <SelectItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showPeriodFilter && selectedPeriod === "custom" && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs text-muted-foreground">Data Inicial - Final</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[280px] justify-start text-left font-normal",
                      !dateRange?.from && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                          {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                        </>
                      ) : (
                        format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
                      )
                    ) : (
                      <span>Selecione o período</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange?.from}
                    selected={dateRange}
                    onSelect={onDateRangeChange}
                    numberOfMonths={2}
                    locale={ptBR}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          {showTeamFilter && teams.length > 0 && (
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Time</Label>
              <Select value={selectedTeam || "all"} onValueChange={(val) => {
                const teamValue = val === "all" ? null : val;
                onTeamChange?.(teamValue);
                onAgentChange?.(null);
              }}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos os times" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os times</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showAgentFilter && agents.length > 0 && (
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Vendedor</Label>
              <Select value={selectedAgent || "all"} onValueChange={(val) => onAgentChange?.(val === "all" ? null : val)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todos os vendedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os vendedores</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showStageFilter && stages.length > 0 && (
            <div className="flex flex-col gap-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Status/Etapa</Label>
              <Select value={selectedStage || "all"} onValueChange={(val) => onStageChange?.(val === "all" ? null : val)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Todas as etapas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as etapas</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2 items-center">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClearFilters}
                className="text-muted-foreground hover:text-foreground gap-1"
              >
                <X className="h-4 w-4" />
                Limpar
              </Button>
            )}
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
