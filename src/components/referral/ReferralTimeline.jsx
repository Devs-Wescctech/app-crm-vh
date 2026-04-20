import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getAgentDisplayName } from "@/utils/agents";
import { 
  Phone, 
  Mail, 
  MapPin, 
  Calendar, 
  MessageSquare, 
  FileText, 
  CheckCircle, 
  TrendingUp,
  User,
  Clock,
  AlertCircle,
  Presentation,
  ArrowRight,
  DollarSign,
} from "lucide-react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const formatDate = (dateValue) => {
  if (!dateValue) return "";
  try {
    const date = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    if (!isValid(date)) return "";
    return format(date, "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return "";
  }
};

const getActivityConfig = (type) => {
  const configMap = {
    call: {
      icon: Phone,
      label: "Ligacao",
      bg: "bg-blue-100 dark:bg-blue-900/50",
      text: "text-blue-600 dark:text-blue-400",
      border: "border-blue-200 dark:border-blue-800",
      gradient: "from-blue-500 to-cyan-500"
    },
    email: {
      icon: Mail,
      label: "E-mail",
      bg: "bg-purple-100 dark:bg-purple-900/50",
      text: "text-purple-600 dark:text-purple-400",
      border: "border-purple-200 dark:border-purple-800",
      gradient: "from-purple-500 to-violet-500"
    },
    meeting: {
      icon: Calendar,
      label: "Reuniao",
      bg: "bg-emerald-100 dark:bg-emerald-900/50",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      gradient: "from-emerald-500 to-green-500"
    },
    presentation: {
      icon: Presentation,
      label: "Apresentacao",
      bg: "bg-indigo-100 dark:bg-indigo-900/50",
      text: "text-indigo-600 dark:text-indigo-400",
      border: "border-indigo-200 dark:border-indigo-800",
      gradient: "from-indigo-500 to-violet-500"
    },
    proposal: {
      icon: DollarSign,
      label: "Proposta",
      bg: "bg-amber-100 dark:bg-amber-900/50",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800",
      gradient: "from-amber-500 to-yellow-500"
    },
    whatsapp: {
      icon: MessageSquare,
      label: "WhatsApp",
      bg: "bg-emerald-100 dark:bg-emerald-900/50",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      gradient: "from-emerald-500 to-green-500"
    },
    visit: {
      icon: MapPin,
      label: "Visita",
      bg: "bg-orange-100 dark:bg-orange-900/50",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-200 dark:border-orange-800",
      gradient: "from-orange-500 to-amber-500"
    },
    note: {
      icon: FileText,
      label: "Nota",
      bg: "bg-gray-100 dark:bg-gray-800",
      text: "text-gray-600 dark:text-gray-400",
      border: "border-gray-200 dark:border-gray-700",
      gradient: "from-gray-400 to-gray-500"
    },
    stage_change: {
      icon: ArrowRight,
      label: "Mudanca de Etapa",
      bg: "bg-amber-100 dark:bg-amber-900/50",
      text: "text-amber-600 dark:text-amber-400",
      border: "border-amber-200 dark:border-amber-800",
      gradient: "from-amber-500 to-orange-500"
    },
    task: {
      icon: CheckCircle,
      label: "Tarefa",
      bg: "bg-emerald-100 dark:bg-emerald-900/50",
      text: "text-emerald-600 dark:text-emerald-400",
      border: "border-emerald-200 dark:border-emerald-800",
      gradient: "from-emerald-500 to-teal-500"
    },
  };
  return configMap[type] || configMap.note;
};

export default function ReferralTimeline({ activities = [], agents: agentsProp }) {
  const { data: agentsFetched = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !agentsProp,
  });
  const agents = agentsProp || agentsFetched;

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
          <MessageSquare className="w-10 h-10 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Nenhuma atividade registrada</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">As atividades aparecerao aqui</p>
      </div>
    );
  }

  const sortedActivities = [...activities].sort((a, b) => 
    new Date(b.createdAt || b.created_at || b.created_date || '') - new Date(a.createdAt || a.created_at || a.created_date || '')
  );

  return (
    <div className="relative">
      <div className="absolute left-6 top-3 bottom-3 w-0.5 bg-gradient-to-b from-amber-200 via-orange-200 to-gray-200 dark:from-amber-800 dark:via-orange-800 dark:to-gray-700" />
      
      <div className="space-y-4">
        {sortedActivities.map((activity, idx) => {
          const config = getActivityConfig(activity.type);
          const Icon = config.icon;
          const isCompleted = activity.completed;
          const isNote = activity.type === 'note';

          return (
            <div key={activity.id || idx} className="relative flex gap-4 group">
              <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg group-hover:scale-110 transition-transform duration-200`}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              
              <div className={`flex-1 p-4 rounded-xl border ${config.border} bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-shadow duration-200`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${config.bg} ${config.text}`}>
                      {config.label}
                    </span>
                    {isCompleted !== undefined && !isNote && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                        isCompleted 
                          ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300' 
                          : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                      }`}>
                        {isCompleted ? (
                          <><CheckCircle className="w-3 h-3" /> Concluída</>
                        ) : (
                          <><Clock className="w-3 h-3" /> Pendente</>
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDate(activity.createdAt || activity.created_at || activity.created_date)}
                  </span>
                </div>
                
                {activity.title && (
                  <h4 className="font-semibold text-gray-900 dark:text-white text-sm">
                    {activity.title}
                  </h4>
                )}
                
                {activity.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed whitespace-pre-wrap">
                    {activity.description}
                  </p>
                )}

                {(activity.scheduledAt || activity.scheduled_at) && !isCompleted && (
                  <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800">
                    <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      Agendado para {formatDate(activity.scheduledAt || activity.scheduled_at)}
                    </span>
                  </div>
                )}

                {(activity.assignedTo || activity.assigned_to) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <User className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Responsável: <span className="font-medium">{getAgentDisplayName(activity.assignedTo || activity.assigned_to, agents)}</span>
                    </span>
                  </div>
                )}
                
                {(activity.metadata?.from && activity.metadata?.to) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {activity.metadata.from}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="px-2 py-1 text-xs rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 font-medium">
                      {activity.metadata.to}
                    </span>
                  </div>
                )}
                {(activity.metadata?.stage_from && activity.metadata?.stage_to) && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <span className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                      {activity.metadata.stage_from}
                    </span>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                    <span className="px-2 py-1 text-xs rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 font-medium">
                      {activity.metadata.stage_to}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
