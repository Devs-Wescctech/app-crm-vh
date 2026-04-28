import React from 'react';
import { Thermometer, Check, Minus, Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  describeTemperatureReasons,
  describeTemperatureThresholds,
} from '@/components/utils/temperature';

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-[11px] gap-1',
  md: 'px-2.5 py-1 text-xs gap-1',
};

export default function TemperatureBadge({
  temperature,
  rules,
  size = 'md',
  showDays = true,
  className = '',
  triggerClassName = '',
}) {
  if (!temperature) return null;

  const reasons = describeTemperatureReasons(temperature, rules);
  const thresholds = describeTemperatureThresholds(rules, temperature.triggers);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Por que essa temperatura? ${temperature.label}`}
          className={`inline-flex items-center rounded-lg font-semibold transition-shadow hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-indigo-400 ${temperature.softClass} ${sizeClass} ${triggerClassName} ${className}`}
        >
          <Thermometer className="w-3 h-3" />
          <span>{temperature.label}</span>
          {showDays && temperature.days !== null && temperature.days !== undefined && (
            <span className="opacity-70 font-normal">({temperature.days}d)</span>
          )}
          <Info className="w-3 h-3 opacity-60 ml-0.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`px-3 py-2 ${temperature.softClass} flex items-center gap-2`}>
          <Thermometer className="w-4 h-4" />
          <div className="text-sm font-semibold">{temperature.label}</div>
          {temperature.days !== null && temperature.days !== undefined && (
            <span className="ml-auto text-[11px] opacity-80">
              {temperature.days}d desde o último contato
            </span>
          )}
        </div>

        <div className="p-3 space-y-3 bg-white dark:bg-gray-900">
          <section>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
              Por que essa temperatura?
            </h4>
            {reasons.length > 0 ? (
              <ul className="space-y-1">
                {reasons.map((r) => (
                  <li
                    key={r.key}
                    className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Nenhuma regra de quente ou frio foi atingida — o lead fica como{' '}
                <strong>Morno</strong> por padrão.
              </p>
            )}
          </section>

          {thresholds.length > 0 && (
            <section>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                Regras configuradas
              </h4>
              <ul className="space-y-1">
                {thresholds.map((row) => (
                  <li
                    key={row.key}
                    className={`flex items-start gap-2 text-xs ${
                      row.active
                        ? 'text-gray-900 dark:text-gray-100 font-medium'
                        : 'text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {row.active ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                    ) : (
                      <Minus className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 mt-0.5 flex-shrink-0" />
                    )}
                    <span>{row.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
