
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  LayoutDashboard, 
  Plus,
  TrendingUp,
  CheckSquare,
  UserCheck,
  FileText,
  UserCog,
  CalendarIcon,
  FileBarChart,
  Trophy,
  Zap,
  Building2,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const commands = [
  { id: 1, title: "Dashboard PJ", url: "SalesPJDashboard", icon: LayoutDashboard, category: "Vendas PJ" },
  { id: 2, title: "Dashboard Vendedores", url: "SalesPJAgentsDashboard", icon: UserCheck, category: "Vendas PJ" },
  { id: 3, title: "Novo Lead PJ", url: "NewLeadPJ", icon: Plus, category: "Vendas PJ", highlight: true },
  { id: 4, title: "Pipeline B2B", url: "LeadsPJKanban", icon: TrendingUp, category: "Vendas PJ" },
  { id: 5, title: "Busca de Leads", url: "LeadPJSearch", icon: Search, category: "Vendas PJ" },
  { id: 6, title: "Agenda", url: "SalesAgenda", icon: CalendarIcon, category: "Vendas PJ" },
  { id: 7, title: "Relatórios PJ", url: "SalesPJReports", icon: FileBarChart, category: "Vendas PJ" },
  { id: 8, title: "Rel. de Ganhos", url: "SalesPJWonReport", icon: Trophy, category: "Vendas PJ" },
  { id: 13, title: "Períodos de Responsabilidade", url: "SalesPJAgentPeriodsReport", icon: History, category: "Vendas PJ" },
  { id: 9, title: "Automações", url: "LeadPJAutomations", icon: Zap, category: "Vendas PJ" },
  { id: 10, title: "Tarefas", url: "SalesTasks", icon: CheckSquare, category: "Vendas PJ" },
  { id: 11, title: "Templates de Proposta", url: "ProposalTemplates", icon: FileText, category: "Vendas PJ" },
  { id: 12, title: "Agentes", url: "Agents", icon: UserCog, category: "Configurações" },
];

export default function CommandPalette({ open, onOpenChange }) {
  const [search, setSearch] = useState("");
  const [filteredCommands, setFilteredCommands] = useState(commands);
  const navigate = useNavigate();

  useEffect(() => {
    if (search.trim() === "") {
      setFilteredCommands(commands);
    } else {
      const filtered = commands.filter(cmd =>
        cmd.title.toLowerCase().includes(search.toLowerCase()) ||
        cmd.category.toLowerCase().includes(search.toLowerCase())
      );
      setFilteredCommands(filtered);
    }
  }, [search]);

  useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const handleSelect = (cmd) => {
    navigate(createPageUrl(cmd.url));
    onOpenChange(false);
    setSearch("");
  };

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-4">
          <Search className="w-5 h-5 text-gray-400 mr-2" />
          <Input
            placeholder="Digite para buscar... (⌘K)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0 h-12"
            autoFocus
          />
        </div>
        
        <div className="max-h-[400px] overflow-y-auto p-2">
          {Object.keys(groupedCommands).map((category) => (
            <div key={category} className="mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
                {category}
              </p>
              <div className="space-y-1">
                {groupedCommands[category].map((cmd) => {
                  const Icon = cmd.icon;
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => handleSelect(cmd)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-left"
                    >
                      <div className={`p-2 rounded-lg ${cmd.highlight ? 'bg-blue-100 dark:bg-blue-900' : 'bg-gray-100 dark:bg-gray-800'}`}>
                        <Icon className={`w-4 h-4 ${cmd.highlight ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`} />
                      </div>
                      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {cmd.title}
                      </span>
                      {cmd.highlight && (
                        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                          Rápido
                        </Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          
          {filteredCommands.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400">Nenhum resultado encontrado</p>
            </div>
          )}
        </div>
        
        <div className="border-t px-4 py-3 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Navegue com ↑ ↓ e selecione com Enter</span>
            <kbd className="px-2 py-1 bg-white dark:bg-gray-800 border rounded text-xs">ESC</kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
