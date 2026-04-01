import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, Save, Loader2, ListChecks, Plus, X, GripVertical, Calendar, Link2, Unlink, FileSignature, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

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
  });
  const isAdmin = user?.role === 'admin';

  if (!isAdmin) {
    return (
      <div className="p-6 min-h-screen bg-gray-50 dark:bg-gray-950 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Minha Conta</h1>
          <p className="text-gray-500">Gerencie suas integrações pessoais</p>
        </div>
        <GoogleCalendarSettings settings={settings} onSave={createOrUpdateSettingMutation} isAdmin={false} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Configurações do Sistema</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          Personalize o CRM da sua empresa
        </p>
      </div>

      <Tabs defaultValue="sales-fields" className="w-full">
        <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
          <TabsTrigger value="sales-fields" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <ListChecks className="w-4 h-4 mr-2" />
            Campos de Vendas
          </TabsTrigger>
          <TabsTrigger value="google-calendar" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <Calendar className="w-4 h-4 mr-2" />
            Google Agenda
          </TabsTrigger>
          <TabsTrigger value="autentique" className="data-[state=active]:bg-blue-50 dark:data-[state=active]:bg-blue-950">
            <FileSignature className="w-4 h-4 mr-2" />
            Autentique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales-fields" className="space-y-6">
          <SalesFieldsManager settings={settings} onSave={createOrUpdateSettingMutation} />
        </TabsContent>

        <TabsContent value="google-calendar" className="space-y-6">
          <GoogleCalendarSettings settings={settings} onSave={createOrUpdateSettingMutation} isAdmin={isAdmin} />
        </TabsContent>

        <TabsContent value="autentique" className="space-y-6">
          <AutentiqueSettings settings={settings} onSave={createOrUpdateSettingMutation} />
        </TabsContent>
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
    if (options.length === 0) {
      toast.error('Adicione pelo menos uma opção antes de salvar');
      return;
    }
    setSaving(true);
    try {
      await onSave.mutateAsync({
        key: settingKey,
        value: JSON.stringify(options),
        type: 'json',
      });
    } catch (error) {
      toast.error('Erro ao salvar opções');
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

function GoogleCalendarSettings({ settings, onSave, isAdmin }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const queryClient = useQueryClient();

  const getSetting = (key) => {
    const s = settings.find(s => (s.setting_key || s.settingKey) === key);
    return (s?.setting_value || s?.settingValue) || "";
  };

  const { data: gcalStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["gcalStatus"],
    queryFn: async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/functions/google-calendar/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { configured: false, connected: false };
      return res.json();
    },
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

  useEffect(() => {
    if (settings.length > 0) {
      setClientId(getSetting("google_calendar_client_id"));
      setClientSecret(getSetting("google_calendar_client_secret"));
    }
  }, [settings]);

  const handleSaveCredentials = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error("Preencha Client ID e Client Secret");
      return;
    }
    setSaving(true);
    try {
      await onSave.mutateAsync({ key: "google_calendar_client_id", value: clientId.trim(), type: "text" });
      await onSave.mutateAsync({ key: "google_calendar_client_secret", value: clientSecret.trim(), type: "text" });
      toast.success("Credenciais salvas!");
      refetchStatus();
    } catch {
      toast.error("Erro ao salvar credenciais");
    }
    setSaving(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/functions/google-calendar/auth-url", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast.error(data.error || "Erro ao obter URL de autorização");
      }
    } catch {
      toast.error("Erro ao conectar");
    }
    setConnecting(false);
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    try {
      const token = localStorage.getItem("token");
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
      const token = localStorage.getItem("token");
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

  return (
    <div className="space-y-6">
      <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-200 dark:border-gray-800">
          <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <Calendar className="w-5 h-5" />
            Google Calendar
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="p-4 rounded-lg" style={{ backgroundColor: gcalStatus?.connected ? "#f0fdf4" : gcalStatus?.configured ? "#fef3c7" : "#fef2f2" }}>
            <div className="flex items-center gap-2">
              {gcalStatus?.connected ? (
                <>
                  <Link2 className="w-5 h-5 text-green-600" />
                  <div>
                    <span className="text-sm font-medium text-green-700">Conectado ao Google Calendar</span>
                    {gcalStatus.calendarEmail && (
                      <p className="text-xs text-green-600">{gcalStatus.calendarEmail}</p>
                    )}
                    {gcalStatus.lastSync && (
                      <p className="text-xs text-green-500">Última sincronização: {new Date(gcalStatus.lastSync).toLocaleString("pt-BR")}</p>
                    )}
                  </div>
                </>
              ) : gcalStatus?.configured ? (
                <>
                  <Unlink className="w-5 h-5 text-amber-600" />
                  <span className="text-sm font-medium text-amber-700">Credenciais configuradas. Clique em "Conectar" para autorizar sua conta Google.</span>
                </>
              ) : (
                <>
                  <Unlink className="w-5 h-5 text-red-500" />
                  <span className="text-sm font-medium text-red-600">Não configurado. {isAdmin ? "Configure as credenciais abaixo." : "Peça ao admin para configurar."}</span>
                </>
              )}
            </div>
          </div>

          {gcalStatus?.connected && (
            <div className="flex gap-2">
              <Button onClick={handleManualSync} variant="outline" className="flex-1">
                <Save className="w-4 h-4 mr-2" />
                Sincronizar Agora
              </Button>
              <Button onClick={handleDisconnect} disabled={connecting} variant="destructive">
                {connecting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unlink className="w-4 h-4 mr-1" />}
                Desconectar
              </Button>
            </div>
          )}

          {!gcalStatus?.connected && gcalStatus?.configured && (
            <Button
              onClick={handleConnect}
              disabled={connecting}
              className="w-full text-white"
              style={{ background: "linear-gradient(135deg, #5A2A3C, #F98F6F)" }}
            >
              {connecting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Calendar className="w-4 h-4 mr-2" />}
              Conectar minha Conta Google
            </Button>
          )}

          {isAdmin && (
            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Configuração do Admin (uma única vez)</p>
              <div>
                <Label>Google Client ID</Label>
                <Input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Seu Client ID do Google Cloud Console"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Google Client Secret</Label>
                <Input
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  type="password"
                  placeholder="Seu Client Secret do Google Cloud Console"
                  className="mt-1"
                />
              </div>
              <Button onClick={handleSaveCredentials} disabled={saving} className="w-full" variant="outline">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Credenciais
              </Button>

              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2 border-t pt-3">
                <p className="font-semibold text-gray-800 dark:text-gray-200">Como obter (feito uma única vez):</p>
                <ol className="list-decimal ml-4 space-y-1">
                  <li>Acesse o <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Google Cloud Console</a></li>
                  <li>Crie um projeto e ative a <strong>Google Calendar API</strong></li>
                  <li>Vá em <strong>Credenciais → Criar Credenciais → ID do cliente OAuth</strong></li>
                  <li>Configure a Tela de Consentimento (tipo Externo)</li>
                  <li>Tipo: <strong>Aplicativo da Web</strong></li>
                  <li>URI de redirecionamento: <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs break-all">{window.location.origin}/api/functions/google-calendar/callback</code></li>
                  <li>Copie Client ID e Client Secret e salve acima</li>
                </ol>
              </div>
            </div>
          )}

          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Sincronização automática:</strong> Atividades criadas no SalesTwo vão automaticamente para o Google Calendar.
              Eventos criados no Google Calendar são importados a cada 5 minutos. Tudo funciona de forma transparente.
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