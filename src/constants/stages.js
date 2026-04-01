export const LEAD_PF_STAGES = [
  { id: 'novo', label: 'Novo', color: '#3b82f6', gradient: 'from-blue-500 to-blue-600' },
  { id: 'abordado', label: 'Abordado', color: '#8b5cf6', gradient: 'from-violet-500 to-purple-500' },
  { id: 'qualificado', label: 'Qualificado', color: '#06b6d4', gradient: 'from-cyan-500 to-teal-500' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: '#eab308', gradient: 'from-amber-500 to-orange-500' },
  { id: 'negociacao', label: 'Negociação', color: '#f97316', gradient: 'from-orange-500 to-red-500' },
  { id: 'fechado_ganho', label: 'Fechado Ganho', color: '#22c55e', gradient: 'from-emerald-500 to-green-500' },
  { id: 'fechado_perdido', label: 'Perdido', color: '#ef4444', gradient: 'from-red-500 to-red-600' },
];

export const LEAD_PJ_STAGES = [
  { id: 'novo', label: 'Novo', color: '#3b82f6', gradient: 'from-blue-500 to-indigo-500' },
  { id: 'qualificacao', label: 'Qualificação', color: '#8b5cf6', gradient: 'from-violet-500 to-purple-500' },
  { id: 'apresentacao', label: 'Apresentação', color: '#06b6d4', gradient: 'from-cyan-500 to-teal-500' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: '#eab308', gradient: 'from-amber-500 to-orange-500' },
  { id: 'negociacao', label: 'Negociação', color: '#f97316', gradient: 'from-orange-500 to-red-500' },
  { id: 'fechado_ganho', label: 'Fechado Ganho', color: '#22c55e', gradient: 'from-emerald-500 to-green-500' },
  { id: 'fechado_perdido', label: 'Perdido', color: '#ef4444', gradient: 'from-red-500 to-red-600' },
];

export const REFERRAL_STAGES = [
  { id: 'novo', label: 'Novo', color: '#ec4899', gradient: 'from-pink-500 to-rose-500' },
  { id: 'contato_iniciado', label: 'Contato Iniciado', color: '#06b6d4', gradient: 'from-cyan-500 to-teal-500' },
  { id: 'proposta_enviada', label: 'Proposta Enviada', color: '#f59e0b', gradient: 'from-amber-500 to-orange-500' },
  { id: 'fechado_ganho', label: 'Convertido', color: '#10b981', gradient: 'from-emerald-500 to-teal-500' },
  { id: 'fechado_perdido', label: 'Perdido', color: '#ef4444', gradient: 'from-red-500 to-red-600' },
];

export const ACTIVE_STAGES = {
  pf: LEAD_PF_STAGES.filter(s => !['fechado_ganho', 'fechado_perdido'].includes(s.id)).map(s => s.id),
  pj: LEAD_PJ_STAGES.filter(s => !['fechado_ganho', 'fechado_perdido'].includes(s.id)).map(s => s.id),
  referral: REFERRAL_STAGES.filter(s => !['fechado_ganho', 'fechado_perdido'].includes(s.id)).map(s => s.id),
};

export const WON_STAGES = ['fechado_ganho'];
export const LOST_STAGES = ['fechado_perdido'];
export const CLOSED_STAGES = [...WON_STAGES, ...LOST_STAGES];

export const isActiveStage = (stage) => !CLOSED_STAGES.includes(stage);
export const isWonStage = (stage) => WON_STAGES.includes(stage);
export const isLostStage = (stage) => LOST_STAGES.includes(stage);

export const getStageLabel = (stageId, type = 'pf') => {
  const stages = type === 'pf' ? LEAD_PF_STAGES : type === 'pj' ? LEAD_PJ_STAGES : REFERRAL_STAGES;
  return stages.find(s => s.id === stageId)?.label || stageId;
};

export const getStageColor = (stageId, type = 'pf') => {
  const stages = type === 'pf' ? LEAD_PF_STAGES : type === 'pj' ? LEAD_PJ_STAGES : REFERRAL_STAGES;
  return stages.find(s => s.id === stageId)?.color || '#6b7280';
};

export const getStageGradient = (stageId, type = 'pf') => {
  const stages = type === 'pf' ? LEAD_PF_STAGES : type === 'pj' ? LEAD_PJ_STAGES : REFERRAL_STAGES;
  return stages.find(s => s.id === stageId)?.gradient || 'from-gray-500 to-gray-600';
};
