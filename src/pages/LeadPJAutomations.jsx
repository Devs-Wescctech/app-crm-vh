import { useState, useEffect } from "react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Zap, Edit, Trash2, Play, Pause, Building2, MessageSquare, Loader2, CheckCircle2, AlertCircle, TestTube2, Key, Save, Copy, Eye, X, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import WhatsAppTemplateSelector from "@/components/whatsapp/WhatsAppTemplateSelector";
import AutomationTestDialog from "@/components/whatsapp/AutomationTestDialog";
import AutomationLogsPanel from "@/components/whatsapp/AutomationLogsPanel";

const STAGES_PJ = [
  { value: 'novo', label: 'Novo' },
  { value: 'qualificacao', label: 'Qualificação' },
  { value: 'apresentacao', label: 'Apresentação' },
  { value: 'proposta_enviada', label: 'Proposta Enviada' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechado_ganho', label: 'Fechado - Ganho' },
  { value: 'fechado_perdido', label: 'Fechado - Perdido' },
];

const TRIGGER_TYPES = [
  { value: 'lead_created', label: 'Lead Novo (Boas-Vindas)' },
  { value: 'stage_change', label: 'Mudança de Etapa' },
  { value: 'stage_duration', label: 'Tempo na Etapa' },
  { value: 'inactivity', label: 'Inatividade' },
  { value: 'no_activity', label: 'Sem Atividade' },
  { value: 'no_proposal_response', label: 'Proposta Sem Resposta' },
  { value: 'no_contact', label: 'Sem Contato' },
];

const ACTION_TYPES = [
  { value: 'send_whatsapp', label: 'Enviar WhatsApp' },
  { value: 'internal_alert', label: 'Alerta Interno (Coordenador)' },
  { value: 'change_stage', label: 'Mudar Etapa' },
  { value: 'create_task', label: 'Criar Tarefa' },
  { value: 'send_notification', label: 'Enviar Notificação' },
  { value: 'assign_agent', label: 'Atribuir Agente' },
  { value: 'send_email', label: 'Enviar E-mail' },
];

const VARIABLE_SOURCES = [
  { value: 'lead_name', label: 'Nome do Lead / Contato' },
  { value: 'company_name', label: 'Nome da Empresa (Razão Social / Fantasia)' },
  { value: 'agent_name', label: 'Nome do Vendedor' },
  { value: 'lead_email', label: 'Email do Lead' },
  { value: 'lead_phone', label: 'Telefone do Lead' },
  { value: 'proposal_url', label: 'URL da Proposta' },
  { value: 'contract_url', label: 'URL do Contrato / Assinatura' },
  { value: 'custom', label: 'Texto personalizado' },
];

function getTemplateVarCount(template) {
  if (!template) return 0;
  const sources = [template.dynamicComponents, template.staticComponents, template.components];
  for (const source of sources) {
    if (!source) continue;
    const body = source.find(c => c.type === 'BODY');
    if (body?.text) {
      const matches = body.text.match(/\{\{\d+\}\}/g);
      if (matches) return matches.length;
    }
  }
  return 0;
}

function getTemplateHeaderFormat(template) {
  if (!template) return null;
  const sources = [template.dynamicComponents, template.staticComponents, template.components];
  for (const source of sources) {
    if (!source) continue;
    const header = source.find(c => c.type === 'HEADER');
    if (header?.format) return header.format.toLowerCase();
  }
  return null;
}

export default function LeadPJAutomations() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState(null);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [testingAutomation, setTestingAutomation] = useState(null);
  const [isTokenDialogOpen, setIsTokenDialogOpen] = useState(false);
  const [automationToken, setAutomationToken] = useState("");
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: null });
  const [proposalTemplateId, setProposalTemplateId] = useState("");
  const [contractTemplateId, setContractTemplateId] = useState("");
  const [templatePickerFor, setTemplatePickerFor] = useState(null);
  const [templatePreview, setTemplatePreview] = useState(null);
  const [proposalTemplateVars, setProposalTemplateVars] = useState([]);
  const [contractTemplateVars, setContractTemplateVars] = useState([]);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    active: true,
    trigger_type: "lead_created",
    trigger_config: {
      stage: "",
      duration_days: 0,
      duration_hours: 0,
    },
    action_type: "send_whatsapp",
    action_config: {
      new_stage: "",
      task_title: "",
      task_description: "",
      notification_message: "",
      agent_id: "",
      email_subject: "",
      email_body: "",
      alertMessage: "",
      templateMessage: "",
    },
    whatsapp_template_id: "",
    whatsapp_template_name: "",
  });

  const { data: automations = [], isLoading: automationsLoading } = useQuery({
    queryKey: ['leadPJAutomations'],
    queryFn: () => base44.entities.LeadPJAutomation.list(),
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: salesAgents = [] } = useQuery({
    queryKey: ['salesAgents'],
    queryFn: () => base44.entities.SalesAgent.list(),
    initialData: [],
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['whatsappTemplates'],
    queryFn: () => base44.whatsapp.getTemplates(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['automationSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
  });

  useEffect(() => {
    if (settings && settings.length > 0) {
      const getVal = (key) => {
        const s = settings.find(s => (s.settingKey || s.setting_key) === key);
        return s ? (s.settingValue || s.setting_value) : '';
      };
      const tokenVal = getVal('automation_token');
      if (tokenVal) setAutomationToken(tokenVal);
      const proposalVal = getVal('proposal_template_id');
      if (proposalVal) setProposalTemplateId(proposalVal);
      const contractVal = getVal('contract_template_id');
      if (contractVal) setContractTemplateId(contractVal);
      const proposalVarsVal = getVal('proposal_template_variables');
      if (proposalVarsVal) {
        try { setProposalTemplateVars(JSON.parse(proposalVarsVal)); } catch(e) {}
      }
      const contractVarsVal = getVal('contract_template_variables');
      if (contractVarsVal) {
        try { setContractTemplateVars(JSON.parse(contractVarsVal)); } catch(e) {}
      }
    }
  }, [settings]);

  const saveTokenMutation = useMutation({
    mutationFn: async (token) => {
      const existingSetting = settings?.find(s => 
        (s.settingKey || s.setting_key) === 'automation_token'
      );
      
      const data = {
        setting_key: 'automation_token',
        setting_value: token,
        setting_type: 'text',
      };

      if (existingSetting) {
        return base44.entities.SystemSettings.update(existingSetting.id, data);
      } else {
        return base44.entities.SystemSettings.create(data);
      }
    },
    onSuccess: (_, token) => {
      setAutomationToken(token);
      queryClient.invalidateQueries({ queryKey: ['automationSettings'] });
      queryClient.invalidateQueries({ queryKey: ['whatsappTemplates'] });
      setIsTokenDialogOpen(false);
      toast.success('Token salvo! Templates sincronizados automaticamente.');
    },
    onError: (error) => {
      console.error('Error saving token:', error);
      toast.error('Erro ao salvar token de automação');
    }
  });

  const saveSettingMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      const existingSetting = settings?.find(s => 
        (s.settingKey || s.setting_key) === key
      );
      const data = {
        setting_key: key,
        setting_value: value,
        setting_type: 'text',
      };
      if (existingSetting) {
        return base44.entities.SystemSettings.update(existingSetting.id, data);
      } else {
        return base44.entities.SystemSettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationSettings'] });
      toast.success('Configuração salva com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao salvar configuração');
    }
  });

  const getTemplateBody = (t) => {
    if (t.dynamicComponents) {
      const bodyComponent = t.dynamicComponents.find(c => c.type === 'BODY');
      if (bodyComponent?.text) return bodyComponent.text;
    }
    if (t.staticComponents) {
      const bodyComponent = t.staticComponents.find(c => c.type === 'BODY');
      if (bodyComponent?.text) return bodyComponent.text;
    }
    if (t.components) {
      const bodyComponent = t.components.find(c => c.type === 'BODY' || c.type === 'body');
      if (bodyComponent?.text) return bodyComponent.text;
    }
    return t.body || t.text || t.message || t.content || '';
  };

  const getTemplateHeader = (t) => {
    const sources = [t.dynamicComponents, t.staticComponents, t.components];
    for (const source of sources) {
      if (!source) continue;
      const header = source.find(c => c.type === 'HEADER');
      if (header) {
        if (header.format === 'DOCUMENT' || header.format === 'document') return 'PDF / Documento';
        if (header.format === 'IMAGE' || header.format === 'image') return 'Imagem';
        if (header.format === 'VIDEO' || header.format === 'video') return 'Vídeo';
        if (header.text) return header.text;
      }
    }
    return null;
  };

  const resolveTemplateName = (id, storedName) => {
    if (storedName) return storedName;
    if (!id || !Array.isArray(templates)) return id || '';
    const t = templates.find(tpl => tpl.id === id);
    if (!t) return id;
    return t.description || t.name || t.templateName || id;
  };

  const handlePickTemplate = (templateId, purpose) => {
    if (purpose === 'proposal') {
      setProposalTemplateId(templateId);
      saveSettingMutation.mutate({ key: 'proposal_template_id', value: templateId });
    } else {
      setContractTemplateId(templateId);
      saveSettingMutation.mutate({ key: 'contract_template_id', value: templateId });
    }
    setTemplatePickerFor(null);
  };

  const selectTemplate = (template) => {
    const getTemplateBody = (t) => {
      if (t.dynamicComponents) {
        const bodyComponent = t.dynamicComponents.find(c => c.type === 'BODY');
        if (bodyComponent?.text) return bodyComponent.text;
      }
      if (t.staticComponents) {
        const bodyComponent = t.staticComponents.find(c => c.type === 'BODY');
        if (bodyComponent?.text) return bodyComponent.text;
      }
      if (t.components) {
        const bodyComponent = t.components.find(c => c.type === 'BODY' || c.type === 'body');
        if (bodyComponent?.text) return bodyComponent.text;
      }
      return t.body || t.text || t.message || t.content || '';
    };

    const templateBody = getTemplateBody(template);
    const varCount = getTemplateVarCount(template);
    const initialVars = Array.from({ length: varCount }, (_, i) => ({
      index: i + 1,
      source: '',
      customValue: '',
    }));
    
    setFormData({
      ...formData,
      whatsapp_template_id: template.id,
      whatsapp_template_name: template.description || template.name || template.templateName || template.id,
      action_config: {
        ...formData.action_config,
        templateMessage: templateBody,
        template_variables: initialVars,
      },
    });
    setShowTemplateSelector(false);
  };

  const createAutomationMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadPJAutomation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Automação criada com sucesso!');
    },
  });

  const updateAutomationMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadPJAutomation.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Automação atualizada com sucesso!');
    },
  });

  const deleteAutomationMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadPJAutomation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      toast.success('Automação excluída!');
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.LeadPJAutomation.update(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJAutomations'] });
      toast.success('Status atualizado!');
    },
  });

  const parseConfig = (config) => {
    if (!config) return {};
    if (typeof config === 'string') {
      try { return JSON.parse(config); } catch { return {}; }
    }
    return config;
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      active: true,
      trigger_type: "lead_created",
      trigger_config: {
        stage: "",
        duration_days: 0,
        duration_hours: 0,
      },
      action_type: "send_whatsapp",
      action_config: {
        new_stage: "",
        task_title: "",
        task_description: "",
        notification_message: "",
        agent_id: "",
        email_subject: "",
        email_body: "",
        alertMessage: "",
        templateMessage: "",
      },
      whatsapp_template_id: "",
      whatsapp_template_name: "",
    });
    setEditingAutomation(null);
  };

  const handleEdit = (automation) => {
    setEditingAutomation(automation);
    const triggerConfig = parseConfig(automation.triggerConfig) || {};
    const actionConfig = parseConfig(automation.actionConfig) || {};

    const defaultActionConfig = {
      new_stage: "",
      task_title: "",
      task_description: "",
      notification_message: "",
      agent_id: "",
      email_subject: "",
      email_body: "",
      alertMessage: "",
      templateMessage: "",
    };

    const defaultTriggerConfig = {
      stage: "",
      duration_days: 0,
      duration_hours: 0,
    };

    setFormData({
      name: automation.name || "",
      description: automation.description || "",
      active: automation.active !== false,
      trigger_type: automation.triggerType || "lead_created",
      trigger_config: {
        ...defaultTriggerConfig,
        stage: triggerConfig.stage || "",
        duration_days: triggerConfig.duration_days || triggerConfig.durationDays || triggerConfig.days || 0,
        duration_hours: triggerConfig.duration_hours || triggerConfig.durationHours || triggerConfig.hours || 0,
      },
      action_type: automation.actionType || "send_whatsapp",
      action_config: {
        ...defaultActionConfig,
        ...actionConfig,
        template_variables: actionConfig.template_variables || actionConfig.templateVariables || [],
      },
      whatsapp_template_id: automation.whatsappTemplateId || actionConfig.whatsapp_template_id || actionConfig.whatsappTemplateId || "",
      whatsapp_template_name: resolveTemplateName(
        automation.whatsappTemplateId || actionConfig.whatsapp_template_id || actionConfig.whatsappTemplateId || "",
        automation.whatsappTemplateName || actionConfig.whatsapp_template_name || actionConfig.whatsappTemplateName || ""
      ),
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.trigger_type) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    if (formData.action_type === 'send_whatsapp' && !formData.whatsapp_template_id) {
      toast.error('Selecione um template de WhatsApp para esta ação!');
      return;
    }

    const dataToSave = {
      name: formData.name,
      description: formData.description,
      active: formData.active,
      trigger_type: formData.trigger_type,
      trigger_config: JSON.stringify(formData.trigger_config),
      action_type: formData.action_type,
      action_config: JSON.stringify(formData.action_config),
      whatsapp_template_id: formData.whatsapp_template_id || null,
      whatsapp_template_name: formData.whatsapp_template_name || null,
    };

    if (editingAutomation) {
      updateAutomationMutation.mutate({
        id: editingAutomation.id,
        data: dataToSave
      });
    } else {
      createAutomationMutation.mutate(dataToSave);
    }
  };

  const getTriggerLabel = (type) => {
    return TRIGGER_TYPES.find(t => t.value === type)?.label || type;
  };

  const getActionLabel = (type) => {
    return ACTION_TYPES.find(a => a.value === type)?.label || type;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
              <Zap className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
              Automações de Vendas PJ
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Configure ações automáticas para o pipeline B2B
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AutomationLogsPanel automationType="lead_pj" colorScheme="indigo" />
            <Button onClick={() => setIsDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700">
              <Plus className="w-4 h-4 mr-2" />
              Nova Automação
            </Button>
          </div>
        </div>

        {/* Token Configuration Card */}
        <Card className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950 border-purple-200 dark:border-purple-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Key className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-purple-900 dark:text-purple-100">Token de Automações</CardTitle>
                  <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">Configure o token padrão para suas automações</p>
                </div>
              </div>
              <Button 
                onClick={() => setIsTokenDialogOpen(true)} 
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-100 dark:border-purple-600 dark:text-purple-300 dark:hover:bg-purple-900"
              >
                <Edit className="w-4 h-4 mr-2" />
                Editar
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-gray-900 rounded-lg border border-purple-200 dark:border-purple-800">
              <code className="text-sm font-mono text-gray-700 dark:text-gray-300 flex-1 truncate">
                {automationToken 
                  ? `${automationToken.substring(0, 6)}${'•'.repeat(20)}${automationToken.substring(automationToken.length - 4)}` 
                  : 'Nenhum token configurado'}
              </code>
              {automationToken && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300 text-xs">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Configurado
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Template Configuration Card */}
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-blue-200 dark:border-blue-800">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-blue-900 dark:text-blue-100">Templates de Envio</CardTitle>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">Configure os templates usados para envio de proposta e contrato via WhatsApp</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { key: 'proposal', label: 'Template de Proposta', desc: 'Template usado ao enviar propostas comerciais via WhatsApp', value: proposalTemplateId, icon: Send },
                { key: 'contract', label: 'Template de Contrato', desc: 'Template usado ao enviar contratos para assinatura via WhatsApp', value: contractTemplateId, icon: FileText },
              ].map(({ key, label, desc, value, icon: Icon }) => {
                const selectedTemplate = value ? templates?.find(t => t.id === value) : null;
                const body = selectedTemplate ? getTemplateBody(selectedTemplate) : null;
                const header = selectedTemplate ? getTemplateHeader(selectedTemplate) : null;
                return (
                  <div key={key} className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                          <Icon className="w-4 h-4 text-blue-600" />
                          {label}
                        </Label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
                      </div>
                    </div>

                    {selectedTemplate ? (
                      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2 bg-green-100 dark:bg-green-900/50">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="text-sm font-medium text-green-800 dark:text-green-200">
                              {selectedTemplate.description || selectedTemplate.name || selectedTemplate.templateName || selectedTemplate.id}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {selectedTemplate.status && (
                              <Badge className={`text-[10px] ${selectedTemplate.status === 'APPROVED' ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>
                                {selectedTemplate.status === 'APPROVED' ? 'Aprovado' : selectedTemplate.status}
                              </Badge>
                            )}
                            {selectedTemplate.language && (
                              <Badge className="bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px]">
                                {selectedTemplate.language}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="px-3 py-2 space-y-1">
                          {header && (
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                              📎 {header}
                            </p>
                          )}
                          {body && (
                            <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                                {body}
                              </p>
                            </div>
                          )}
                        </div>
                        {(() => {
                          const varCount = getTemplateVarCount(selectedTemplate);
                          const currentVars = key === 'proposal' ? proposalTemplateVars : contractTemplateVars;
                          const setVars = key === 'proposal' ? setProposalTemplateVars : setContractTemplateVars;
                          const settingKey = key === 'proposal' ? 'proposal_template_variables' : 'contract_template_variables';
                          const displayVars = currentVars.length === varCount ? currentVars : Array.from({ length: varCount }, (_, i) => currentVars[i] || { index: i + 1, source: '', customValue: '' });
                          if (varCount === 0) return null;
                          return (
                            <div className="px-3 py-2 border-t border-green-200 dark:border-green-800 space-y-2">
                              <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300 uppercase">Variáveis do Template</p>
                              {displayVars.map((v, idx) => (
                                <div key={idx} className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded whitespace-nowrap">
                                    {`{{${v.index || idx + 1}}}`}
                                  </span>
                                  <select
                                    value={v.source || ''}
                                    onChange={(e) => {
                                      const updated = [...displayVars];
                                      updated[idx] = { ...updated[idx], source: e.target.value, customValue: e.target.value === 'custom' ? updated[idx].customValue : '' };
                                      setVars(updated);
                                      saveSettingMutation.mutate({ key: settingKey, value: JSON.stringify(updated) });
                                    }}
                                    className="flex-1 text-[11px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
                                  >
                                    <option value="">Selecione...</option>
                                    {VARIABLE_SOURCES.map(vs => (
                                      <option key={vs.value} value={vs.value}>{vs.label}</option>
                                    ))}
                                  </select>
                                  {v.source === 'custom' && (
                                    <input
                                      value={v.customValue || ''}
                                      onChange={(e) => {
                                        const updated = [...displayVars];
                                        updated[idx] = { ...updated[idx], customValue: e.target.value };
                                        setVars(updated);
                                      }}
                                      onBlur={() => {
                                        saveSettingMutation.mutate({ key: settingKey, value: JSON.stringify(displayVars) });
                                      }}
                                      placeholder="Texto fixo..."
                                      className="flex-1 text-[11px] bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1"
                                    />
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-2 px-3 py-2 border-t border-green-200 dark:border-green-800">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTemplatePickerFor(key)}
                            className="text-xs h-7 border-blue-300 text-blue-700 hover:bg-blue-50"
                          >
                            <Edit className="w-3 h-3 mr-1" />
                            Trocar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (key === 'proposal') {
                                setProposalTemplateId('');
                                setProposalTemplateVars([]);
                                saveSettingMutation.mutate({ key: 'proposal_template_id', value: '' });
                                saveSettingMutation.mutate({ key: 'proposal_template_variables', value: '[]' });
                              } else {
                                setContractTemplateId('');
                                setContractTemplateVars([]);
                                saveSettingMutation.mutate({ key: 'contract_template_id', value: '' });
                                saveSettingMutation.mutate({ key: 'contract_template_variables', value: '[]' });
                              }
                            }}
                            className="text-xs h-7 border-red-300 text-red-600 hover:bg-red-50"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Remover
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        className="w-full h-20 border-dashed border-2 border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950"
                        onClick={() => setTemplatePickerFor(key)}
                        disabled={!Array.isArray(templates) || templates.length === 0}
                      >
                        <div className="flex flex-col items-center gap-1">
                          <Plus className="w-5 h-5" />
                          <span className="text-xs">Selecionar Template</span>
                        </div>
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {(!Array.isArray(templates) || templates.length === 0) && !templatesLoading && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
                <AlertCircle className="w-3 h-3 inline mr-1" />
                Nenhum template disponível. Configure o Token de Automações acima para carregar os templates.
              </p>
            )}
            {templatesLoading && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                Carregando templates...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-950 rounded-lg">
                  <Play className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automações Ativas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {automations.filter(a => a.active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <Pause className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Automações Inativas</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {automations.filter(a => !a.active).length}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white dark:bg-gray-900">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 dark:bg-blue-950 rounded-lg">
                  <MessageSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Templates Disponíveis</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {templatesLoading ? '...' : (Array.isArray(templates) ? templates.length : 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Automations List */}
        <div className="grid gap-4">
          {automations.length === 0 ? (
            <Card className="bg-white dark:bg-gray-900">
              <CardContent className="p-12 text-center">
                <Zap className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
                <p className="text-gray-600 dark:text-gray-400 font-medium mb-2">
                  Nenhuma automação criada
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Crie automações para otimizar seu processo de vendas B2B
                </p>
                <Button onClick={() => setIsDialogOpen(true)} variant="outline">
                  <Plus className="w-4 h-4 mr-2" />
                  Criar primeira automação
                </Button>
              </CardContent>
            </Card>
          ) : (
            automations.map(automation => {
              const triggerConfig = parseConfig(automation.triggerConfig);
              const actionConfig = parseConfig(automation.actionConfig);
              return (
              <Card key={automation.id} className={`bg-white dark:bg-gray-900 ${automation.active ? 'border-indigo-200 dark:border-indigo-800' : 'opacity-60'}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          {automation.name}
                        </h3>
                        <Badge className={automation.active ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}>
                          {automation.active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                      
                      {automation.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                          {automation.description}
                        </p>
                      )}

                      <div className="grid grid-cols-2 gap-4 mt-4">
                        <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold mb-1">GATILHO</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {getTriggerLabel(automation.triggerType)}
                          </p>
                          {triggerConfig?.stage && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Etapa: {STAGES_PJ.find(s => s.value === triggerConfig.stage)?.label}
                            </p>
                          )}
                          {(triggerConfig?.duration_days || triggerConfig?.durationDays || triggerConfig?.hours) > 0 && (
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              {triggerConfig.duration_days || triggerConfig.durationDays || triggerConfig.hours}h
                            </p>
                          )}
                        </div>

                        <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                          <p className="text-xs text-green-600 dark:text-green-400 font-semibold mb-1">AÇÃO</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100">
                            {getActionLabel(automation.actionType)}
                          </p>
                          {(actionConfig?.task_title || actionConfig?.taskTitle) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              {actionConfig.task_title || actionConfig.taskTitle}
                            </p>
                          )}
                          {(actionConfig?.new_stage || actionConfig?.newStage) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Para: {STAGES_PJ.find(s => s.value === (actionConfig.new_stage || actionConfig.newStage))?.label}
                            </p>
                          )}
                          {automation.actionType === 'send_whatsapp' && (automation.whatsappTemplateName || automation.whatsappTemplateId) && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                              Template: {resolveTemplateName(automation.whatsappTemplateId, automation.whatsappTemplateName)}
                            </p>
                          )}
                          {automation.actionType === 'send_whatsapp' && actionConfig?.templateMessage && (
                            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-md">
                              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 font-medium">Texto da mensagem:</p>
                              <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-4">
                                {actionConfig.templateMessage}
                              </p>
                            </div>
                          )}
                          {automation.actionType === 'internal_alert' && actionConfig?.alertMessage && (
                            <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                              <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-medium">Alerta interno:</p>
                              <p className="text-xs text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap line-clamp-4">
                                {actionConfig.alertMessage}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      {automation.executionCount > 0 && (
                        <div className="mt-4 text-xs text-gray-500 dark:text-gray-500">
                          Executada {automation.executionCount} {automation.executionCount === 1 ? 'vez' : 'vezes'}
                          {automation.lastExecution && (
                            <span> • Última execução: {new Date(automation.lastExecution).toLocaleString('pt-BR')}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        checked={automation.active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: automation.id, active: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setTestingAutomation(automation);
                          setShowTestDialog(true);
                        }}
                        title="Testar automação"
                        className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                      >
                        <TestTube2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(automation)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setConfirmDialog({
                            isOpen: true,
                            title: 'Excluir automação',
                            message: 'Tem certeza que deseja excluir esta automação?',
                            confirmLabel: 'Excluir',
                            variant: 'danger',
                            onConfirm: () => { deleteAutomationMutation.mutate(automation.id); setConfirmDialog(prev => ({ ...prev, isOpen: false })); },
                          });
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );})
          )}
        </div>
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-600" />
              {editingAutomation ? 'Editar Automação' : 'Nova Automação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Nome da Automação *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="Ex: Alertar leads sem contato há 7 dias"
                className="mt-1"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Descreva o que esta automação faz..."
                rows={2}
                className="mt-1"
              />
            </div>

            {/* Trigger */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Gatilho</h3>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de Gatilho *</Label>
                  <Select 
                    value={formData.trigger_type} 
                    onValueChange={(val) => setFormData({...formData, trigger_type: val})}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map(trigger => (
                        <SelectItem key={trigger.value} value={trigger.value}>{trigger.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.trigger_type !== 'lead_created' && (
                  <div>
                    <Label>Etapa</Label>
                    <Select 
                      value={formData.trigger_config.stage} 
                      onValueChange={(val) => setFormData({...formData, trigger_config: {...formData.trigger_config, stage: val}})}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione uma etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES_PJ.map(stage => (
                          <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.trigger_type !== 'lead_created' && formData.trigger_type !== 'stage_change' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Duração (dias)</Label>
                      <Input
                        type="number"
                        value={formData.trigger_config.duration_days}
                        onChange={(e) => setFormData({...formData, trigger_config: {...formData.trigger_config, duration_days: parseInt(e.target.value) || 0}})}
                        placeholder="0"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Duração (horas)</Label>
                      <Input
                        type="number"
                        value={formData.trigger_config.duration_hours}
                        onChange={(e) => setFormData({...formData, trigger_config: {...formData.trigger_config, duration_hours: parseInt(e.target.value) || 0}})}
                        placeholder="0"
                        className="mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Ação</h3>
              <div className="space-y-3">
                <div>
                  <Label>Tipo de Ação *</Label>
                  <Select 
                    value={formData.action_type} 
                    onValueChange={(val) => setFormData({...formData, action_type: val})}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPES.map(action => (
                        <SelectItem key={action.value} value={action.value}>{action.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {formData.action_type === 'change_stage' && (
                  <div>
                    <Label>Nova Etapa</Label>
                    <Select 
                      value={formData.action_config.new_stage} 
                      onValueChange={(val) => setFormData({...formData, action_config: {...formData.action_config, new_stage: val}})}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES_PJ.map(stage => (
                          <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {formData.action_type === 'create_task' && (
                  <>
                    <div>
                      <Label>Título da Tarefa</Label>
                      <Input
                        value={formData.action_config.task_title}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, task_title: e.target.value}})}
                        placeholder="Ex: Entrar em contato com a empresa"
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Descrição da Tarefa</Label>
                      <Textarea
                        value={formData.action_config.task_description}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, task_description: e.target.value}})}
                        placeholder="Detalhes da tarefa..."
                        rows={2}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}

                {formData.action_type === 'send_notification' && (
                  <div>
                    <Label>Mensagem da Notificação</Label>
                    <Textarea
                      value={formData.action_config.notification_message}
                      onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, notification_message: e.target.value}})}
                      placeholder="Mensagem a ser enviada..."
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                )}

                {formData.action_type === 'send_email' && (
                  <>
                    <div>
                      <Label>Assunto do E-mail</Label>
                      <Input
                        value={formData.action_config.email_subject}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, email_subject: e.target.value}})}
                        placeholder="Assunto..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Corpo do E-mail</Label>
                      <Textarea
                        value={formData.action_config.email_body}
                        onChange={(e) => setFormData({...formData, action_config: {...formData.action_config, email_body: e.target.value}})}
                        placeholder="Conteúdo do e-mail..."
                        rows={3}
                        className="mt-1"
                      />
                    </div>
                  </>
                )}

                {formData.action_type === 'send_whatsapp' && (
                  <>
                    <div>
                      <Label>Template de WhatsApp *</Label>
                      <div className="mt-1 flex gap-2">
                        <Input
                          value={resolveTemplateName(formData.whatsapp_template_id, formData.whatsapp_template_name)}
                          placeholder="Selecione um template..."
                          readOnly
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setShowTemplateSelector(true)}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Selecionar
                        </Button>
                      </div>
                      {formData.whatsapp_template_id && formData.whatsapp_template_name && (
                        <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {formData.whatsapp_template_name}
                        </p>
                      )}
                    </div>

                    {formData.whatsapp_template_id && formData.action_config.template_variables?.length > 0 && (
                      <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-950/30 space-y-3">
                        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase">
                          Mapeamento de Variáveis do Template
                        </p>
                        <p className="text-[11px] text-blue-600 dark:text-blue-400">
                          Configure qual dado será enviado em cada variável do template.
                        </p>
                        {formData.action_config.template_variables.map((v, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <span className="text-xs font-mono bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded whitespace-nowrap">
                              {`{{${v.index}}}`}
                            </span>
                            <Select
                              value={v.source}
                              onValueChange={(val) => {
                                const updated = [...formData.action_config.template_variables];
                                updated[idx] = { ...updated[idx], source: val, customValue: val === 'custom' ? updated[idx].customValue : '' };
                                setFormData({
                                  ...formData,
                                  action_config: { ...formData.action_config, template_variables: updated },
                                });
                              }}
                            >
                              <SelectTrigger className="flex-1 h-8 text-xs bg-white dark:bg-gray-800">
                                <SelectValue placeholder="Selecione o dado..." />
                              </SelectTrigger>
                              <SelectContent>
                                {VARIABLE_SOURCES.map(vs => (
                                  <SelectItem key={vs.value} value={vs.value}>{vs.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {v.source === 'custom' && (
                              <Input
                                value={v.customValue || ''}
                                onChange={(e) => {
                                  const updated = [...formData.action_config.template_variables];
                                  updated[idx] = { ...updated[idx], customValue: e.target.value };
                                  setFormData({
                                    ...formData,
                                    action_config: { ...formData.action_config, template_variables: updated },
                                  });
                                }}
                                placeholder="Texto fixo..."
                                className="flex-1 h-8 text-xs"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {formData.whatsapp_template_id && (!formData.action_config.template_variables || formData.action_config.template_variables.length === 0) && (
                      <p className="text-xs text-gray-500 italic">
                        Este template não possui variáveis configuráveis.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name || !formData.trigger_type}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {editingAutomation ? 'Salvar' : 'Criar Automação'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateSelector
        open={showTemplateSelector}
        onOpenChange={setShowTemplateSelector}
        selectedTemplateId={formData.whatsapp_template_id}
        onSelect={selectTemplate}
        accentColor="indigo"
      />

      <AutomationTestDialog
        open={showTestDialog}
        onOpenChange={setShowTestDialog}
        automationType="lead_pj"
        automationId={testingAutomation?.id}
        templateId={testingAutomation?.whatsappTemplateId}
        templateName={testingAutomation?.whatsappTemplateName}
        accentColor="indigo"
      />

      {/* Token Configuration Dialog */}
      <Dialog open={!!templatePickerFor} onOpenChange={(open) => { if (!open) { setTemplatePickerFor(null); setTemplatePreview(null); } }}>
        <DialogContent className="max-w-3xl bg-white dark:bg-gray-900 max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-blue-600" />
              Selecionar Template de {templatePickerFor === 'proposal' ? 'Proposta' : 'Contrato'}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-1 space-y-2">
            {templatesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span className="ml-2 text-gray-500">Carregando templates...</span>
              </div>
            ) : !Array.isArray(templates) || templates.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                <p>Nenhum template disponível.</p>
                <p className="text-xs mt-1">Configure o Token de Automações para carregar os templates.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {templates.map((t) => {
                  const body = getTemplateBody(t);
                  const header = getTemplateHeader(t);
                  const isSelected = (templatePickerFor === 'proposal' && proposalTemplateId === t.id) || (templatePickerFor === 'contract' && contractTemplateId === t.id);
                  const isPreviewing = templatePreview === t.id;
                  return (
                    <div
                      key={t.id}
                      className={`rounded-lg border-2 transition-all cursor-pointer ${
                        isSelected
                          ? 'border-green-500 bg-green-50 dark:bg-green-950/30'
                          : isPreviewing
                          ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/30'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div
                        className="flex items-center justify-between px-4 py-3"
                        onClick={() => setTemplatePreview(isPreviewing ? null : t.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                            <MessageSquare className="w-4 h-4 text-green-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                              {t.description || t.name || t.templateName || t.id}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5">
                              {t.status && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                  t.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                  {t.status === 'APPROVED' ? 'Aprovado' : t.status}
                                </span>
                              )}
                              {t.language && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                                  {t.language}
                                </span>
                              )}
                              {t.category && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300">
                                  {t.category}
                                </span>
                              )}
                              {header && (
                                <span className="text-[10px] text-gray-400">📎 {header}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button className="text-gray-400 hover:text-blue-600 p-1">
                            <Eye className="w-4 h-4" />
                          </button>
                          {isSelected ? (
                            <Badge className="bg-green-200 text-green-700 text-[10px]">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Selecionado
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePickTemplate(t.id, templatePickerFor);
                              }}
                            >
                              Usar este
                            </Button>
                          )}
                        </div>
                      </div>

                      {isPreviewing && body && (
                        <div className="px-4 pb-3 border-t border-gray-100 dark:border-gray-700">
                          <p className="text-[11px] text-gray-400 mt-2 mb-1 font-medium uppercase">Prévia da mensagem:</p>
                          <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                            <div className="bg-green-100 dark:bg-green-900/50 rounded-lg p-3 max-w-sm ml-auto">
                              <p className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{body}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isTokenDialogOpen} onOpenChange={setIsTokenDialogOpen}>
        <DialogContent className="max-w-lg bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Key className="w-5 h-5 text-purple-600" />
              Configurar Token de Automações
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="automation-token" className="text-gray-900 dark:text-gray-100">Token Padrão</Label>
              <Input
                id="automation-token"
                value={automationToken}
                onChange={(e) => setAutomationToken(e.target.value)}
                placeholder="Cole o token de automação aqui"
                className="mt-2"
              />
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                Este token será usado como padrão para todas as suas automações. Você pode obtê-lo junto a seu provedor de serviços de automação.
              </p>
            </div>

            <Alert className="bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <AlertDescription className="text-amber-800 dark:text-amber-200 text-sm">
                O token é armazenado de forma segura e será usado em suas automações de WhatsApp.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setIsTokenDialogOpen(false)}
              className="mr-2"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => saveTokenMutation.mutate(automationToken)}
              disabled={saveTokenMutation.isPending || !automationToken}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saveTokenMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {saveTokenMutation.isPending ? 'Salvando...' : 'Salvar Token'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel="Cancelar"
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}