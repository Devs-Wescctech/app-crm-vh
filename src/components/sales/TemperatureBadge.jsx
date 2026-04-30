import React from 'react';
import { Thermometer, Check, Minus } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  MANUAL_TEMPERATURE_OPTIONS,
  TEMPERATURE_META,
  buildManualTemperature,
  normalizeManualTemperature,
} from '@/components/utils/temperature';

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1',
  lg: 'px-3 py-1.5 text-sm gap-1.5',
};

const PLACEHOLDER_CLASSES = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1',
  lg: 'px-3 py-1.5 text-sm gap-1.5',
};

/**
 * Manual temperature badge / selector.
 *
 * Quando recebe `onChange`, o badge abre um popover deixando o vendedor
 * escolher Quente / Morno / Frio ou limpar (sem temperatura). Sem
 * `onChange`, vira um badge somente-leitura — útil em listagens de quem
 * não pode editar o lead.
 *
 * Aceita tanto a string crua (`value="hot"`) quanto o objeto antigo
 * (`temperature={ key: 'hot', label, softClass, ... }`) para minimizar
 * o atrito da migração com chamadores legados.
 */
export default function TemperatureBadge({
  value,
  temperature,
  onChange,
  size = 'md',
  className = '',
  triggerClassName = '',
  placeholder = 'Definir temperatura',
  showPlaceholder = true,
  disabled = false,
}) {
  const incomingKey = temperature?.key ?? value;
  const meta = buildManualTemperature(incomingKey);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;
  const placeholderClass = PLACEHOLDER_CLASSES[size] || PLACEHOLDER_CLASSES.md;
  const interactive = typeof onChange === 'function' && !disabled;

  // Read-only e sem temperatura definida — não há nada para mostrar.
  if (!meta && !interactive) {
    return null;
  }

  // Conteúdo do botão/badge — repetido para cobrir o caso "sem valor".
  const renderBadge = (asPopoverTrigger) => {
    if (!meta) {
      return (
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={placeholder}
          className={`inline-flex items-center rounded-lg font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ${placeholderClass} ${triggerClassName} ${className}`}
        >
          <Thermometer className="w-3 h-3" />
          <span>{placeholder}</span>
        </button>
      );
    }

    return (
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        aria-label={interactive ? `Alterar temperatura (atual: ${meta.label})` : meta.label}
        className={`inline-flex items-center rounded-lg font-semibold transition-shadow ${interactive ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'} focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ${meta.softClass} ${sizeClass} ${triggerClassName} ${className}`}
        disabled={!interactive && asPopoverTrigger}
      >
        <Thermometer className="w-3 h-3" />
        <span>{meta.label}</span>
      </button>
    );
  };

  // Sem onChange = só badge.
  if (!interactive) {
    return renderBadge(false);
  }

  // Sem placeholder e sem temperatura — não renderiza nada (evita poluir
  // listagens densas onde o seletor seria barulhento).
  if (!meta && !showPlaceholder) {
    return null;
  }

  const handleSelect = (key) => {
    const current = normalizeManualTemperature(incomingKey);
    if (current === key) return;
    onChange(key);
  };

  const handleClear = () => {
    if (!normalizeManualTemperature(incomingKey)) return;
    onChange(null);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>{renderBadge(true)}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-60 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Thermometer className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 uppercase tracking-wide">
              Temperatura do lead
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
            Escolha como quer marcar este lead. Você pode mudar a qualquer momento.
          </p>
        </div>

        <div className="p-2 space-y-1">
          {MANUAL_TEMPERATURE_OPTIONS.map((opt) => {
            const isActive = normalizeManualTemperature(incomingKey) === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelect(opt.key)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                  isActive
                    ? `${TEMPERATURE_META[opt.key].softClass} ring-1 ring-inset ring-current/20`
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${TEMPERATURE_META[opt.key].softClass}`}
                >
                  <Thermometer className="w-3 h-3" />
                </span>
                <span className="flex-1">{opt.label}</span>
                {isActive && <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
              </button>
            );
          })}

          <button
            type="button"
            onClick={handleClear}
            disabled={!normalizeManualTemperature(incomingKey)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm font-medium transition-colors text-left text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800">
              <Minus className="w-3 h-3" />
            </span>
            <span className="flex-1">Sem temperatura</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
