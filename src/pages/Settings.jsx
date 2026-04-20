import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Loader2, ListChecks, Plus, X, GripVertical, Calendar, Link2, Unlink, FileSignature, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { canAccessSystemsItem, hasAnySystemsAccess } from "@/components/utils/permissions";

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    initialData: [],
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systemSettings'] });
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
  const anySystemsTab = canSalesFields || canGoogleCalendarSettings || canAutentiqueSettings;

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
  const getOptions = () => {
    const setting = settings.find(s => s.setting_key === settingKey || s.settingKey === settingKey);
    if (setting) {
      try { return JSON.parse(setting.setting_value || setting.settingValue); } catch {}
    }
    return [];
  };

  const [options, setOptions] = useState([]);
  const [initialized, setInitialized] = useState(false);
  const [newOption, setNewOption] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initialized && settings.length > 0) {
      const loaded = getOptions();
      if (loaded.length > 0) {
        setOptions(loaded);
        setInitialized(true);
      }
    }
  }, [settings, initialized]);

  const handleAdd = () => {
    const trimmed = newOption.trim();
    if (!trimmed) return;
    if (options.includes(trimmed)) {
      toast.error('Esta opção já existe');
      return;
    }
    setOptions([...options, trimmed]);
    setNewOption("");
  };

  const handleRemove = (index) => {
    setOptions(options.filter((_, i) => i !== index));
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

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

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
              <div className="border-t pt-4 space-y-2">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Detalhes técnicos (somente leitura)</p>
                <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  <li className="flex items-center gap-2">
                    {isConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    <span><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">GCAL_CLIENT_ID</code> {isConfigured ? "configurado" : "não configurado"}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {isConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    <span><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">GCAL_CLIENT_SECRET</code> {isConfigured ? "configurado" : "não configurado"}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {isConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                    <span><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">GCAL_REDIRECT_URI</code> {isConfigured ? "configurado" : "não configurado"}</span>
                  </li>
                </ul>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  Para alterar essas credenciais, contate o administrador da infraestrutura. Os valores em si não são exibidos por segurança.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  URI de redirecionamento esperada: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded break-all">{window.location.origin}/api/functions/google-calendar/callback</code>
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  <strong>Dica:</strong> se ao conectar aparecer o erro <code>redirect_uri_mismatch</code>, confira se a URI acima está cadastrada exatamente igual em <em>"Authorized redirect URIs"</em> do OAuth Client no Google Cloud Console.
                </p>

                <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Como configurar no Google Cloud Console:</p>
                  <ol className="list-decimal ml-5 space-y-1 text-xs text-gray-600 dark:text-gray-400">
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
                      </a>
                      .
                    </li>
                    <li>Crie um projeto ou selecione um existente.</li>
                    <li>
                      Em <em>APIs &amp; Services → Library</em>, ative a <strong>Google Calendar API</strong>.
                    </li>
                    <li>
                      Em <em>APIs &amp; Services → OAuth consent screen</em>, configure a tela de consentimento (User Type: External, e adicione os e-mails dos vendedores em <em>Test users</em> enquanto o app estiver em modo Testing).
                    </li>
                    <li>
                      Em <em>APIs &amp; Services → Credentials</em>, crie um <strong>OAuth 2.0 Client ID</strong> do tipo <em>Aplicativo Web</em>.
                    </li>
                    <li>
                      Em <em>"Authorized redirect URIs"</em>, adicione exatamente a URI mostrada acima (e a URI de produção, se houver).
                    </li>
                    <li>
                      Copie o <strong>Client ID</strong> e <strong>Client Secret</strong> e configure as variáveis de ambiente <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded">GCAL_CLIENT_ID</code>, <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded">GCAL_CLIENT_SECRET</code> e <code className="bg-gray-100 dark:bg-gray-900 px-1 rounded">GCAL_REDIRECT_URI</code> no servidor.
                    </li>
                    <li>Reinicie o backend e teste o botão "Conectar minha conta Google" abaixo.</li>
                  </ol>
                </div>
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
