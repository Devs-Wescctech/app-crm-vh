import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Loader2, ListChecks, Plus, X, GripVertical, Calendar, Link2, Unlink, FileSignature, CheckCircle2, AlertCircle, Eye, EyeOff, Thermometer, History, RefreshCw, XCircle, ChevronRight, ChevronDown, ExternalLink, Snowflake, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { canAccessSystemsItem, hasAnySystemsAccess } from "@/components/utils/permissions";
import {
  TEMPERATURE_RULES_KEY,
  DEFAULT_TEMPERATURE_RULES,
  getTemperatureRulesFromSettings,
  TEMPERATURE_META,
  TEMPERATURE_MONITOR_INTERVAL_KEY,
  DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES,
  MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES,
  MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES,
  getTemperatureMonitorIntervalFromSettings,
} from "@/components/utils/temperature";

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settings = [], isLoading: settingsLoading } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
  });

  const createOrUpdateSettingMutation = useMutation({
    mutationFn: async ({ key, value, type }) => {
      const existingSetting = settings.find(s => (s.setting_key || s.settingKey) === key);
      
      const data = {
        setting_key: key,
        setting_value: value,
        setting_type: type || 'text',
      };

      if (existingSetting) {
        return base44.entities.SystemSettings.update(existingSetting.id, data);
      } else {
        return base44.entities.SystemSettings.create(data);
      }
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(['systemSettings'], (old = []) => {
        const list = Array.isArray(old) ? [...old] : [];
        const idx = list.findIndex(s => (s.setting_key || s.settingKey) === variables.key);
        const merged = saved && typeof saved === 'object'
          ? saved
          : { setting_key: variables.key, setting_value: variables.value, setting_type: variables.type || 'text' };
        if (idx >= 0) {
          list[idx] = { ...list[idx], ...merged };
        } else {
          list.push(merged);
        }
        return list;
      });
      queryClient.refetchQueries({ queryKey: ['systemSettings'] });
      toast.success('Configuração salva com sucesso!');
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error?.message || 'tente novamente'}`);
    },
  });
  const isAdmin = user?.role === 'admin';
  const currentAgent = user?.agent;

  const canSalesFields = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsSalesFields');
  const canGoogleCalendarSettings = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsGoogleCalendar');
  const canAutentiqueSettings = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsAutentique');
  const canTemperatureSettings = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsLeadTemperature');
  const anySystemsTab = canSalesFields || canGoogleCalendarSettings || canAutentiqueSettings || canTemperatureSettings;

  if (!anySystemsTab) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Minha Conta</h1>
          <p className="text-gray-500">Gerencie suas integrações pessoais</p>
        </div>
        <GoogleCalendarSettings settings={settings} onSave={createOrUpdateSettingMutation} isAdmin={false} showSystemStatus={false} />
      </div>
    );
  }

  const defaultTab = canSalesFields
    ? "sales-fields"
    : canTemperatureSettings
      ? "lead-temperature"
      : canGoogleCalendarSettings
        ? "google-calendar"
        : "autentique";

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Configurações do Sistema</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          Personalize o CRM da sua empresa
        </p>
      </div>

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          {canSalesFields && (
            <TabsTrigger value="sales-fields" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
              <ListChecks className="w-4 h-4 mr-2" />
              Campos de Vendas
            </TabsTrigger>
          )}
          {canTemperatureSettings && (
            <TabsTrigger value="lead-temperature" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
              <Thermometer className="w-4 h-4 mr-2" />
              Temperatura de Leads
            </TabsTrigger>
          )}
          {canGoogleCalendarSettings && (
            <TabsTrigger value="google-calendar" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
              <Calendar className="w-4 h-4 mr-2" />
              Google Agenda
            </TabsTrigger>
          )}
          {canAutentiqueSettings && (
            <TabsTrigger value="autentique" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
              <FileSignature className="w-4 h-4 mr-2" />
              Autentique
            </TabsTrigger>
          )}
        </TabsList>

        {canSalesFields && (
          <TabsContent value="sales-fields" className="space-y-6">
            <SalesFieldsManager settings={settings} onSave={createOrUpdateSettingMutation} />
          </TabsContent>
        )}

        {canTemperatureSettings && (
          <TabsContent value="lead-temperature" className="space-y-6">
            <LeadTemperatureRulesEditor settings={settings} onSave={createOrUpdateSettingMutation} />
            <LeadTemperatureMonitorCadenceEditor settings={settings} onSave={createOrUpdateSettingMutation} isAdmin={isAdmin} />
            {isAdmin && <LeadTemperatureMonitorHistory />}
          </TabsContent>
        )}

        {canGoogleCalendarSettings && (
          <TabsContent value="google-calendar" className="space-y-6">
            <GoogleCalendarSettings settings={settings} onSave={createOrUpdateSettingMutation} isAdmin={isAdmin} showSystemStatus={true} />
          </TabsContent>
        )}

        {canAutentiqueSettings && (
          <TabsContent value="autentique" className="space-y-6">
            <AutentiqueSettings settings={settings} onSave={createOrUpdateSettingMutation} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function OptionListEditor({ title, description, settingKey, settings, onSave }) {
  const savedJson = (() => {
    const setting = settings.find(s => s.setting_key === settingKey || s.settingKey === settingKey);
    return setting ? (setting.setting_value ?? setting.settingValue ?? '') : '';
  })();

  const [options, setOptions] = useState([]);
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lastSyncedJsonRef = useRef(null);

  useEffect(() => {
    if (lastSyncedJsonRef.current === savedJson) return;
    if (dirty) return;
    lastSyncedJsonRef.current = savedJson;
    let parsed = [];
    if (savedJson) {
      try {
        const candidate = JSON.parse(savedJson);
        if (Array.isArray(candidate)) parsed = candidate;
      } catch {}
    }
    setOptions(parsed);
  }, [savedJson, dirty]);

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      toast.error('Esta opção já existe');
      return;
    }
    setOptions([...options, trimmed]);
    setNewOption("");
    setDirty(true);
    toast.success(`"${trimmed}" adicionado — clique em Salvar para confirmar`);
  };

  const handleRemove = (index) => {
    const removed = options[index];
    setOptions(options.filter((_, i) => i !== index));
    setDirty(true);
    if (removed) {
      toast.success(`"${removed}" removido — clique em Salvar para confirmar`);
    }
  };

  const handleSave = async () => {
    let toSave = options;
    const pending = newOption.trim();
    if (pending) {
      if (options.includes(pending)) {
        toast.error('Esta opção já existe');
        return;
      }
      toSave = [...options, pending];
      setOptions(toSave);
      setNewOption("");
    }

    if (toSave.length === 0) {
      toast.error('Adicione pelo menos uma opção antes de salvar');
      return;
    }
    setSaving(true);
    try {
      await onSave.mutateAsync({
        key: settingKey,
        value: JSON.stringify(toSave),
        type: 'json',
      });
      setDirty(false);
    } catch (error) {
      // erro já é tratado pelo onError da mutation
    }
    setSaving(false);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <CardTitle className="text-gray-900 dark:text-gray-100 text-base">{title}</CardTitle>
        {description && (
          <p className="text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-4 space-y-3">
        <div className="space-y-2">
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2 group">
              <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
              <div className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700">
                {option}
              </div>
              <button
                onClick={() => handleRemove(index)}
                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2">
          <Input
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            placeholder="Nova opção..."
            className="flex-1 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button
            onClick={handleAdd}
            variant="outline"
            size="icon"
            disabled={!newOption.trim()}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: '#5A2A3C' }}
            className="text-white hover:opacity-90"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar Opções
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SalesFieldsManager({ settings, onSave }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OptionListEditor
          title="Interesses - Vendas PJ"
          description="Opções de interesse para leads de pessoa jurídica"
          settingKey="interest_options_pj"
          settings={settings}
          onSave={onSave}
        />
        <OptionListEditor
          title="Origens - Vendas PJ"
          description="Fontes de origem para leads de pessoa jurídica"
          settingKey="source_options_pj"
          settings={settings}
          onSave={onSave}
        />
      </div>
    </div>
  );
}

function LeadTemperatureRulesEditor({ settings, onSave }) {
  const savedRules = getTemperatureRulesFromSettings(settings);

  const buildForm = (rules) => ({
    hot: {
      maxDaysSinceContact:
        rules.hot.maxDaysSinceContact === null ? '' : String(rules.hot.maxDaysSinceContact),
      minRecentInteractions:
        rules.hot.minRecentInteractions === null ? '' : String(rules.hot.minRecentInteractions),
      interactionWindowHours:
        rules.hot.interactionWindowHours === null ? '' : String(rules.hot.interactionWindowHours),
      minValue: rules.hot.minValue === null ? '' : String(rules.hot.minValue),
    },
    cold: {
      minDaysSinceContact:
        rules.cold.minDaysSinceContact === null ? '' : String(rules.cold.minDaysSinceContact),
    },
  });

  const [form, setForm] = useState(() => buildForm(savedRules));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const lastSyncedRef = useRef(null);

  const savedJson = JSON.stringify(savedRules);

  useEffect(() => {
    if (lastSyncedRef.current === savedJson) return;
    if (dirty) return;
    lastSyncedRef.current = savedJson;
    setForm(buildForm(savedRules));
  }, [savedJson, dirty]);

  const update = (group, field, value) => {
    setDirty(true);
    setForm((prev) => ({
      ...prev,
      [group]: { ...prev[group], [field]: value },
    }));
  };

  const handleReset = () => {
    setForm(buildForm(DEFAULT_TEMPERATURE_RULES));
    setDirty(true);
    toast.success('Critérios restaurados aos padrões — clique em Salvar para confirmar');
  };

  const parseNumber = (value, { allowZero = true } = {}) => {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return undefined;
    if (!allowZero && n === 0) return undefined;
    return n;
  };

  const handleSave = async () => {
    const hot = {
      maxDaysSinceContact: parseNumber(form.hot.maxDaysSinceContact),
      minRecentInteractions: parseNumber(form.hot.minRecentInteractions),
      interactionWindowHours: parseNumber(form.hot.interactionWindowHours, { allowZero: false }),
      minValue: parseNumber(form.hot.minValue),
    };
    const cold = {
      minDaysSinceContact: parseNumber(form.cold.minDaysSinceContact),
    };

    if (
      hot.maxDaysSinceContact === undefined ||
      hot.minRecentInteractions === undefined ||
      hot.interactionWindowHours === undefined ||
      hot.minValue === undefined ||
      cold.minDaysSinceContact === undefined
    ) {
      toast.error('Preencha apenas com números válidos (≥ 0). Janela de horas precisa ser > 0.');
      return;
    }

    if (hot.interactionWindowHours === null) hot.interactionWindowHours = 48;

    setSaving(true);
    try {
      await onSave.mutateAsync({
        key: TEMPERATURE_RULES_KEY,
        value: JSON.stringify({ hot, cold }),
        type: 'json',
      });
      setDirty(false);
    } catch (e) {
      // erro já é tratado pelo onError da mutation
    }
    setSaving(false);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <CardTitle className="text-gray-900 dark:text-gray-100 text-base flex items-center gap-2">
          <Thermometer className="w-4 h-4" />
          Critérios automáticos de temperatura
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Defina como os leads são classificados em quente, morno e frio. As regras são aplicadas em tempo real
          na listagem e no kanban. Deixe um campo em branco para desativar aquele critério.
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-6">
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${TEMPERATURE_META.hot.badgeClass}`}>
              {TEMPERATURE_META.hot.label}
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              um lead vira quente quando satisfaz <strong>qualquer</strong> critério abaixo
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700 dark:text-gray-300">
                Último contato há no máximo (dias)
              </Label>
              <Input
                type="number"
                min="0"
                value={form.hot.maxDaysSinceContact}
                onChange={(e) => update('hot', 'maxDaysSinceContact', e.target.value)}
                placeholder="Ex.: 2"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700 dark:text-gray-300">
                Mínimo de interações na janela
              </Label>
              <Input
                type="number"
                min="0"
                value={form.hot.minRecentInteractions}
                onChange={(e) => update('hot', 'minRecentInteractions', e.target.value)}
                placeholder="Ex.: 3"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700 dark:text-gray-300">
                Janela de interações (horas)
              </Label>
              <Input
                type="number"
                min="1"
                value={form.hot.interactionWindowHours}
                onChange={(e) => update('hot', 'interactionWindowHours', e.target.value)}
                placeholder="Ex.: 48"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-700 dark:text-gray-300">
                Valor mínimo da proposta (R$)
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.hot.minValue}
                onChange={(e) => update('hot', 'minValue', e.target.value)}
                placeholder="Opcional"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${TEMPERATURE_META.cold.badgeClass}`}>
              {TEMPERATURE_META.cold.label}
            </span>
            <span className="text-xs text-gray-600 dark:text-gray-300">
              um lead vira frio quando satisfaz o critério abaixo
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-gray-700 dark:text-gray-300">
                Sem contato há pelo menos (dias)
              </Label>
              <Input
                type="number"
                min="0"
                value={form.cold.minDaysSinceContact}
                onChange={(e) => update('cold', 'minDaysSinceContact', e.target.value)}
                placeholder="Ex.: 7"
                className="mt-1"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-200">
          <strong>{TEMPERATURE_META.warm.label}:</strong> qualquer lead que não se encaixe em quente nem em frio
          é classificado como morno automaticamente.
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: '#5A2A3C' }}
            className="text-white hover:opacity-90"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar critérios
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            Restaurar padrões
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function describeIntervalMinutes(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return '';
  if (m === 24 * 60) return 'uma vez por dia';
  if (m < 60) {
    return m === 1 ? 'a cada 1 minuto' : `a cada ${m} minutos`;
  }
  if (m % 60 === 0) {
    const hours = m / 60;
    return hours === 1 ? 'a cada 1 hora' : `a cada ${hours} horas`;
  }
  return `a cada ${m} minutos`;
}

function LeadTemperatureMonitorCadenceEditor({ settings, onSave, isAdmin = false }) {
  const savedMinutes = getTemperatureMonitorIntervalFromSettings(settings);

  const [value, setValue] = useState(() => String(savedMinutes));
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const lastSyncedRef = useRef(null);

  useEffect(() => {
    const key = String(savedMinutes);
    if (lastSyncedRef.current === key) return;
    if (dirty) return;
    lastSyncedRef.current = key;
    setValue(key);
  }, [savedMinutes, dirty]);

  const update = (next) => {
    setDirty(true);
    setValue(next);
  };

  const handleReset = () => {
    setValue(String(DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES));
    setDirty(true);
    toast.success('Cadência restaurada ao padrão — clique em Salvar para confirmar');
  };

  const handleSave = async () => {
    if (value === '' || value === null || value === undefined) {
      toast.error('Informe a frequência em minutos.');
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
      toast.error('Informe um número inteiro de minutos maior que zero.');
      return;
    }
    if (n < MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES) {
      toast.error(`Mínimo permitido: ${MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES} minuto(s).`);
      return;
    }
    if (n > MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES) {
      toast.error(`Máximo permitido: ${MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES} minutos (24 horas).`);
      return;
    }

    setSaving(true);
    try {
      await onSave.mutateAsync({
        key: TEMPERATURE_MONITOR_INTERVAL_KEY,
        value: String(n),
        type: 'number',
      });
      setDirty(false);
    } catch (e) {
      // a mutation já dispara um toast de erro via onError
    }
    setSaving(false);
  };

  const previewMinutes = (() => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.round(n);
  })();

  // Manual trigger of the same routine the scheduler runs. Doesn't touch the
  // scheduled cadence — it's meant for "I just changed the threshold, did
  // anything actually fire?" verification.
  const handleRunNow = async () => {
    setRunningNow(true);
    try {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/functions/run-lead-temperature-check', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.success === false) {
        const msg = data?.message || `Falha ao executar verificação (HTTP ${res.status}).`;
        toast.error(msg);
      } else {
        const checked = Number(data.checked) || 0;
        const cold = Number(data.coldNotified) || 0;
        const hot = Number(data.hotNotified) || 0;
        const leadsLabel = checked === 1 ? '1 lead avaliado' : `${checked} leads avaliados`;
        const coldLabel = cold === 1 ? '1 alerta de frio enviado' : `${cold} alertas de frio enviados`;
        const hotLabel = hot === 1 ? '1 aviso de quente enviado' : `${hot} avisos de quente enviados`;
        const summary = `${leadsLabel}, ${coldLabel}, ${hotLabel}.`;
        setLastRun({ at: new Date(), checked, cold, hot, summary });
        toast.success(`Verificação concluída: ${summary}`);
      }
    } catch (err) {
      toast.error(`Erro ao executar verificação: ${err?.message || 'tente novamente'}`);
    }
    setRunningNow(false);
  };

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <CardTitle className="text-gray-900 dark:text-gray-100 text-base flex items-center gap-2">
          <Thermometer className="w-4 h-4" />
          Frequência da verificação de leads frios
        </CardTitle>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Define a cada quantos minutos o sistema avalia os leads em busca de quem virou frio
          (e dispara os alertas para os vendedores). Mudanças passam a valer no próximo ciclo,
          sem precisar reiniciar o servidor.
        </p>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs text-gray-700 dark:text-gray-300">
              Intervalo entre verificações (minutos)
            </Label>
            <Input
              type="number"
              min={MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES}
              max={MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES}
              step="1"
              value={value}
              onChange={(e) => update(e.target.value)}
              placeholder={`Ex.: ${DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES}`}
              className="mt-1"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Permitido entre {MIN_TEMPERATURE_MONITOR_INTERVAL_MINUTES} e
              {' '}{MAX_TEMPERATURE_MONITOR_INTERVAL_MINUTES} minutos (24 horas).
              Padrão: {DEFAULT_TEMPERATURE_MONITOR_INTERVAL_MINUTES} minutos.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/40 p-3 text-xs text-gray-600 dark:text-gray-300 self-start">
            <div className="font-medium text-gray-700 dark:text-gray-200 mb-1">
              Pré-visualização
            </div>
            {previewMinutes
              ? <>O monitor rodará <strong>{describeIntervalMinutes(previewMinutes)}</strong>.</>
              : <>Informe um valor válido para ver a frequência aplicada.</>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: '#5A2A3C' }}
            className="text-white hover:opacity-90"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Salvar frequência
              </>
            )}
          </Button>
          <Button variant="outline" onClick={handleReset} disabled={saving}>
            Restaurar padrão
          </Button>
          {isAdmin && (
            <Button
              variant="outline"
              onClick={handleRunNow}
              disabled={runningNow}
              className="ml-auto"
              title="Executa a mesma rotina do agendador agora, sem esperar o próximo ciclo"
            >
              {runningNow ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Thermometer className="w-4 h-4 mr-2" />
                  Executar verificação agora
                </>
              )}
            </Button>
          )}
        </div>

        {isAdmin && lastRun && (
          <div className="mt-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
            <div className="font-medium">
              Última execução manual: {lastRun.at.toLocaleString('pt-BR')}
            </div>
            <div className="mt-0.5">{lastRun.summary}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.round(diffMs / 1000);
  if (diffSec < 0) return 'agora';
  if (diffSec < 60) return diffSec === 1 ? 'há 1 segundo' : `há ${diffSec} segundos`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return diffMin === 1 ? 'há 1 minuto' : `há ${diffMin} minutos`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return diffH === 1 ? 'há 1 hora' : `há ${diffH} horas`;
  const diffD = Math.round(diffH / 24);
  return diffD === 1 ? 'há 1 dia' : `há ${diffD} dias`;
}

function formatAbsoluteTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  } catch (e) {
    return d.toISOString();
  }
}

function formatDurationMs(ms) {
  if (ms === null || ms === undefined) return '—';
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return `${Math.round(n)} ms`;
  if (n < 60_000) return `${(n / 1000).toFixed(n < 10_000 ? 2 : 1)} s`;
  const totalSec = Math.round(n / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function MonitorRunLeadsList({ icon: Icon, label, leads, totalNotified, cap, accent }) {
  // Render one column inside the expanded panel for either cold or hot
  // alerts. Each lead is a link to LeadPJDetail. When the persisted slice
  // was capped (totalNotified > leads.length) we surface that explicitly so
  // admins know there are more leads beyond what's listed.
  const truncated = totalNotified > leads.length;
  return (
    <div className="flex-1 min-w-0">
      <div className={`flex items-center gap-2 mb-2 text-sm font-medium ${accent}`}>
        <Icon className="w-4 h-4" />
        <span>{label}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
          ({totalNotified})
        </span>
      </div>
      {leads.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">
          Nenhum lead registrado.
        </p>
      ) : (
        <ul className="space-y-1">
          {leads.map((lead) => (
            <li key={lead.leadId} className="text-sm">
              <Link
                to={`/LeadPJDetail?id=${lead.leadId}`}
                className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline break-words"
              >
                <span>{lead.label}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </Link>
              {lead.deleted && (
                <span className="ml-2 text-xs text-gray-400 dark:text-gray-500 italic">
                  (lead removido)
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {truncated && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
          Mostrando {leads.length} de {totalNotified} (limite de {cap || leads.length}{' '}
          leads salvos por execução).
        </p>
      )}
    </div>
  );
}

function MonitorRunLeadsBreakdown({ run }) {
  const coldLeads = Array.isArray(run.coldLeads) ? run.coldLeads : [];
  const hotLeads = Array.isArray(run.hotLeads) ? run.hotLeads : [];
  return (
    <div className="rounded-lg bg-gray-50 dark:bg-gray-950/30 border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex flex-col md:flex-row gap-6">
        {(run.coldNotified || 0) > 0 && (
          <MonitorRunLeadsList
            icon={Snowflake}
            label="Alertas frios"
            leads={coldLeads}
            totalNotified={run.coldNotified || 0}
            cap={run.coldLeadsCap}
            accent="text-blue-700 dark:text-blue-300"
          />
        )}
        {(run.hotNotified || 0) > 0 && (
          <MonitorRunLeadsList
            icon={Flame}
            label="Avisos quentes"
            leads={hotLeads}
            totalNotified={run.hotNotified || 0}
            cap={run.hotLeadsCap}
            accent="text-orange-700 dark:text-orange-300"
          />
        )}
      </div>
    </div>
  );
}

function LeadTemperatureMonitorHistory() {
  // Track which run rows the admin has expanded to inspect the affected
  // leads. We default to collapsed because most rows are uneventful; the
  // expand affordance is just for troubleshooting unexpected spikes.
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpanded = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { data, isFetching, isError, error, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['leadTemperatureMonitorRuns'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/functions/lead-temperature/monitor-runs?limit=10', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Falha ao carregar histórico (status ${res.status})`);
      }
      return res.json();
    },
    // Auto-refresh in the background so the panel reflects the live cadence
    // without forcing the admin to hit "Atualizar" between page visits.
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const runs = Array.isArray(data?.runs) ? data.runs : [];
  const lastRun = runs[0] || null;
  const lastSuccess = runs.find((r) => r.status === 'success') || null;

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-gray-900 dark:text-gray-100 text-base flex items-center gap-2">
              <History className="w-4 h-4" />
              Últimas execuções do monitor
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Confirme que a frequência configurada está sendo respeitada. Mostra
              quando o monitor rodou pela última vez, quantos leads foram avaliados
              e quantos alertas foram disparados.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="shrink-0"
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-5 space-y-4">
        {isError && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Não foi possível carregar o histórico: {error?.message || 'erro desconhecido'}.</span>
          </div>
        )}

        {!isError && runs.length === 0 && !isFetching && (
          <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 text-sm text-gray-500 dark:text-gray-400 text-center">
            O monitor ainda não rodou desde a última inicialização do servidor.
            A primeira execução acontece poucos minutos após o boot.
          </div>
        )}

        {!isError && lastRun && (
          <div
            className={`rounded-xl border p-4 ${
              lastRun.status === 'error'
                ? 'border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20'
                : 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {lastRun.status === 'error' ? (
                <Badge className="bg-red-600 hover:bg-red-600 text-white">
                  <XCircle className="w-3 h-3 mr-1" />
                  Falhou
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Sucesso
                </Badge>
              )}
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                Última execução {formatRelativeTime(lastRun.startedAt)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({formatAbsoluteTime(lastRun.startedAt)})
              </span>
            </div>
            {lastRun.status === 'error' ? (
              <div className="text-sm text-red-700 dark:text-red-300 break-words">
                Erro: {lastRun.errorMessage || 'sem detalhes'}
              </div>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300">
                Avaliou <strong>{lastRun.leadsChecked}</strong>{' '}
                {lastRun.leadsChecked === 1 ? 'lead' : 'leads'} em{' '}
                <strong>{formatDurationMs(lastRun.durationMs)}</strong> e disparou{' '}
                <strong>{lastRun.coldNotified}</strong> alerta(s) de frio e{' '}
                <strong>{lastRun.hotNotified}</strong> aviso(s) de quente.
              </div>
            )}
            {lastRun.status === 'error' && lastSuccess && lastSuccess !== lastRun && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Última execução bem-sucedida: {formatRelativeTime(lastSuccess.startedAt)}
                {' '}({formatAbsoluteTime(lastSuccess.startedAt)}).
              </div>
            )}
          </div>
        )}

        {!isError && runs.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-950/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="w-8 px-2 py-2"></th>
                  <th className="text-left font-medium px-3 py-2">Quando</th>
                  <th className="text-left font-medium px-3 py-2">Status</th>
                  <th className="text-right font-medium px-3 py-2">Leads avaliados</th>
                  <th className="text-right font-medium px-3 py-2">Alertas frios</th>
                  <th className="text-right font-medium px-3 py-2">Avisos quentes</th>
                  <th className="text-right font-medium px-3 py-2">Duração</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {runs.map((r) => {
                  const totalLeads = (r.coldNotified || 0) + (r.hotNotified || 0);
                  const isExpanded = expanded.has(r.id);
                  // Only allow expansion when at least one alert was sent.
                  // Disabling the chevron on no-op runs avoids an empty
                  // expanded panel that says "no leads" for every quiet run.
                  const canExpand = totalLeads > 0;
                  const rowBg =
                    r.status === 'error'
                      ? 'bg-red-50/30 dark:bg-red-950/10'
                      : 'bg-white dark:bg-gray-900';
                  return (
                    <React.Fragment key={r.id}>
                      <tr
                        className={`${rowBg} ${canExpand ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40' : ''}`}
                        onClick={canExpand ? () => toggleExpanded(r.id) : undefined}
                      >
                        <td className="px-2 py-2 align-top">
                          {canExpand ? (
                            <button
                              type="button"
                              aria-label={isExpanded ? 'Recolher leads' : 'Expandir leads'}
                              aria-expanded={isExpanded}
                              onClick={(e) => { e.stopPropagation(); toggleExpanded(r.id); }}
                              className="text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-block w-4 h-4" aria-hidden="true" />
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-gray-800 dark:text-gray-200">
                            {formatRelativeTime(r.startedAt)}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {formatAbsoluteTime(r.startedAt)}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          {r.status === 'error' ? (
                            <Badge className="bg-red-600 hover:bg-red-600 text-white">
                              <XCircle className="w-3 h-3 mr-1" />
                              Falhou
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Sucesso
                            </Badge>
                          )}
                          {r.status === 'error' && r.errorMessage && (
                            <div
                              className="text-xs text-red-600 dark:text-red-300 mt-1 max-w-xs break-words"
                              title={r.errorMessage}
                            >
                              {r.errorMessage}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {r.leadsChecked}
                        </td>
                        <td className="px-3 py-2 align-top text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {r.coldNotified}
                        </td>
                        <td className="px-3 py-2 align-top text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {r.hotNotified}
                        </td>
                        <td className="px-3 py-2 align-top text-right tabular-nums text-gray-700 dark:text-gray-300">
                          {formatDurationMs(r.durationMs)}
                        </td>
                      </tr>
                      {isExpanded && canExpand && (
                        <tr className={rowBg}>
                          <td></td>
                          <td colSpan={6} className="px-3 pb-4 pt-0 align-top">
                            <MonitorRunLeadsBreakdown run={r} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {dataUpdatedAt > 0 && !isError && (
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Painel atualizado {formatRelativeTime(new Date(dataUpdatedAt).toISOString())}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GoogleCalendarSettings({ settings, onSave, isAdmin, showSystemStatus = false }) {
  const [connecting, setConnecting] = useState(false);
  const queryClient = useQueryClient();

  const { data: gcalStatus, refetch: refetchStatus, isError: gcalStatusError } = useQuery({
    queryKey: ["gcalStatus"],
    queryFn: async () => {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        // Surface the error to react-query instead of silently degrading to
        // { configured: false }. Otherwise a backend outage looks identical to
        // a missing-credentials situation and the connect button disappears
        // for the wrong reason.
        throw new Error(`status ${res.status}`);
      }
      return res.json();
    },
    retry: 1,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal") === "connected") {
      toast.success("Google Calendar conectado com sucesso! Seus eventos serão sincronizados automaticamente.");
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("gcal") === "error") {
      toast.error("Erro ao conectar: " + (params.get("reason") || "tente novamente"));
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const pollIntervalRef = useRef(null);
  const popupRef = useRef(null);

  useEffect(() => {
    const onMessage = (event) => {
      const data = event?.data;
      if (!data || data.source !== 'gcal-oauth') return;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (popupRef.current && !popupRef.current.closed) {
        try { popupRef.current.close(); } catch { /* ignore */ }
      }
      if (data.status === 'connected') {
        toast.success('Google Calendar conectado com sucesso!');
        refetchStatus();
        queryClient.invalidateQueries({ queryKey: ['googleCalendarEvents'] });
      } else {
        toast.error('Erro ao conectar: ' + (data.message || 'tente novamente'));
      }
      setConnecting(false);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [queryClient, refetchStatus]);

  const FRIENDLY_AUTH_ERROR = "A integração pode não estar configurada — fale com o administrador.";

  const handleConnect = async () => {
    if (connecting) return;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    const popup = window.open("about:blank", "gcalOAuth", "width=520,height=640");
    if (!popup) {
      toast.error("Permita pop-ups para este site para conectar sua conta Google.");
      return;
    }
    popupRef.current = popup;
    setConnecting(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/auth-url", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        try { popup.close(); } catch { /* ignore */ }
        toast.error(data.error || FRIENDLY_AUTH_ERROR);
        setConnecting(false);
        return;
      }
      popup.location.href = data.url;

      const pollMs = 4000;
      const maxMs = 5 * 60 * 1000;
      const startedAt = Date.now();
      const stop = () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setConnecting(false);
      };
      pollIntervalRef.current = setInterval(async () => {
        if (Date.now() - startedAt > maxMs) {
          stop();
          return;
        }
        try {
          const statusRes = await fetch("/api/functions/google-calendar/status", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (statusRes.ok) {
            const s = await statusRes.json();
            if (s.connected) {
              stop();
              refetchStatus();
              queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
              toast.success("Google Calendar conectado com sucesso!");
              if (!popup.closed) {
                try { popup.close(); } catch { /* cross-origin, ignore */ }
              }
              return;
            }
          }
        } catch { /* keep polling */ }
        if (popup.closed) {
          stop();
          refetchStatus();
        }
      }, pollMs);
    } catch {
      try { popup.close(); } catch { /* ignore */ }
      toast.error(FRIENDLY_AUTH_ERROR);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      const token = localStorage.getItem("accessToken");
      await fetch("/api/functions/google-calendar/disconnect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Google Calendar desconectado");
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["googleCalendarEvents"] });
    } catch {
      toast.error("Erro ao desconectar");
    }
    setConnecting(false);
  };

  const handleManualSync = async () => {
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      toast.success(`Sincronização concluída! ${data.synced || 0} novos eventos importados.`);
      queryClient.invalidateQueries({ queryKey: ["activitiesPJ"] });
    } catch {
      toast.error("Erro ao sincronizar");
    }
  };

  const isConfigured = !!gcalStatus?.configured;
  const isConnected = !!gcalStatus?.connected;

  return (
    <div className="space-y-6">
      {showSystemStatus && (
        <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-200 dark:border-gray-800">
            <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <SettingsIcon className="w-5 h-5" />
              Integração Google Calendar do sistema
            </CardTitle>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Status da integração que conecta o SalesTwo ao Google. Configurada pelo time técnico via variáveis de ambiente.
            </p>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div
              className="p-4 rounded-lg flex items-start gap-3"
              style={{ backgroundColor: isConfigured ? "#f0fdf4" : "#fef2f2" }}
            >
              {isConfigured ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700">
                      As credenciais da integração com o Google Calendar foram configuradas pelo time técnico.
                    </p>
                    <p className="text-xs text-green-600 mt-1">
                      Os vendedores já podem conectar suas contas pessoais do Google.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-600">
                      A integração com o Google Calendar ainda não foi configurada pelo time técnico.
                    </p>
                    <p className="text-xs text-red-500 mt-1">
                      Enquanto isso, ninguém conseguirá conectar a conta Google.
                    </p>
                  </div>
                </>
              )}
            </div>

            {isAdmin && (
              <div className="border-t pt-4 space-y-4">
                <GCalAdminConfigForm onSaved={refetchStatus} />

                <details className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <summary className="cursor-pointer p-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Como obter as credenciais no Google Cloud Console
                  </summary>
                  <ol className="list-decimal ml-5 px-3 pb-3 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                    <li>
                      Acesse o{" "}
                      <a
                        href="https://console.cloud.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                        style={{ color: "#F98F6F" }}
                      >
                        Google Cloud Console
                      </a>{" "}
                      e selecione um projeto (ou crie um novo).
                    </li>
                    <li>
                      Em <em>APIs &amp; Services → Library</em>, ative a <strong>Google Calendar API</strong>.
                    </li>
                    <li>
                      Em <em>APIs &amp; Services → OAuth consent screen</em>, configure a tela de consentimento (User Type: External; adicione os e-mails dos vendedores em <em>Test users</em> enquanto estiver em modo Testing).
                    </li>
                    <li>
                      Em <em>APIs &amp; Services → Credentials</em>, crie um <strong>OAuth 2.0 Client ID</strong> do tipo <em>Aplicativo Web</em>.
                    </li>
                    <li>
                      Em <em>"Authorized redirect URIs"</em>, adicione exatamente <code className="bg-white dark:bg-gray-900 px-1 rounded break-all">{window.location.origin}/api/functions/google-calendar/callback</code> (e a URI dos demais ambientes, se houver).
                    </li>
                    <li>
                      Copie o <strong>Client ID</strong> e o <strong>Client Secret</strong> e cole no formulário acima. Salve, depois clique em "Conectar minha conta Google".
                    </li>
                  </ol>
                </details>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Calendar className="w-5 h-5" />
            Conectar sua conta Google
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Conexão pessoal: você está conectando <strong>a sua própria conta Google</strong> ao SalesTwo, para sincronizar a sua agenda de vendas. Cada usuário conecta a conta dele.
          </p>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div
            className="p-4 rounded-lg"
            style={{ backgroundColor: isConnected ? "#f0fdf4" : isConfigured ? "#fef3c7" : "#fef2f2" }}
          >
            <div className="flex items-start gap-3">
              {isConnected ? (
                <>
                  <Link2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700">Sua conta Google está conectada</p>
                    {gcalStatus.calendarEmail && (
                      <p className="text-xs text-green-600 mt-0.5">Conta: {gcalStatus.calendarEmail}</p>
                    )}
                    {gcalStatus.lastSync && (
                      <p className="text-xs text-green-500 mt-0.5">Última sincronização: {new Date(gcalStatus.lastSync).toLocaleString("pt-BR")}</p>
                    )}
                  </div>
                </>
              ) : isConfigured ? (
                <>
                  <Unlink className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-700">
                      A integração com o Google Calendar já está configurada no sistema.
                    </p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Agora você pode conectar a sua conta Google para sincronizar sua agenda.
                    </p>
                  </div>
                </>
              ) : gcalStatusError ? (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-600">
                      Não foi possível verificar o status da integração com o Google Calendar.
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">
                      O servidor não respondeu. Recarregue a página em alguns instantes ou contate o administrador se o problema persistir.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-red-600">
                      A integração com o Google Calendar ainda não está disponível.
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">
                      Entre em contato com o administrador do sistema para liberar a conexão.
                    </p>
                  </div>
                </>
              )}
            </div>
            {isConnected && gcalStatus?.scopeOutdated && (
              <div className="mt-3 p-3 rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs">
                <strong>Atenção:</strong> sua conexão usa um escopo de permissão antigo. Recomendamos desconectar e conectar novamente para aplicar o novo padrão de privilégio mínimo.
              </div>
            )}
          </div>

          {isConnected && <TargetCalendarPicker />}

          {isConnected && (
            <div className="flex gap-2">
              <Button onClick={handleManualSync} variant="outline" className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                Sincronizar Agora
              </Button>
              <Button onClick={handleDisconnect} disabled={connecting} variant="destructive">
                {connecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unlink className="w-4 h-4 mr-1" />}
                Desconectar minha conta Google
              </Button>
            </div>
          )}

          {!isConnected && isConfigured && (
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full text-white"
              style={{ background: "linear-gradient(135deg, #5A2A3C, #F98F6F)" }}
            >
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
              Conectar minha conta Google
            </Button>
          )}

          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Sincronização automática:</strong> Atividades criadas no SalesTwo vão automaticamente para a sua agenda Google.
              Eventos criados na sua agenda Google são importados a cada 5 minutos. Tudo funciona de forma transparente.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GCalAdminConfigForm({ onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverConfig, setServerConfig] = useState(null);
  const [clientId, setClientId] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const defaultRedirectUri = `${window.location.origin}/api/functions/google-calendar/callback`;

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/functions/google-calendar/admin/config", {
        headers: { Authorization: `Bearer ${localStorage.getItem("accessToken")}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar configuração");
      const data = await res.json();
      setServerConfig(data);
      setClientId(data.clientId || "");
      setRedirectUri(data.redirectUri || "");
      setClientSecret("");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!clientId.trim()) {
      toast.error("Informe o Client ID");
      return;
    }
    if (!redirectUri.trim()) {
      toast.error("Informe o Redirect URI");
      return;
    }
    if (!serverConfig?.clientSecretHasValue && !clientSecret.trim()) {
      toast.error("Informe o Client Secret");
      return;
    }

    setSaving(true);
    try {
      const body = { clientId: clientId.trim(), redirectUri: redirectUri.trim() };
      if (clientSecret.trim() !== "") body.clientSecret = clientSecret.trim();

      const res = await fetch("/api/functions/google-calendar/admin/config", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");

      toast.success("Credenciais do Google salvas com sucesso!");
      setServerConfig(data);
      setClientSecret("");
      setShowSecret(false);
      if (onSaved) onSaved();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando configuração...
      </div>
    );
  }

  const sources = serverConfig?.sources || {};
  const sourceLabel = (s) =>
    s === "db" ? "salvo no banco" : s === "env" ? "variável de ambiente" : "não definido";

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
        Credenciais OAuth do Google Cloud Console
      </p>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Os valores salvos aqui ficam armazenados no banco (Client Secret é criptografado).
        Variáveis de ambiente continuam funcionando como fallback caso um campo fique em branco.
      </p>

      {serverConfig?.secretDecryptError && (
        <div className="p-3 rounded border border-red-300 bg-red-50 text-red-700 text-xs">
          Não foi possível descriptografar o Client Secret armazenado: {serverConfig.secretDecryptError}.
          Salve um novo valor para corrigir.
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm">Client ID</Label>
        <Input
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="123456789-abc.apps.googleusercontent.com"
          className="bg-white dark:bg-gray-800 font-mono text-xs"
        />
        <p className="text-[11px] text-gray-500">Origem atual: {sourceLabel(sources.clientId)}</p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Client Secret</Label>
        <div className="relative">
          <Input
            type={showSecret ? "text" : "password"}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={
              serverConfig?.clientSecretHasValue
                ? `Atual: ${serverConfig.clientSecretMasked} — deixe em branco para manter`
                : "Cole o Client Secret"
            }
            className="pr-10 bg-white dark:bg-gray-800 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-gray-500">
          Origem atual: {sourceLabel(sources.clientSecret)}. O valor é criptografado em repouso e nunca é exibido em texto puro.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-sm">Redirect URI</Label>
        <Input
          value={redirectUri}
          onChange={(e) => setRedirectUri(e.target.value)}
          placeholder={defaultRedirectUri}
          className="bg-white dark:bg-gray-800 font-mono text-xs"
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[11px] text-gray-500">
            Origem atual: {sourceLabel(sources.redirectUri)}.
          </p>
          {redirectUri !== defaultRedirectUri && (
            <button
              type="button"
              onClick={() => setRedirectUri(defaultRedirectUri)}
              className="text-[11px] underline"
              style={{ color: "#F98F6F" }}
            >
              Usar URI deste domínio ({defaultRedirectUri})
            </button>
          )}
        </div>
        <p className="text-[11px] text-gray-500">
          Precisa bater <strong>exatamente</strong> com uma das "Authorized redirect URIs" do OAuth Client no Google Cloud Console.
        </p>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="text-white"
          style={{ background: "linear-gradient(135deg, #5A2A3C, #F98F6F)" }}
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar credenciais
        </Button>
      </div>
    </div>
  );
}

function AutentiqueSettings({ settings, onSave }) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const getVal = (key) => {
    const s = settings.find(s => (s.setting_key || s.settingKey) === key);
    return s ? (s.setting_value || s.settingValue) : '';
  };

  useEffect(() => {
    const saved = getVal('autentique_token');
    if (saved) setToken(saved);
  }, [settings]);

  const handleSave = async () => {
    if (!token.trim()) {
      toast.error('Informe o token da Autentique');
      return;
    }
    setSaving(true);
    try {
      await onSave.mutateAsync({ key: 'autentique_token', value: token.trim(), type: 'text' });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const response = await fetch('/api/functions/autentiqueTest', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });
      const data = await response.json();
      if (data.success) {
        setTestResult({ ok: true, name: data.account?.name || data.account?.email || 'Conectado' });
        toast.success('Conexão com Autentique verificada!');
      } else {
        setTestResult({ ok: false, error: data.error || 'Falha na conexão' });
        toast.error(data.error || 'Falha ao testar conexão');
      }
    } catch (err) {
      setTestResult({ ok: false, error: err.message });
      toast.error('Erro ao testar conexão');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: '#5A2A3C20' }}>
              <FileSignature className="w-5 h-5" style={{ color: '#5A2A3C' }} />
            </div>
            <div>
              <CardTitle className="text-gray-900 dark:text-gray-100">Integração Autentique</CardTitle>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Configure o token de API da Autentique para assinatura digital de contratos
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <Label className="text-sm font-medium text-gray-900 dark:text-gray-100">Token de API</Label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Encontre seu token em{' '}
              <a href="https://app.autentique.com.br/configuracoes/api" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: '#F98F6F' }}>
                Autentique → Configurações → API
              </a>
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showToken ? "text" : "password"}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Cole seu token de API da Autentique"
                  className="pr-10 bg-white dark:bg-gray-800"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                onClick={handleSave}
                disabled={saving}
                style={{ backgroundColor: '#5A2A3C' }}
                className="text-white hover:opacity-90"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                Salvar
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              {token ? (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Token Configurado
                </Badge>
              ) : (
                <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  Não Configurado
                </Badge>
              )}
              {testResult && (
                testResult.ok ? (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    Conta: {testResult.name}
                  </span>
                ) : (
                  <span className="text-xs text-red-600 dark:text-red-400">
                    {testResult.error}
                  </span>
                )
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing || !token}
              className="border-gray-300 dark:border-gray-600"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Link2 className="w-4 h-4 mr-1" />}
              Testar Conexão
            </Button>
          </div>

          <div className="p-3 rounded-lg" style={{ backgroundColor: '#5A2A3C10' }}>
            <p className="text-xs" style={{ color: '#5A2A3C' }}>
              <strong>Como funciona:</strong> O token é armazenado de forma segura no banco de dados e usado para criar documentos,
              enviar para assinatura e verificar status de contratos diretamente pelo SalesTwo.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
// Phase 5.1 — lets the seller pick which Google calendar receives SalesTwo events.
function TargetCalendarPicker() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["gcalCalendars"],
    queryFn: async () => {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/calendars", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Falha ao carregar calendários");
      }
      return res.json();
    },
    retry: false,
  });

  const [saving, setSaving] = useState(false);
  const [pendingValue, setPendingValue] = useState(null);

  const calendars = data?.calendars || [];
  const currentValue = pendingValue ?? data?.currentTargetId ?? (calendars.find(c => c.primary)?.id || "");

  const handleChange = async (value) => {
    setPendingValue(value);
    setSaving(true);
    try {
      const token = localStorage.getItem("accessToken");
      const res = await fetch("/api/functions/google-calendar/target-calendar", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ calendarId: value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao salvar calendário");
      toast.success(`Calendário definido: ${j.summary || value}`);
      queryClient.invalidateQueries({ queryKey: ["gcalStatus"] });
    } catch (e) {
      toast.error(e.message);
      setPendingValue(null);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Sincronizar eventos para o calendário:
      </Label>
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando calendários…
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-between gap-2 text-sm text-red-600">
          <span>Não foi possível carregar calendários.</span>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </div>
      )}
      {!isLoading && !isError && calendars.length === 0 && (
        <p className="text-sm text-amber-700">Nenhum calendário editável encontrado nesta conta Google.</p>
      )}
      {!isLoading && !isError && calendars.length > 0 && (
        <>
          <Select value={currentValue} onValueChange={handleChange} disabled={saving}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Escolha um calendário" />
            </SelectTrigger>
            <SelectContent>
              {calendars.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.summary}{c.primary ? " (principal)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Atividades criadas no SalesTwo aparecerão neste calendário do Google. Você pode trocar a qualquer momento.
          </p>
        </>
      )}
    </div>
  );
}
