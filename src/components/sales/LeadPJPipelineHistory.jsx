import React, { useState } from "react";
import { Check, Clock, CircleDot, Trophy, XCircle, Timer, DollarSign, Users } from "lucide-react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STAGES_PJ = [
  { id: 'novo', label: 'Novo', color: 'gray', gradient: 'from-gray-400 to-gray-500' },
  { id: 'qualificacao', label: 'Qualificação', color: 'purple', gradient: 'from-purple-400 to-purple-600' },
  { id: 'apresentacao', label: 'Apresentação', color: 'indigo', gradient: 'from-indigo-400 to-indigo-600' },
  { id: 'proposta_enviada', label: 'Proposta', color: 'amber', gradient: 'from-amber-400 to-amber-600' },
  { id: 'negociacao', label: 'Negociação', color: 'orange', gradient: 'from-orange-400 to-orange-600' },
  { id: 'fechado_ganho', label: 'Ganho', color: 'emerald', gradient: 'from-emerald-400 to-emerald-600' },
  { id: 'fechado_perdido', label: 'Perdido', color: 'red', gradient: 'from-red-400 to-red-600' },
];

const formatDuration = (start, end) => {
  if (!start) return null;
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date();
  const diffMs = endDate - startDate;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return `< 1h`;
};

export default function LeadPJPipelineHistory({ lead, onStageChange }) {
  const stageHistory = lead.stageHistory || lead.stage_history || [];
  const currentStage = lead.stage;

  const leadCreatedAt = lead.createdAt || lead.createdDate || lead.created_at || lead.created_date;

  const stageVisits = {};
  stageHistory.forEach((entry) => {
    const toStage = entry.to || entry.stage;
    const fromStage = entry.from || entry.previousStage || entry.previous_stage;
    const changedAt = entry.changed_at || entry.changedAt;

    if (fromStage && !stageVisits[fromStage]) {
      stageVisits[fromStage] = { enteredAt: leadCreatedAt, exitedAt: changedAt };
    }
    if (toStage && !stageVisits[toStage]) {
      stageVisits[toStage] = { enteredAt: changedAt, exitedAt: null };
    }
    if (fromStage && stageVisits[fromStage] && !stageVisits[fromStage].exitedAt) {
      stageVisits[fromStage].exitedAt = changedAt;
    }
  });

  if (currentStage && !stageVisits[currentStage]) {
    stageVisits[currentStage] = { enteredAt: leadCreatedAt, exitedAt: null };
  }
  if (currentStage && stageVisits[currentStage]) {
    stageVisits[currentStage].exitedAt = null;
  }

  const [stageConfirm, setStageConfirm] = useState({ isOpen: false, stageId: null, label: '' });

  const handleStageClick = (stageId) => {
    if (onStageChange && currentStage !== stageId) {
      const stage = STAGES_PJ.find(s => s.id === stageId);
      setStageConfirm({ isOpen: true, stageId, label: stage?.label || stageId });
    }
  };

  const activeStages = STAGES_PJ.filter(s => s.id !== 'fechado_perdido');
  const currentIndex = activeStages.findIndex(s => s.id === currentStage);
  const totalTime = formatDuration(leadCreatedAt, lead.concludedAt || lead.concluded_at || lead.lostAt || lead.lost_at);

  return (
    <div className="space-y-6">
      {/* Progress Bar Visual */}
      <div className="relative">
        {/* Background Track */}
        <div className="absolute top-6 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
        
        {/* Progress Fill */}
        <div 
          className="absolute top-6 left-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, (currentIndex / (activeStages.length - 1)) * 100)}%` }}
        />
        
        {/* Stage Dots */}
        <div className="relative flex justify-between">
          {activeStages.map((stage, index) => {
            const visit = stageVisits[stage.id];
            const isCompleted = !!visit && currentStage !== stage.id;
            const isCurrent = currentStage === stage.id;
            const isClickable = onStageChange && !isCurrent;
            const duration = visit ? formatDuration(visit.enteredAt, visit.exitedAt) : null;

            return (
              <div 
                key={stage.id}
                className="flex flex-col items-center relative group"
                style={{ width: `${100 / activeStages.length}%` }}
              >
                {/* Stage Circle */}
                <button
                  onClick={() => isClickable && handleStageClick(stage.id)}
                  disabled={!isClickable}
                  className={`
                    relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-4 transition-all duration-300
                    ${isCurrent 
                      ? `bg-gradient-to-br ${stage.gradient} border-white dark:border-gray-900 shadow-lg shadow-indigo-500/40 scale-110 ring-4 ring-indigo-200 dark:ring-indigo-900` 
                      : isCompleted 
                        ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 border-white dark:border-gray-900 shadow-md' 
                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                    }
                    ${isClickable ? 'cursor-pointer hover:scale-110 hover:shadow-lg' : ''}
                  `}
                >
                  {isCurrent ? (
                    <CircleDot className="w-5 h-5 text-white animate-pulse" />
                  ) : isCompleted ? (
                    <Check className="w-5 h-5 text-white" />
                  ) : (
                    <span className="text-sm font-bold text-gray-400 dark:text-gray-500">{index + 1}</span>
                  )}
                </button>

                {/* Stage Label */}
                <div className="mt-3 text-center">
                  <p className={`text-xs font-semibold ${
                    isCurrent 
                      ? 'text-gray-900 dark:text-white' 
                      : isCompleted 
                        ? 'text-emerald-600 dark:text-emerald-400' 
                        : 'text-gray-500 dark:text-gray-400'
                  }`}>
                    {stage.label}
                  </p>
                  
                  {/* Duration Badge */}
                  {duration && (
                    <span className={`inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      isCurrent 
                        ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300' 
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      <Timer className="w-2.5 h-2.5" />
                      {duration}
                    </span>
                  )}

                  {/* Current Indicator */}
                  {isCurrent && (
                    <div className="mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white animate-pulse">
                        ATUAL
                      </span>
                    </div>
                  )}
                </div>

                {/* Hover Tooltip */}
                {isClickable && (
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded whitespace-nowrap">
                      Clique para mover
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
        {/* Tempo no Pipeline */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-900/50">
              <Timer className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Tempo Total</span>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">{totalTime || '< 1h'}</p>
        </div>

        {/* Etapas Concluídas */}
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
          <div className="flex items-center gap-2 mb-1">
            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Etapas</span>
          </div>
          <p className="text-lg font-bold text-gray-900 dark:text-white">
            {Object.keys(stageVisits).length} / {activeStages.length}
          </p>
        </div>

        {/* Valor */}
        {(lead.value || lead.monthly_value || lead.monthlyValue) && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/50">
                <DollarSign className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Valor</span>
            </div>
            <p className="text-lg font-bold text-green-600 dark:text-green-400">
              R$ {parseFloat(lead.value || lead.monthly_value || lead.monthlyValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* Funcionários */}
        {(lead.employee_count || lead.employeeCount || lead.num_employees || lead.numEmployees) && (
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 border border-gray-100 dark:border-gray-700/50">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-purple-100 dark:bg-purple-900/50">
                <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Funcionários</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {lead.employee_count || lead.employeeCount}
            </p>
          </div>
        )}

        {/* Status Final */}
        {(lead.concluded || lead.lost) && (
          <div className={`rounded-xl p-3 border ${
            lead.concluded 
              ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <div className={`p-1.5 rounded-lg ${
                lead.concluded ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-red-100 dark:bg-red-900/50'
              }`}>
                {lead.concluded 
                  ? <Trophy className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  : <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                }
              </div>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
            </div>
            <p className={`text-sm font-bold ${
              lead.concluded ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {lead.concluded ? 'Venda Concluída' : 'Perdido'}
            </p>
            {(lead.concluded_at || lead.lost_at) && (
              <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                {format(new Date(lead.concluded_at || lead.lost_at), "dd/MM/yy HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Lost Reason */}
      {lead.lost && lead.lost_reason && (
        <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/50 shrink-0">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-900 dark:text-red-200">Motivo da Perda</p>
            <p className="text-sm text-red-700 dark:text-red-300 mt-1">{lead.lost_reason}</p>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={stageConfirm.isOpen}
        title="Mover lead"
        message={`Deseja mover este lead para a coluna "${stageConfirm.label}"?`}
        confirmLabel="Mover"
        cancelLabel="Cancelar"
        onConfirm={() => { onStageChange(stageConfirm.stageId); setStageConfirm({ isOpen: false, stageId: null, label: '' }); }}
        onCancel={() => setStageConfirm({ isOpen: false, stageId: null, label: '' })}
      />
    </div>
  );
}
