import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Loader2, ListChecks, Plus, X, GripVertical, Calendar, Link2, Unlink, FileSignature, CheckCircle2, AlertCircle, Eye, EyeOff, Thermometer, ExternalLink, Package, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { canAccessSystemsItem, hasAnySystemsAccess } from "@/components/utils/permissions";
// Temperature settings (rules, monitor cadence, history) were removed in
// Task #62 — temperatura agora é manual.

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
      // Some callers (e.g. the monitor cadence editor) may save multiple keys
      // back-to-back and want to show a single combined toast at the end —
      // they pass `silent: true` to suppress the per-write toast here.
      if (!variables?.silent) {
        toast.success('Configuração salva com sucesso!');
      }
    },
    onError: (error) => {
      toast.error(`Erro ao salvar: ${error?.message || 'tente novamente'}`);
    },
  });
  const isAdmin = user?.role === 'admin';
  const currentAgent = user?.agent;

  const canSalesFields = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsSalesFields');
  const canProducts = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsProducts');
  const canGoogleCalendarSettings = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsGoogleCalendar');
  const canAutentiqueSettings = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsAutentique');
  const canTemperatureSettings = isAdmin || canAccessSystemsItem(currentAgent, 'SystemsLeadTemperature');
  const anySystemsTab = canSalesFields || canProducts || canGoogleCalendarSettings || canAutentiqueSettings || canTemperatureSettings;

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
    : canProducts
      ? "products"
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
          {canProducts && (
            <TabsTrigger value="products" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
              <Package className="w-4 h-4 mr-2" />
              Produtos
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

        {canProducts && (
          <TabsContent value="products" className="space-y-6">
            <ProductsManager />
          </TabsContent>
        )}

        {canTemperatureSettings && (
          <TabsContent value="lead-temperature" className="space-y-6">
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30">
              <CardHeader>
                <CardTitle className="text-amber-900 dark:text-amber-200 text-base">
                  Temperatura agora é manual
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-amber-900/90 dark:text-amber-100/90 space-y-2">
                <p>
                  As regras automáticas de temperatura (quente / morno / frio) e o
                  monitor periódico foram desativados. A temperatura de cada lead
                  passa a ser definida manualmente pelo vendedor diretamente no
                  card do lead ou no kanban.
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
                  Não é mais necessário configurar limites, intervalos de cadência
                  ou histórico do monitor — essa página pode ser ignorada.
                </p>
              </CardContent>
            </Card>
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

  // Task #67 — comparação case-insensitive para evitar que o usuário
  // adicione "Prospecção" / "prospecção" / "PROSPECÇÃO" como entradas
  // distintas (e, no caso oposto, para impedir um falso erro "já existe"
  // quando o casing está realmente diferente).
  const isDuplicate = (list, candidate) =>
    list.some((opt) => String(opt).trim().toLocaleLowerCase('pt-BR') === candidate.toLocaleLowerCase('pt-BR'));

  const handleAdd = () => {
    const trimmed = newOption.replace(/,/g, '').trim();
    if (!trimmed) return;
    if (isDuplicate(options, trimmed)) {
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
    const pending = newOption.replace(/,/g, '').trim();
    if (pending) {
      if (isDuplicate(options, pending)) {
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
      const persistedJson = JSON.stringify(toSave);
      await onSave.mutateAsync({
        key: settingKey,
        value: persistedJson,
        type: 'json',
      });
      // Task #67 — força a sincronia do estado local com o que acabamos de
      // persistir. Antes dependíamos exclusivamente do cache do React Query
      // refetcher → savedJson → useEffect → setOptions. Se o refetch demorasse
      // ou houvesse uma corrida com outro componente que invalidasse o cache
      // (ex.: trocar de aba imediatamente após Salvar), o usuário podia ver
      // o dropdown "voltando" para o valor antigo e achar que o save falhou.
      // Atualizar o ref + options aqui torna o save idempotente sem precisar
      // esperar o ciclo do cache.
      lastSyncedJsonRef.current = persistedJson;
      setOptions(toSave);
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

function ProductsManager() {
  const queryClient = useQueryClient();
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => base44.entities.Product.list('-created_at'),
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [form, setForm] = useState({ name: '', defaultValue: '', description: '', active: true });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const resetForm = () => {
    setForm({ name: '', defaultValue: '', description: '', active: true });
    setEditingProduct(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setForm({
      name: product.name || '',
      defaultValue: String(product.defaultValue ?? product.default_value ?? ''),
      description: product.description || '',
      active: product.active !== false,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    resetForm();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = (form.name || '').trim();
      const defaultValue = parseFloat(form.defaultValue);
      if (!name) throw new Error('Informe o nome do produto');
      if (!Number.isFinite(defaultValue) || defaultValue < 0) {
        throw new Error('Valor padrão deve ser maior ou igual a zero');
      }
      const payload = {
        name,
        default_value: defaultValue,
        description: (form.description || '').trim() || null,
        active: !!form.active,
      };
      if (editingProduct) {
        return base44.entities.Product.update(editingProduct.id, payload);
      }
      return base44.entities.Product.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['productsActive'] });
      toast.success(editingProduct ? 'Produto atualizado!' : 'Produto cadastrado!');
      closeDialog();
    },
    onError: (err) => toast.error(err?.message || 'Erro ao salvar produto'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['productsActive'] });
      toast.success('Produto removido');
      setConfirmDeleteId(null);
    },
    onError: (err) => toast.error(err?.message || 'Erro ao remover produto'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.Product.update(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['productsActive'] });
    },
    onError: (err) => toast.error(err?.message || 'Erro ao atualizar produto'),
  });

  const formatBRL = (n) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0);

  return (
    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <CardHeader className="border-b border-gray-200 dark:border-gray-800 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-gray-900 dark:text-gray-100 text-base flex items-center gap-2">
            <Package className="w-5 h-5" />
            Catálogo de Produtos
          </CardTitle>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Cadastre produtos e serviços com valor padrão sugerido. Os vendedores selecionarão a partir deste catálogo ao montar uma proposta.
          </p>
        </div>
        <Button
          onClick={openCreate}
          style={{ backgroundColor: '#5A2A3C' }}
          className="text-white hover:opacity-90"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo produto
        </Button>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-10 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            Nenhum produto cadastrado ainda. Clique em "Novo produto" para começar.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-gray-500 dark:text-gray-400">
                  <th className="py-2 px-3 font-medium">Nome</th>
                  <th className="py-2 px-3 font-medium">Valor padrão</th>
                  <th className="py-2 px-3 font-medium">Descrição</th>
                  <th className="py-2 px-3 font-medium">Status</th>
                  <th className="py-2 px-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const active = p.active !== false;
                  return (
                    <tr key={p.id} className="border-b border-gray-100 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 px-3 font-medium text-gray-900 dark:text-gray-100">{p.name}</td>
                      <td className="py-2 px-3 text-gray-700 dark:text-gray-300">{formatBRL(p.defaultValue ?? p.default_value)}</td>
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">{p.description || '—'}</td>
                      <td className="py-2 px-3">
                        <Badge className={active
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100'
                          : 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}>
                          {active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleActiveMutation.mutate({ id: p.id, active: !active })}
                            className="h-8 px-2 text-xs"
                            disabled={toggleActiveMutation.isPending}
                            title={active ? 'Desativar' : 'Ativar'}
                          >
                            {active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(p)}
                            className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(p.id)}
                            className="h-8 w-8 p-0 text-gray-500 hover:text-red-600"
                            title="Remover"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <ProductDialog
        open={dialogOpen}
        onClose={closeDialog}
        form={form}
        setForm={setForm}
        onSave={() => saveMutation.mutate()}
        saving={saveMutation.isPending}
        editing={!!editingProduct}
      />

      <ConfirmDeleteDialog
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => deleteMutation.mutate(confirmDeleteId)}
        loading={deleteMutation.isPending}
      />
    </Card>
  );
}

function ProductDialog({ open, onClose, form, setForm, onSave, saving, editing }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md border border-gray-200 dark:border-gray-700"
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {editing ? 'Editar produto' : 'Novo produto'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <Label className="text-sm">Nome *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex: Plano Corporativo Premium"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-sm">Valor padrão (R$) *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.defaultValue}
              onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
              placeholder="0.00"
              className="mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">
              Sugestão pré-preenchida no momento da proposta. O vendedor pode ajustar.
            </p>
          </div>
          <div>
            <Label className="text-sm">Descrição (opcional)</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Detalhes internos sobre o produto/serviço"
              rows={3}
              className="mt-1 w-full rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#5A2A3C]/40"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Ativo (disponível para seleção em propostas)</span>
          </label>
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={onSave}
            disabled={saving}
            style={{ backgroundColor: '#5A2A3C' }}
            className="text-white hover:opacity-90"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {editing ? 'Salvar alterações' : 'Cadastrar produto'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({ open, onCancel, onConfirm, loading }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onCancel}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-sm border border-gray-200 dark:border-gray-700"
      >
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Remover produto?</h3>
        </div>
        <div className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">
          O produto deixará de aparecer no catálogo. As propostas que já o referenciam continuarão funcionando — o nome ficou registrado no item da proposta.
        </div>
        <div className="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancelar</Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Remover
          </Button>
        </div>
      </div>
    </div>
  );
}
