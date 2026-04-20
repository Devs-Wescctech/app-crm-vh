import { useState, useRef } from "react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Building2,
  FileText,
  MessageSquare,
  Save,
  TrendingUp,
  Plus,
  CheckCircle,
  Clock,
  Send,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Loader2,
  CheckCircle2,
  XCircle,
  DollarSign,
  ListTodo,
  Activity,
  Bell,
  Users,
  FileSignature,
  ExternalLink,
  Download,
  Presentation,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

import LeadPJTimeline from "@/components/sales/LeadPJTimeline";
import LeadPJPipelineHistory from "@/components/sales/LeadPJPipelineHistory";

const STAGES_PJ = [
  { value: "novo", label: "Novo", color: "bg-gray-500", badge: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100" },
  { value: "qualificacao", label: "Qualificação", color: "bg-purple-500", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100" },
  { value: "apresentacao", label: "Apresentação", color: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100" },
  { value: "proposta_enviada", label: "Proposta Enviada", color: "bg-yellow-500", badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100" },
  { value: "negociacao", label: "Negociação", color: "bg-orange-500", badge: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100" },
  { value: "fechado_ganho", label: "Fechado - Ganho", color: "bg-green-500", badge: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" },
  { value: "fechado_perdido", label: "Fechado - Perdido", color: "bg-red-500", badge: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100" },
];

const DEFAULT_INTEREST_OPTIONS_PJ = [
  "Consultoria",
  "Software / SaaS",
  "Serviço Recorrente",
  "Projeto Sob Demanda",
  "Treinamento",
  "Suporte Técnico",
  "Outro",
];

export default function LeadPJDetail() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const leadId = urlParams.get('id');
  const contractInputRef = useRef(null);
  
  const [editedLead, setEditedLead] = useState({});
  const [hasChanges, setHasChanges] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newTask, setNewTask] = useState({ title: "", scheduledAt: "" });
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: null });
  const [showLostDialog, setShowLostDialog] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [activeTab, setActiveTab] = useState('activities');
  const tasksSectionRef = useRef(null);

  const handleViewTasksClick = () => {
    setActiveTab('tasks');
    setTimeout(() => {
      if (tasksSectionRef.current) {
        tasksSectionRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    }, 50);
  };
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [proposalUrl, setProposalUrl] = useState("");
  const [uploadingContract, setUploadingContract] = useState(false);
  const [sendingContractAutentique, setSendingContractAutentique] = useState(false);
  const [sendingContractLink, setSendingContractLink] = useState(false);
  const [checkingAutentique, setCheckingAutentique] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: systemSettings = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 1000 * 60 * 5,
  });

  const INTEREST_OPTIONS = (() => {
    const setting = systemSettings.find(s => s.settingKey === 'interest_options_pj' || s.setting_key === 'interest_options_pj');
    if (setting) {
      try { return JSON.parse(setting.settingValue || setting.setting_value); } catch {}
    }
    return DEFAULT_INTEREST_OPTIONS_PJ;
  })();

  const { data: lead, isLoading } = useQuery({
    queryKey: ['leadPJ', leadId],
    queryFn: () => base44.entities.LeadPJ.filter({ id: leadId }).then(res => res[0]),
    enabled: !!leadId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    enabled: !!user,
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['activitiesPJ', leadId],
    queryFn: () => base44.entities.ActivityPJ.filter({ lead_id: leadId }),
    enabled: !!leadId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['proposalTemplates'],
    queryFn: () => base44.entities.ProposalTemplate.list(),
  });

  const updateLeadMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadPJ.update(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      toast.success('Lead atualizado com sucesso!');
      setHasChanges(false);
    },
  });

  const createActivityMutation = useMutation({
    mutationFn: (data) => base44.entities.ActivityPJ.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
      setNewNote("");
      setNewTask({ title: "", scheduledAt: "" });
      toast.success('Atividade criada!');
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (taskId) => base44.entities.ActivityPJ.update(taskId, { completed: true, completed_at: new Date().toISOString() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Tarefa concluída!');
    },
  });

  const concludeSaleMutation = useMutation({
    mutationFn: async () => {
      const currentUser = await base44.auth.me();
      return base44.entities.LeadPJ.update(leadId, {
        concluded: true,
        concludedAt: new Date().toISOString(),
        concludedBy: currentUser.email,
        stage: 'fechado_ganho',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      
      createActivityMutation.mutate({
        leadPjId: leadId,
        type: 'note',
        title: 'Venda Concluída',
        description: 'Lead PJ marcado como CONCLUÍDO - Venda B2B finalizada com sucesso!',
        assignedTo: leadAgentId || 'Sistema',
      });
      
      toast.success('Venda B2B concluída com sucesso!');
      
      setTimeout(() => {
        navigate(createPageUrl("LeadsPJKanban"));
      }, 2000);
    },
  });

  const markAsLostMutation = useMutation({
    mutationFn: async ({ reason }) => {
      return base44.entities.LeadPJ.update(leadId, {
        lost: true,
        lost_reason: reason,
        stage: 'fechado_perdido',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      
      createActivityMutation.mutate({
        lead_id: leadId,
        type: 'note',
        title: 'Lead PJ Perdido',
        description: `Lead marcado como PERDIDO\nMotivo: ${lostReason}`,
        assigned_to: leadAgentId,
      });
      
      toast.success('Lead marcado como perdido');
      setShowLostDialog(false);
      setLostReason("");
      
      setTimeout(() => {
        navigate(createPageUrl("LeadsPJKanban"));
      }, 2000);
    },
  });

  const deleteLeadMutation = useMutation({
    mutationFn: () => base44.entities.LeadPJ.delete(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      toast.success('Lead excluído permanentemente');
      setShowDeleteDialog(false);
      setTimeout(() => {
        navigate(createPageUrl("LeadsPJKanban"));
      }, 1000);
    },
    onError: () => {
      toast.error('Erro ao excluir o lead');
    },
  });

  const handleStageChange = async (newStage) => {
    const currentLeadData = queryClient.getQueryData(['leadPJ', leadId]);
    const stageHistory = currentLeadData.stageHistory ? [...currentLeadData.stageHistory] : [];
    
    stageHistory.push({
      from: currentLeadData.stage,
      to: newStage,
      changedAt: new Date().toISOString(),
      changedBy: user?.email || 'Sistema',
    });

    try {
      await updateLeadMutation.mutateAsync({
        stage: newStage,
        stageHistory: stageHistory,
      });

      await createActivityMutation.mutateAsync({
        leadPjId: leadId,
        type: 'stage_change',
        title: `Etapa alterada`,
        description: `Lead movido de "${STAGES_PJ.find(s => s.value === currentLeadData.stage)?.label}" para "${STAGES_PJ.find(s => s.value === newStage)?.label}"`,
        assignedTo: currentLeadData.agentId,
        metadata: {
          from: currentLeadData.stage,
          to: newStage,
        }
      });

      toast.success(`Lead movido para "${STAGES_PJ.find(s => s.value === newStage)?.label}"`);
    } catch (error) {
      toast.error('Erro ao alterar stage');
    }
  };

  const handleFieldChange = (field, value) => {
    let processedValue = value;
    if (typeof value === 'string' && (field === 'monthlyValue' || field === 'value' || field === 'monthlyRevenue')) {
      processedValue = value.trim() === '' ? null : parseFloat(value);
    } else if (typeof value === 'string' && field === 'numEmployees') {
      processedValue = value.trim() === '' ? null : parseInt(value, 10);
    }

    setEditedLead({ ...editedLead, [field]: processedValue });
    setHasChanges(true);
  };

  const handleSaveChanges = () => {
    const dataToSave = { ...editedLead };
    if (dataToSave.monthlyValue !== undefined && dataToSave.monthlyValue !== null && dataToSave.monthlyValue !== '') {
      dataToSave.value = parseFloat(dataToSave.monthlyValue);
    }
    updateLeadMutation.mutate(dataToSave);
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    createActivityMutation.mutate({
      lead_id: leadId,
      type: 'note',
      title: 'Nota adicionada',
      description: newNote,
      assigned_to: leadAgentId,
    });
  };

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;
    createActivityMutation.mutate({
      lead_id: leadId,
      type: newTask.type || 'task',
      title: newTask.title,
      description: newTask.description || "",
      scheduled_at: newTask.scheduledAt,
      assigned_to: leadAgentId,
      completed: false,
    });
  };

  const handleGenerateProposal = async (templateId) => {
    setGeneratingProposal(true);
    try {
      const response = await base44.functions.invoke('generateProposal', {
        lead_id: leadId,
        template_id: templateId,
        lead_type: 'pj',
      });

      if (response.data.success) {
        setProposalUrl(response.data.proposal_url);
        queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
        toast.success('Proposta gerada com sucesso!');
      } else {
        toast.error(response.data.error || 'Erro ao gerar proposta');
      }
    } catch (error) {
      toast.error('Erro ao gerar proposta');
    }
    setGeneratingProposal(false);
  };

  const handleSendWhatsApp = async () => {
    if (!proposalUrl && !lead.proposal_url) {
      toast.error('Gere a proposta primeiro!');
      return;
    }

    setSendingWhatsApp(true);
    try {
      const response = await base44.functions.invoke('sendProposalWhatsApp', {
        leadId: leadId,
        proposalUrl: proposalUrl || lead.proposal_url,
        lead_type: 'pj',
      });

      if (response.data.success) {
        toast.success('Proposta enviada via WhatsApp!');
        createActivityMutation.mutate({
          leadPjId: leadId,
          type: 'note',
          title: 'Proposta enviada via WhatsApp',
          description: `Proposta enviada para ${lead.phone}`,
          assignedTo: leadAgentId,
        });
      } else {
        toast.error(response.data.error || 'Erro ao enviar WhatsApp');
      }
    } catch (error) {
      toast.error('Erro ao enviar WhatsApp');
    }
    setSendingWhatsApp(false);
  };

  const handleSendEmail = async () => {
    if (!proposalUrl && !lead.proposal_url) {
      toast.error('Gere a proposta primeiro!');
      return;
    }

    if (!lead.email) {
      toast.error('Lead não possui e-mail cadastrado!');
      return;
    }

    setSendingEmail(true);
    try {
      const response = await base44.functions.invoke('sendProposalEmail', {
        lead_id: leadId,
        proposal_url: proposalUrl || lead.proposal_url,
      });

      if (response.data.success) {
        toast.success('Proposta enviada via e-mail!');
        createActivityMutation.mutate({
          leadPjId: leadId,
          type: 'note',
          title: 'Proposta enviada via E-mail',
          description: `Proposta enviada para ${lead.email}`,
          assignedTo: leadAgentId,
        });
      } else {
        toast.error(response.data.error || 'Erro ao enviar e-mail');
      }
    } catch (error) {
      toast.error('Erro ao enviar e-mail');
    }
    setSendingEmail(false);
  };

  const handleContractUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingContract(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = result.file?.url || result.file_url;
      
      if (!fileUrl) {
        throw new Error('URL do arquivo não retornada');
      }
      
      await base44.entities.LeadPJ.update(leadId, {
        contract_url: fileUrl,
        contract_uploaded_at: new Date().toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
      toast.success('Contrato anexado com sucesso!');
    } catch (error) {
      toast.error('Erro ao fazer upload do contrato');
    }
    setUploadingContract(false);
  };

  const handleSendContractAutentique = async (method) => {
    if (!lead.contractUrl) {
      toast.error('Anexe o contrato primeiro!');
      return;
    }

    if (method === 'email') {
      setSendingContractAutentique(true);
    } else {
      setSendingContractLink(true);
    }

    try {
      const response = await base44.functions.invoke('autentiqueCreateDocument', {
        lead_id: leadId,
        contract_url: lead.contractUrl,
        send_method: method,
        lead_type: 'pj',
      });

      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
        if (method === 'email') {
          toast.success('Contrato enviado para assinatura via e-mail!');
        } else {
          toast.success('Link de assinatura gerado!');
        }
      } else {
        toast.error(response.data.error || 'Erro ao enviar para Autentique');
      }
    } catch (error) {
      toast.error('Erro ao processar documento');
    }

    setSendingContractAutentique(false);
    setSendingContractLink(false);
  };

  const handleCheckAutentiqueStatus = async () => {
    if (!lead.signatureAutentiqueId) {
      toast.error('Nenhum documento em assinatura!');
      return;
    }

    setCheckingAutentique(true);
    try {
      const response = await base44.functions.invoke('autentiqueCheckStatus', {
        lead_id: leadId,
        lead_type: 'pj',
      });

      if (response.data.success) {
        queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
        if (response.data.status === 'signed') {
          toast.success('Contrato assinado!');
        } else {
          toast.info('Aguardando assinatura...');
        }
      } else {
        toast.error('Erro ao verificar status');
      }
    } catch (error) {
      toast.error('Erro ao verificar status');
    }
    setCheckingAutentique(false);
  };

  const formatCNPJ = (cnpj) => {
    if (!cnpj) return '-';
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const getLeadTemperature = () => {
    const lastContactAt = (editedLead.lastContactAt !== undefined ? editedLead.lastContactAt : lead?.lastContactAt);
    const referenceDate = lastContactAt 
      ? new Date(lastContactAt) 
      : new Date(lead?.createdDate || lead?.createdAt);
    const daysSinceContact = Math.floor((new Date() - referenceDate) / (1000 * 60 * 60 * 24));
    
    if (daysSinceContact <= 2) return { label: 'Quente', color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-950', days: daysSinceContact };
    if (daysSinceContact <= 5) return { label: 'Morno', color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950', days: daysSinceContact };
    return { label: 'Frio', color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-950', days: daysSinceContact };
  };

  if (isLoading || !lead) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const leadAgentId = lead?.agentId || lead?.agent_id;
  
  const currentAgent = user?.agent;
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdmin = user?.role === 'admin' || currentAgentType === 'admin';
  const isCoordinator = currentAgentType === 'coordinator';
  const isSupervisor = user?.role === 'supervisor' || currentAgentType?.includes('supervisor');
  
  const isOwnLead = currentAgent && String(leadAgentId) === String(currentAgent.id);
  const isTeamLead = isSupervisor && currentAgent?.teamId && 
    agents.some(a => String(a.id) === String(leadAgentId) && String(a.teamId) === String(currentAgent.teamId));
  
  if (user && !isAdmin && !isCoordinator && !isSupervisor && !isOwnLead && !isTeamLead) {
    const leadAgent = agents.find(a => String(a.id) === String(leadAgentId));
    
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 bg-orange-100 dark:bg-orange-950 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Este lead está sendo trabalhado por outro agente.
            </p>
            <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg mb-6">
              <p className="text-sm text-orange-900 dark:text-orange-300">
                <strong>Agente responsável:</strong>
                <br />
                {leadAgent?.name || 'Não atribuído'}
              </p>
            </div>
            <Button onClick={() => navigate(createPageUrl("LeadsPJKanban"))}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar ao Pipeline B2B
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (lead.lost) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <XCircle className="w-16 h-16 mx-auto mb-4 text-red-600 dark:text-red-400" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Lead Perdido</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Este lead foi marcado como perdido.
            </p>
            {lead.lost_reason && (
              <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg mb-4">
                <p className="text-sm font-semibold text-red-900 dark:text-red-300">Motivo:</p>
                <p className="text-sm text-red-700 dark:text-red-400">{lead.lost_reason}</p>
              </div>
            )}
            <div className="flex flex-col gap-3 w-full">
              <Button onClick={() => navigate(createPageUrl("LeadsPJKanban"))} className="w-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao Pipeline B2B
              </Button>
              <Button onClick={() => setShowDeleteDialog(true)} variant="destructive" className="w-full">
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir Permanentemente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStage = STAGES_PJ.find(s => s.value === (editedLead.stage !== undefined ? editedLead.stage : lead.stage));
  const actionableTypes = ['task', 'visit', 'call', 'meeting', 'email', 'presentation', 'proposal'];
  const pendingTasks = activities.filter(a => actionableTypes.includes(a.type) && !a.completed);
  const hasPendingTasks = pendingTasks.length > 0;

  const getTaskTypeConfig = (type) => {
    const configs = {
      task: { icon: AlertCircle, label: 'Tarefa', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/50' },
      visit: { icon: MapPin, label: 'Visita', color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/50' },
      call: { icon: Phone, label: 'Ligacao', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/50' },
      meeting: { icon: Users, label: 'Reuniao', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/50' },
      email: { icon: Mail, label: 'E-mail', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/50' },
      presentation: { icon: Presentation, label: 'Apresentacao', color: 'text-indigo-600 dark:text-indigo-400', bg: 'bg-indigo-100 dark:bg-indigo-900/50' },
      proposal: { icon: DollarSign, label: 'Proposta', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/50' },
    };
    return configs[type] || configs.task;
  };

  const temperature = getLeadTemperature();
  const leadAgent = agents.find(a => String(a.id) === String(leadAgentId));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {lead.concluded && (
        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-4 mx-3 sm:mx-6 mt-3 flex items-center gap-2">
          <CheckCircle className="text-green-600 dark:text-green-400 w-5 h-5 flex-shrink-0" />
          <span className="text-green-800 dark:text-green-300 font-medium text-sm">
            Venda B2B Concluída — este registro pode ser visualizado e editado normalmente.
          </span>
        </div>
      )}
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(createPageUrl("LeadsPJKanban"))}
                className="gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline">Pipeline B2B</span>
              </Button>
              <div className="h-6 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Vendas PJ</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <Button
                  onClick={handleSaveChanges}
                  disabled={updateLeadMutation.isPending}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/25"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Salvar
                </Button>
              )}
              {(lead.stage === 'fechado_ganho' || lead.stage === 'negociacao') && !lead.concluded && (
                <Button
                  onClick={() => {
                    setConfirmDialog({
                      isOpen: true,
                      title: 'Concluir venda',
                      message: 'Confirma a conclusão desta venda B2B? Este lead sairá do pipeline de vendas.',
                      confirmLabel: 'Concluir',
                      variant: 'default',
                      onConfirm: () => { concludeSaleMutation.mutate(); setConfirmDialog(prev => ({ ...prev, isOpen: false })); },
                    });
                  }}
                  disabled={concludeSaleMutation.isPending}
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white shadow-lg shadow-indigo-500/25"
                >
                  {concludeSaleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Concluir
                    </>
                  )}
                </Button>
              )}
              {!lead.lost && (
                <>
                  <Button
                    onClick={() => setShowLostDialog(true)}
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    onClick={() => setShowDeleteDialog(true)}
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Hero Profile Card */}
        <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-4 sm:p-8 mb-6 sm:mb-8 shadow-2xl shadow-indigo-500/20">
          <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -left-32 -bottom-32 h-96 w-96 rounded-full bg-purple-400/20 blur-3xl" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-white/20 text-4xl font-bold text-white shadow-xl backdrop-blur-sm border border-white/20">
                <Building2 className="w-12 h-12" />
              </div>
              <div className={`absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shadow-lg ${
                temperature.label === 'Quente' ? 'bg-gradient-to-br from-red-500 to-orange-500' :
                temperature.label === 'Morno' ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                'bg-gradient-to-br from-blue-400 to-cyan-500'
              } text-white`}>
                {temperature.days}d
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-3xl font-bold text-white truncate">
                  {lead.nomeFantasia || lead.nome_fantasia || lead.razaoSocial || lead.razao_social || "Empresa sem nome"}
                </h1>
                {hasPendingTasks && (
                  <div className="relative animate-bounce">
                    <Bell className="w-6 h-6 text-yellow-300 fill-yellow-300" />
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                      {pendingTasks.length}
                    </span>
                  </div>
                )}
              </div>
              
              <p className="text-indigo-100 text-sm mb-4">CNPJ: {formatCNPJ(lead.cnpj)}</p>
              
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${currentStage?.badge}`}>
                  <span className={`h-2 w-2 rounded-full ${currentStage?.color}`} />
                  {currentStage?.label}
                </span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                  temperature.label === 'Quente' ? 'bg-red-500/20 text-red-100' :
                  temperature.label === 'Morno' ? 'bg-yellow-500/20 text-yellow-100' :
                  'bg-blue-400/20 text-blue-100'
                }`}>
                  {temperature.label}
                </span>
              </div>

              {/* Quick Contact Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                {lead.contact_phone && (
                  <Button
                    size="sm"
                    onClick={() => window.open(`https://wa.me/55${lead.contact_phone.replace(/\D/g, '')}`, '_blank')}
                    className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                  >
                    <Phone className="w-4 h-4 mr-2" />
                    {lead.contact_phone}
                  </Button>
                )}
                {lead.contact_email && (
                  <Button
                    size="sm"
                    onClick={() => window.open(`mailto:${lead.contact_email}`, '_blank')}
                    className="bg-white/20 hover:bg-white/30 text-white border-0 backdrop-blur-sm"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    E-mail
                  </Button>
                )}
                {leadAgent && (
                  <span className="text-white/70 text-sm">
                    Agente: <strong className="text-white">{leadAgent.name}</strong>
                  </span>
                )}
                {(lead.created_at || lead.createdAt) && (() => {
                  const d = new Date(lead.created_at || lead.createdAt);
                  return !isNaN(d.getTime()) ? (
                    <span className="inline-flex items-center gap-1.5 text-white/70 text-sm">
                      <Calendar className="w-3.5 h-3.5" />
                      Cadastro: <strong className="text-white">{d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>
                    </span>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 shrink-0">
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <p className="text-white/70 text-xs uppercase tracking-wide">Valor Mensal</p>
                <p className="text-2xl font-bold text-white">
                  R$ {parseFloat(lead.monthly_value || lead.monthlyValue || 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <p className="text-white/70 text-xs uppercase tracking-wide">Funcionários</p>
                <p className="text-lg font-semibold text-white">
                  {lead.employee_count || lead.employeeCount || lead.num_employees || lead.numEmployees || "Não Informado"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Tasks Alert */}
        {hasPendingTasks && (
          <div className="mb-6 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/50 dark:to-orange-950/50 border border-amber-200 dark:border-amber-800 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/50">
                <Bell className="w-6 h-6 text-amber-600 dark:text-amber-400 animate-pulse" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                  {pendingTasks.length} {pendingTasks.length === 1 ? 'Tarefa Pendente' : 'Tarefas Pendentes'}
                </h3>
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Acesse a aba "Tarefas" para visualizar
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                onClick={handleViewTasksClick}
              >
                Ver Tarefas
              </Button>
            </div>
          </div>
        )}

        {/* Pipeline Progress */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Jornada do Lead B2B</h2>
            </div>
            <span className="text-sm text-gray-500">Clique em uma etapa para mover</span>
          </div>
          <LeadPJPipelineHistory lead={lead} onStageChange={handleStageChange} />
        </div>

        {/* Layout em Grid: Esquerda (Tabs) | Direita (Info) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* COLUNA ESQUERDA: TABS (2/3) */}
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-1">
                <TabsTrigger value="activities" className="data-[state=active]:bg-indigo-600 data-[state=active]:text-white">
                  <Activity className="w-4 h-4 mr-2" />
                  Atividades
                </TabsTrigger>
                <TabsTrigger value="tasks" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white relative">
                  <ListTodo className="w-4 h-4 mr-2" />
                  Tarefas
                  {hasPendingTasks && (
                    <Badge className="ml-2 bg-red-600 text-white text-xs px-1.5 py-0.5 rounded-full animate-pulse">
                      {pendingTasks.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="proposal" className="data-[state=active]:bg-yellow-600 data-[state=active]:text-white">
                  <FileText className="w-4 h-4 mr-2" />
                  Proposta
                </TabsTrigger>
                <TabsTrigger value="contract" className="data-[state=active]:bg-blue-600 data-[state=active]:text-white">
                  <FileSignature className="w-4 h-4 mr-2" />
                  Contrato
                </TabsTrigger>
              </TabsList>

              <TabsContent value="activities" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <MessageSquare className="w-5 h-5" />
                      Adicionar Nota Rápida
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <Textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Escreva uma nota sobre esta empresa..."
                      rows={3}
                      className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    <Button
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || createActivityMutation.isPending}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Nota
                    </Button>

                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Timeline de Atividades</h3>
                      <div className="max-h-[500px] overflow-y-auto">
                        <LeadPJTimeline activities={activities} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="tasks" className="mt-6">
                <div ref={tasksSectionRef} style={{ scrollMarginTop: '80px' }}>
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <ListTodo className="w-5 h-5" />
                      Nova Tarefa de Follow-up
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Tipo de Atividade</Label>
                      <select
                        value={newTask.type || 'task'}
                        onChange={(e) => setNewTask({ ...newTask, type: e.target.value })}
                        className="mt-1 w-full h-10 px-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="task">Tarefa</option>
                        <option value="call">Ligação</option>
                        <option value="meeting">Reunião</option>
                        <option value="visit">Visita</option>
                        <option value="email">E-mail</option>
                        <option value="presentation">Apresentação</option>
                        <option value="proposal">Proposta</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Título da Tarefa</Label>
                      <Input
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                        placeholder="Ex: Agendar reunião com o diretor..."
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Descrição (opcional)</Label>
                      <Textarea
                        value={newTask.description || ''}
                        onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                        placeholder="Detalhes adicionais sobre a atividade..."
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100">Data e Hora</Label>
                      <Input
                        type="datetime-local"
                        value={newTask.scheduledAt}
                        onChange={(e) => setNewTask({ ...newTask, scheduledAt: e.target.value })}
                        className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    </div>
                    <Button
                      onClick={handleAddTask}
                      disabled={!newTask.title.trim() || createActivityMutation.isPending}
                      className="w-full bg-purple-600 hover:bg-purple-700 dark:bg-purple-700 dark:hover:bg-purple-600"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar Atividade
                    </Button>

                    <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Tarefas Pendentes</h3>
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {pendingTasks.map((task) => {
                          const typeConfig = getTaskTypeConfig(task.type);
                          const TypeIcon = typeConfig.icon;
                          return (
                          <div key={task.id} className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:shadow-md transition-all">
                            <div className="flex items-start gap-3">
                              <div className={`mt-0.5 p-1.5 rounded-lg ${typeConfig.bg}`}>
                                <TypeIcon className={`w-4 h-4 ${typeConfig.color}`} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeConfig.bg} ${typeConfig.color}`}>
                                    {typeConfig.label}
                                  </span>
                                </div>
                                <label htmlFor={`task-${task.id}`} className="font-medium text-gray-900 dark:text-gray-100 cursor-pointer">
                                  {task.title}
                                </label>
                                {task.description && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{task.description}</p>
                                )}
                                {(task.scheduledAt || task.scheduled_at) && (
                                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    {format(new Date(task.scheduledAt || task.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => completeTaskMutation.mutate(task.id)}
                                disabled={completeTaskMutation.isPending}
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/30"
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Concluir
                              </Button>
                            </div>
                          </div>
                          );
                        })}
                        {pendingTasks.length === 0 && (
                          <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                            Nenhuma tarefa pendente
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                </div>
              </TabsContent>

              <TabsContent value="proposal" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <FileText className="w-5 h-5" />
                      Proposta Comercial B2B
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    {!lead.proposal_url && !proposalUrl ? (
                      <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">Selecione um template para gerar a proposta:</p>
                        <div className="grid gap-3">
                          {templates.map(template => (
                            <Button
                              key={template.id}
                              variant="outline"
                              onClick={() => handleGenerateProposal(template.id)}
                              disabled={generatingProposal}
                              className="justify-start"
                            >
                              {generatingProposal ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4 mr-2" />
                              )}
                              {template.name}
                            </Button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-3">
                        <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <p className="text-sm font-medium text-green-900 dark:text-green-300 flex items-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Proposta gerada com sucesso!
                          </p>
                          <Button
                            variant="link"
                            size="sm"
                            onClick={() => window.open(proposalUrl || lead.proposal_url, '_blank')}
                            className="p-0 h-auto text-green-700 dark:text-green-400"
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            Visualizar proposta
                          </Button>
                        </div>

                        <div className="flex gap-3">
                          <Button
                            onClick={handleSendWhatsApp}
                            disabled={sendingWhatsApp}
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            {sendingWhatsApp ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4 mr-2" />
                            )}
                            Enviar WhatsApp
                          </Button>
                          <Button
                            onClick={handleSendEmail}
                            disabled={sendingEmail || !lead.email}
                            variant="outline"
                            className="flex-1"
                          >
                            {sendingEmail ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Mail className="w-4 h-4 mr-2" />
                            )}
                            Enviar E-mail
                          </Button>
                        </div>

                        {lead.proposal_status && (
                          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 text-sm">
                              {lead.proposal_status === 'accepted' && (
                                <>
                                  <ThumbsUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                                  <span className="text-green-600 dark:text-green-400 font-medium">Proposta aceita!</span>
                                </>
                              )}
                              {lead.proposal_status === 'rejected' && (
                                <>
                                  <ThumbsDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                                  <span className="text-red-600 dark:text-red-400 font-medium">Proposta recusada</span>
                                </>
                              )}
                              {lead.proposal_status === 'viewed' && (
                                <>
                                  <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                                  <span className="text-blue-600 dark:text-blue-400">Proposta visualizada</span>
                                </>
                              )}
                              {lead.proposal_status === 'pending' && (
                                <>
                                  <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                  <span className="text-gray-600 dark:text-gray-400">Aguardando visualização</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="contract" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <FileSignature className="w-5 h-5" />
                      Gestão de Contrato
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    <input
                      ref={contractInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handleContractUpload}
                      className="hidden"
                    />
                    {!lead.contractUrl ? (
                      <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-8 text-center">
                        <FileSignature className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 dark:text-gray-400 mb-4">Nenhum contrato anexado</p>
                        <Button
                          onClick={() => contractInputRef.current?.click()}
                          disabled={uploadingContract}
                          className="bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-700 dark:hover:bg-indigo-600"
                        >
                          {uploadingContract ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 mr-2" />
                              Anexar Contrato PDF
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                              <div>
                                <p className="font-semibold text-green-900 dark:text-green-100">Contrato Anexado</p>
                                {lead.contractUploadedAt && (
                                  <p className="text-xs text-green-700 dark:text-green-400">
                                    Enviado em {format(new Date(lead.contractUploadedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(lead.contractUrl, '_blank')}
                                className="border-green-600 text-green-600 hover:bg-green-50"
                              >
                                <Download className="w-4 h-4 mr-1" />
                                Baixar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => contractInputRef.current?.click()}
                                disabled={uploadingContract}
                                className="border-indigo-600 text-indigo-600 hover:bg-indigo-50"
                              >
                                {uploadingContract ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  'Substituir'
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                          <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                            <Send className="w-4 h-4" />
                            Enviar para Assinatura (Autentique)
                          </h4>
                          
                          {!lead.signatureAutentiqueId ? (
                            <div className="flex items-center gap-3">
                              <Button
                                onClick={() => handleSendContractAutentique('email')}
                                disabled={sendingContractAutentique || !lead.email}
                                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                              >
                                {sendingContractAutentique ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Enviando...
                                  </>
                                ) : (
                                  <>
                                    <Mail className="w-4 h-4 mr-2" />
                                    Enviar por E-mail
                                  </>
                                )}
                              </Button>
                              <Button
                                onClick={() => handleSendContractAutentique('link')}
                                disabled={sendingContractLink}
                                variant="outline"
                                className="flex-1 border-purple-600 text-purple-600 hover:bg-purple-50"
                              >
                                {sendingContractLink ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Gerando...
                                  </>
                                ) : (
                                  <>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Gerar Link
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {lead.signatureStatus === 'pending' ? (
                                <>
                                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg border border-yellow-200 dark:border-yellow-800">
                                    <div className="flex items-center gap-3">
                                      <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                                      <div>
                                        <p className="font-semibold text-yellow-900 dark:text-yellow-100">Aguardando Assinatura</p>
                                        <p className="text-xs text-yellow-700 dark:text-yellow-400">O cliente ainda não assinou o contrato</p>
                                      </div>
                                    </div>
                                    {lead.signatureLink && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => window.open(lead.signatureLink, '_blank')}
                                        className="mt-3 border-yellow-600 text-yellow-600 hover:bg-yellow-100"
                                      >
                                        <ExternalLink className="w-4 h-4 mr-1" />
                                        Abrir Link de Assinatura
                                      </Button>
                                    )}
                                  </div>
                                  <Button
                                    onClick={handleCheckAutentiqueStatus}
                                    disabled={checkingAutentique}
                                    variant="outline"
                                    className="w-full"
                                  >
                                    {checkingAutentique ? (
                                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    ) : (
                                      <CheckCircle2 className="w-4 h-4 mr-2" />
                                    )}
                                    Verificar Status
                                  </Button>
                                </>
                              ) : lead.signatureStatus === 'signed' ? (
                                <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                                    <div>
                                      <p className="font-semibold text-green-900 dark:text-green-100">Contrato Assinado!</p>
                                      {lead.contractSignedAt && (
                                        <p className="text-xs text-green-700 dark:text-green-400">
                                          Assinado em {format(new Date(lead.contractSignedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg border border-red-200 dark:border-red-800">
                                  <div className="flex items-center gap-3">
                                    <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                                    <div>
                                      <p className="font-semibold text-red-900 dark:text-red-100">Assinatura Recusada</p>
                                      <p className="text-xs text-red-700 dark:text-red-400">O cliente recusou assinar o contrato</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* COLUNA DIREITA: Agente + Info + Valores (1/3) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Agente Responsável */}
            {agents.find(a => a.id === leadAgentId) && (
              <Card className="border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900">
                <CardHeader className="border-b border-indigo-200 dark:border-indigo-700">
                  <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
                    <Building2 className="w-5 h-5" />
                    Agente Responsável
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  {(() => {
                    const agent = agents.find(a => a.id === leadAgentId);
                    return agent ? (
                      <div className="flex items-center gap-4">
                        {agent.photo_url ? (
                          <img 
                            src={agent.photo_url} 
                            alt={agent.name}
                            className="w-16 h-16 rounded-full object-cover border-4 border-white dark:border-indigo-800 shadow-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-full bg-indigo-600 dark:bg-indigo-700 flex items-center justify-center border-4 border-white dark:border-indigo-800 shadow-lg">
                            <span className="text-2xl font-bold text-white">
                              {agent.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-bold text-lg text-indigo-900 dark:text-indigo-100">{agent.name}</p>
                          <div className="space-y-1 mt-2">
                            <p className="text-sm text-indigo-800 dark:text-indigo-200 flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {agent.phone}
                            </p>
                            {agent.email && (
                              <p className="text-sm text-indigo-800 dark:text-indigo-200 flex items-center gap-1 truncate">
                                <Mail className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{agent.email}</span>
                              </p>
                            )}
                            {agent.team && (
                              <Badge className="mt-2 bg-white dark:bg-indigo-800 text-indigo-800 dark:text-indigo-200 border border-indigo-300 dark:border-indigo-600">
                                {agent.team}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : null;
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Informações da Empresa */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <Building2 className="w-5 h-5" />
                  Informações da Empresa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Razão Social</Label>
                  <Input
                    value={editedLead.razaoSocial !== undefined ? editedLead.razaoSocial : (lead.razaoSocial || lead.razao_social || "")}
                    onChange={(e) => handleFieldChange('razaoSocial', e.target.value)}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Nome Fantasia</Label>
                  <Input
                    value={editedLead.nomeFantasia !== undefined ? editedLead.nomeFantasia : (lead.nomeFantasia || lead.nome_fantasia || "")}
                    onChange={(e) => handleFieldChange('nomeFantasia', e.target.value)}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Telefone Principal</Label>
                  <div className="flex gap-3 mt-1">
                    <Input
                      value={editedLead.phone !== undefined ? editedLead.phone : (lead.phone || "")}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                      className="flex-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                    {lead.phone && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => window.open(`https://wa.me/55${lead.phone.replace(/\D/g, '')}`, '_blank')}
                      >
                        <Phone className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">E-mail</Label>
                  <Input
                    value={editedLead.email !== undefined ? editedLead.email : (lead.email || "")}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Interesse</Label>
                  <Select 
                    value={editedLead.interest !== undefined ? editedLead.interest : (lead.interest || "")} 
                    onValueChange={(val) => handleFieldChange('interest', val)}
                  >
                    <SelectTrigger className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Selecione o interesse" />
                    </SelectTrigger>
                    <SelectContent>
                      {INTEREST_OPTIONS.map(option => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Última Data de Contato</Label>
                  <Input
                    type="datetime-local"
                    value={editedLead.lastContactAt !== undefined 
                      ? (editedLead.lastContactAt ? new Date(editedLead.lastContactAt).toISOString().slice(0, 16) : "")
                      : (lead.lastContactAt ? new Date(lead.lastContactAt).toISOString().slice(0, 16) : "")}
                    onChange={(e) => {
                      const value = e.target.value ? new Date(e.target.value).toISOString() : null;
                      handleFieldChange('lastContactAt', value);
                    }}
                    className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                {lead.contact_name && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Label className="text-gray-900 dark:text-gray-100">Contato</Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {lead.contact_name} {lead.contact_role && `- ${lead.contact_role}`}
                    </p>
                  </div>
                )}

                {lead.city && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Label className="flex items-center gap-2 text-gray-900 dark:text-gray-100 font-semibold">
                      <MapPin className="w-4 h-4" />
                      Localização
                    </Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {lead.city}/{lead.state}
                    </p>
                    {lead.address && (
                      <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">{lead.address}</p>
                    )}
                  </div>
                )}

                {lead.numEmployees && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Label className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <Users className="w-4 h-4" />
                      Funcionários
                    </Label>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {lead.numEmployees} colaboradores
                    </p>
                  </div>
                )}

                {lead.notes && (
                  <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                    <Label className="text-gray-900 dark:text-gray-100">Observações</Label>
                    <Textarea
                      value={editedLead.notes !== undefined ? editedLead.notes : lead.notes}
                      onChange={(e) => handleFieldChange('notes', e.target.value)}
                      rows={3}
                      className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Valores Financeiros - Destaque Verde */}
            <Card className="border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
              <CardHeader className="border-b border-green-200 dark:border-green-700">
                <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
                  <DollarSign className="w-5 h-5" />
                  Valores Financeiros
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div>
                  <Label className="text-sm text-green-800 dark:text-green-300">Valor Mensal Proposto</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null ? editedLead.monthlyValue : (lead.monthlyValue || "")}
                    onChange={(e) => handleFieldChange('monthlyValue', e.target.value)}
                    placeholder="0.00"
                    className="mt-1 bg-white dark:bg-gray-800 border-green-300 dark:border-green-700"
                  />
                </div>

                {lead.monthlyRevenue && (
                  <div>
                    <Label className="text-sm text-green-800 dark:text-green-300">Faturamento Mensal</Label>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300 mt-1">
                      {formatCurrency(lead.monthlyRevenue)}
                    </p>
                  </div>
                )}

                {((editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null && editedLead.monthlyValue !== "") || 
                  (lead.value !== undefined && lead.value !== null)) && (
                  <div className="pt-3 border-t border-green-300 dark:border-green-700">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center shadow-sm">
                      <p className="text-xs text-green-700 dark:text-green-400 mb-1">Valor Estimado do Negócio</p>
                      <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                        {formatCurrency(
                          editedLead.monthlyValue !== undefined && editedLead.monthlyValue !== null && editedLead.monthlyValue !== ""
                            ? editedLead.monthlyValue
                            : lead.value
                        )}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Dialog Marcar como Perdido */}
      <Dialog open={showLostDialog} onOpenChange={setShowLostDialog}>
        <DialogContent className="bg-white dark:bg-gray-900">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Marcar Lead PJ como Perdido</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600 dark:text-gray-400">
              Este lead sairá do pipeline de vendas B2B. Por favor, informe o motivo da perda:
            </p>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Ex: Cliente optou por concorrente, preço acima do orçamento, não houve interesse..."
              rows={4}
              className="bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
            />
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowLostDialog(false);
                  setLostReason("");
                }}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => markAsLostMutation.mutate({ reason: lostReason })}
                disabled={!lostReason.trim() || markAsLostMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
              >
                {markAsLostMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Marcando...
                  </>
                ) : (
                  'Confirmar Perda'
                )}
              </Button>
            </div>
          </CardContent>
        </DialogContent>
      </Dialog>

      {/* Dialog Excluir Lead */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-white dark:bg-gray-900">
          <div className="p-6 text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-600 dark:text-red-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Excluir Lead Permanentemente?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Esta ação não pode ser desfeita. Todos os dados, atividades e documentos deste lead serão removidos.
            </p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => setShowDeleteDialog(false)} variant="outline">
                Cancelar
              </Button>
              <Button
                onClick={() => deleteLeadMutation.mutate()}
                disabled={deleteLeadMutation.isPending}
                variant="destructive"
              >
                {deleteLeadMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Excluindo...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Excluir Lead
                  </>
                )}
              </Button>
            </div>
          </div>
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
