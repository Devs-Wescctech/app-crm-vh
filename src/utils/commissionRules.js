export function calculateCommissionLevel(totalConversions) {
  if (totalConversions >= 13) return 3;
  if (totalConversions >= 4) return 2;
  return 1;
}

export function calculateCommissionValue(level) {
  switch (level) {
    case 3: return 200;
    case 2: return 150;
    default: return 100;
  }
}

export function getCommissionFromConversions(totalConversions) {
  const level = calculateCommissionLevel(totalConversions);
  const value = calculateCommissionValue(level);
  return { level, value };
}

export function getLevelDescription(level) {
  switch (level) {
    case 3: return { badge: "🏆 Nível 3", color: "bg-purple-100 text-purple-800" };
    case 2: return { badge: "⭐ Nível 2", color: "bg-amber-100 text-amber-800" };
    default: return { badge: "Nível 1", color: "bg-blue-100 text-blue-800" };
  }
}

export function getNextLevelInfo(totalConversions, currentLevel) {
  if (currentLevel >= 3) {
    return "Nível máximo atingido! Comissão por venda: R$ 200,00";
  }
  if (currentLevel === 2) {
    const remaining = 13 - totalConversions;
    return `Faltam ${remaining} indicação${remaining !== 1 ? 'ões' : ''} para Nível 3 (R$ 200,00)`;
  }
  const remaining = 4 - totalConversions;
  return `Faltam ${remaining} indicação${remaining !== 1 ? 'ões' : ''} para Nível 2 (R$ 150,00)`;
}

export const COMMISSION_RULES = [
  { level: 1, min: 1, max: 3, value: 100, description: "1-3 vendas convertidas" },
  { level: 2, min: 4, max: 12, value: 150, description: "4-12 vendas convertidas" },
  { level: 3, min: 13, max: null, value: 200, description: "13+ vendas convertidas" },
];
