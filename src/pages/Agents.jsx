import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, UserCheck, UserX, Activity, Upload, Loader2, MessageSquare, Copy, Check, ExternalLink, MoreVertical, Clock, Users, Building2, Layers, Settings, ShieldX, KeyRound, Unlink } from "lucide-react";
import { canManageAgents, canManageAgentInTeam, isSupervisorType } from "@/components/utils/permissions.jsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const BURGUNDY = '#5A2A3C';
const CORAL = '#F98F6F';

const MENU_MODULES = [
  {
    id: "sales_pj",
    title: "Vendas PJ",
    items: [
      { id: "SalesPJDashboard", title: "Dashboard" },
      { id: "SalesPJAgentsDashboard", title: "Dashboard Vendedores" },
      { id: "NewLeadPJ", title: "Novo Lead PJ" },
      { id: "LeadsPJKanban", title: "Pipeline B2B" },
      { id: "SalesAgenda", title: "Agenda" },
      { id: "LeadPJSearch", title: "Busca de Leads" },
      { id: "SalesPJReports", title: "Relatórios" },
      { id: "SalesPJWonReport", title: "Rel. de Ganhos" },
      { id: "LeadPJReportList", title: "Relatório de Leads" },
      { id: "LeadPJAutomations", title: "Automações" },
      { id: "AutomationLogs", title: "Logs de Automações" },
      { id: "SalesTasks", title: "Tarefas" },
      { id: "ProposalTemplates", title: "Templates" },
    ]
  },
  {
    id: "config",
    title: "Configurações",
    items: [
      { id: "Agents", title: "Agentes" },
      { id: "Settings", title: "Configurações do Sistema" },
    ]
  },
  {
    id: "systems",
    title: "Sistemas",
    items: [
      { id: "SystemsSalesFields", title: "Campos de Vendas" },
      { id: "SystemsGoogleCalendar", title: "Google Agenda" },
      { id: "SystemsAutentique", title: "Autentique" },
    ]
  }
];

const AGENT_TYPE_OPTIONS = [
  { key: "admin", label: "Administrador" },
  { key: "coordinator", label: "Coordenador" },
  { key: "supervisor", label: "Supervisor" },
  { key: "sales", label: "Vendedor" },
  { key: "sales_supervisor", label: "Supervisor de Vendas" },
];

const AGENT_TYPE_CONFIG = {
  admin: { label: "Administrador", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  coordinator: { label: "Coordenador", color: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  supervisor: { label: "Supervisor", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  sales_supervisor: { label: "Supervisor de Vendas", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  sales: { label: "Vendedor", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
};

export default function Agents() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("agents");
  
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgent = user?.agent;
  const isAdmin = user?.role === 'admin';
  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isSupervisor = isSupervisorType(currentAgentType);
  const supervisorTeamId = isSupervisor ? (currentAgent?.teamId || currentAgent?.team_id) : null;
  const hasPermission = isAdmin || canManageAgents(currentAgent);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [selectedAgentForWhatsApp, setSelectedAgentForWhatsApp] = useState(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [generatedTokenData, setGeneratedTokenData] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [editingAgent, setEditingAgent] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamFormData, setTeamFormData] = useState({ name: "", description: "", supervisorEmail: "", supervisorId: "", coordinatorId: "", active: true });

  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [typeFormData, setTypeFormData] = useState({ key: "", label: "", description: "", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", modules: [], allowedSubmenus: [], active: true });
  const [expandedModulesInForm, setExpandedModulesInForm] = useState([]);

  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [selectedAgentForReset, setSelectedAgentForReset] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    cpf: "",
    photoUrl: "",
    email: "",
    password: "",
    agentType: "sales",
    teamId: "",
    supervisorId: "",
    online: false,
    active: true,
    workingHours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
    permissions: {
      can_view_all_leads: false,
      can_view_team_leads: false,
      can_access_reports: false,
      can_manage_agents: false,
      can_manage_settings: false,
    }
  });

  const { data: agents = [], isLoading: agentsLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => base44.entities.Agent.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const { data: agentTypes = [] } = useQuery({
    queryKey: ['agent-types'],
    queryFn: () => base44.entities.AgentType.list(),
    staleTime: 0,
    refetchOnMount: true,
    enabled: hasPermission,
  });

  const createAgentMutation = useMutation({
    mutationFn: (data) => base44.entities.Agent.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Agente criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar agente: ' + error.message);
    },
  });

  const updateAgentMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Agent.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Agente atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar agente: ' + error.message);
    },
  });

  const deleteAgentMutation = useMutation({
    mutationFn: (id) => base44.entities.Agent.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      toast.success('Agente excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir agente: ' + error.message);
    },
  });

  // Phase 3.1/3.3 — Admin-only Google Calendar revocation.
  const { data: gcalConnectedAgents = [] } = useQuery({
    queryKey: ['gcal-connected-agents'],
    queryFn: async () => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch('/api/functions/google-calendar/connected-agents', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: user?.role === 'admin',
    staleTime: 1000 * 60,
  });
  const gcalConnectedSet = new Set(gcalConnectedAgents.map(a => a.agentId));

  const revokeGcalMutation = useMutation({
    mutationFn: async (agentId) => {
      const token = localStorage.getItem('accessToken');
      const res = await fetch(`/api/functions/google-calendar/revoke-access/${agentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Falha ao revogar acesso.');
      return body;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['gcal-connected-agents'] });
      const name = data?.agentName || 'vendedor';
      if (data?.revoked) {
        toast.success(`Acesso Google Calendar revogado para ${name}.`);
      } else {
        toast.success(`Acesso local removido para ${name}. Token no Google: ${data?.revokeError || 'já inválido'}.`);
      }
    },
    onError: (error) => {
      toast.error('Erro ao revogar acesso: ' + error.message);
    },
  });

  const handleRevokeGcal = (agent) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Revogar acesso Google Calendar',
      message: `Tem certeza que deseja revogar o acesso do Google Calendar para "${agent.name}"? O token será invalidado no Google e o vendedor precisará reconectar.`,
      confirmLabel: 'Revogar acesso',
      variant: 'danger',
      onConfirm: () => {
        revokeGcalMutation.mutate(agent.id);
        setConfirmDialog(prev => ({ ...prev, isOpen: false }));
      },
    });
  };

  const createTeamMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setTeamDialogOpen(false);
      resetTeamForm();
      toast.success('Time criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar time: ' + error.message);
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setTeamDialogOpen(false);
      resetTeamForm();
      toast.success('Time atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar time: ' + error.message);
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (id) => base44.entities.Team.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Time excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir time: ' + error.message);
    },
  });

  const createTypeMutation = useMutation({
    mutationFn: (data) => base44.entities.AgentType.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types'] });
      setTypeDialogOpen(false);
      resetTypeForm();
      toast.success('Tipo de agente criado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao criar tipo: ' + error.message);
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.AgentType.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types'] });
      setTypeDialogOpen(false);
      resetTypeForm();
      toast.success('Tipo de agente atualizado com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar tipo: ' + error.message);
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: (id) => base44.entities.AgentType.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types'] });
      toast.success('Tipo de agente excluído com sucesso!');
    },
    onError: (error) => {
      toast.error('Erro ao excluir tipo: ' + error.message);
    },
  });

  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: null });

  const handleDelete = (agent) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir agente',
      message: `Tem certeza que deseja excluir o agente "${agent.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => { deleteAgentMutation.mutate(agent.id); setConfirmDialog(prev => ({ ...prev, isOpen: false })); },
    });
  };

  const handleDeleteTeam = (team) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir time',
      message: `Tem certeza que deseja excluir o time "${team.name}"? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => { deleteTeamMutation.mutate(team.id); setConfirmDialog(prev => ({ ...prev, isOpen: false })); },
    });
  };

  const handleGenerateWhatsAppToken = async (agent) => {
    setSelectedAgentForWhatsApp(agent);
    setWhatsappDialogOpen(true);
    setGeneratingToken(true);
    setGeneratedTokenData(null);

    try {
      const response = await base44.functions.invoke('generateWhatsAppToken', {
        agent_id: agent.id,
        validity_days: 90
      });

      if (response.data.success) {
        setGeneratedTokenData(response.data);
        await queryClient.invalidateQueries({ queryKey: ['agents'] });
        toast.success('Token WhatsApp gerado com sucesso!');
      } else {
        toast.error(response.data.error || 'Erro ao gerar token');
      }
    } catch (error) {
      console.error('Erro ao gerar token:', error);
      toast.error('Erro ao gerar token: ' + error.message);
    }
    setGeneratingToken(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedUrl(true);
    toast.success('Link copiado para a área de transferência!');
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleResetPassword = async () => {
    if (!selectedAgentForReset || !newPassword) return;
    
    if (newPassword.length < 6) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    setResettingPassword(true);
    try {
      const response = await fetch(`/api/agents/${selectedAgentForReset.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ newPassword })
      });
      
      const result = await response.json();
      
      if (response.ok && result.success) {
        toast.success(`Senha do agente ${selectedAgentForReset.name} redefinida com sucesso!`);
        setResetPasswordDialogOpen(false);
        setSelectedAgentForReset(null);
        setNewPassword("");
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      } else {
        toast.error(result.message || 'Erro ao redefinir senha');
      }
    } catch (error) {
      console.error('Erro ao redefinir senha:', error);
      toast.error('Erro ao redefinir senha: ' + error.message);
    }
    setResettingPassword(false);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      cpf: "",
      photoUrl: "",
      email: "",
      password: "",
      agentType: "sales",
      teamId: "",
      supervisorId: isSupervisor ? (currentAgent?.id || "") : "",
      online: false,
      active: true,
      workingHours: { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      permissions: {
        can_view_all_leads: false,
        can_view_team_leads: false,
        can_access_reports: false,
        can_manage_agents: false,
        can_manage_settings: false,
      }
    });
    setEditingAgent(null);
  };

  const resetTeamForm = () => {
    setTeamFormData({ name: "", description: "", supervisorEmail: "", coordinatorId: "", active: true });
    setEditingTeam(null);
  };

  const resetTypeForm = () => {
    setTypeFormData({ key: "", label: "", description: "", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", modules: [], allowedSubmenus: [], active: true });
    setEditingType(null);
    setExpandedModulesInForm([]);
  };

  const handleEditType = (type) => {
    setEditingType(type);
    setTypeFormData({
      key: type.key || "",
      label: type.label || "",
      description: type.description || "",
      color: type.color || "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
      modules: type.modules || [],
      allowedSubmenus: type.allowedSubmenus || [],
      active: type.active !== false,
    });
    setExpandedModulesInForm(type.modules || []);
    setTypeDialogOpen(true);
  };

  const handleDeleteType = (type) => {
    const agentCount = agents.filter(a => a.agentType === type.key).length;
    if (agentCount > 0) {
      toast.error(`Não é possível excluir: ${agentCount} agente(s) usam este tipo.`);
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir tipo',
      message: `Tem certeza que deseja excluir o tipo "${type.label}"?`,
      confirmLabel: 'Excluir',
      variant: 'danger',
      onConfirm: () => { deleteTypeMutation.mutate(type.id); setConfirmDialog(prev => ({ ...prev, isOpen: false })); },
    });
  };

  const handleTypeSubmit = () => {
    if (editingType) {
      updateTypeMutation.mutate({
        id: editingType.id,
        data: typeFormData
      });
    } else {
      createTypeMutation.mutate(typeFormData);
    }
  };

  const normalizePermissions = (perms) => {
    const defaults = {
      can_view_all_leads: false,
      can_view_team_leads: false,
      can_access_reports: false,
      can_manage_agents: false,
      can_manage_settings: false,
    };
    
    if (!perms) return defaults;
    
    let parsed = perms;
    if (typeof perms === 'string') {
      try {
        parsed = JSON.parse(perms);
      } catch {
        return defaults;
      }
    }
    
    return { ...defaults, ...parsed };
  };

  const handleEdit = (agent) => {
    setEditingAgent(agent);
    setFormData({
      name: agent.name || "",
      cpf: agent.cpf || "",
      photoUrl: agent.photoUrl || "",
      email: agent.email || "",
      password: "",
      agentType: agent.agentType || "sales",
      teamId: agent.teamId || "",
      supervisorId: agent.supervisorId || agent.supervisor_id || "",
      online: agent.online || false,
      active: agent.active !== undefined ? agent.active : true,
      workingHours: agent.workingHours || { start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5] },
      permissions: normalizePermissions(agent.permissions)
    });
    setIsDialogOpen(true);
  };

  const handleEditTeam = (team) => {
    setEditingTeam(team);
    setTeamFormData({
      name: team.name || "",
      description: team.description || "",
      supervisorEmail: team.supervisorEmail || "",
      supervisorId: team.supervisorId || team.supervisor_id || "",
      coordinatorId: team.coordinatorId || team.coordinator_id || "",
      active: team.active !== undefined ? team.active : true,
    });
    setTeamDialogOpen(true);
  };

  const formatCPF = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    }
    return value;
  };

  const handleCpfChange = (e) => {
    const formatted = formatCPF(e.target.value);
    setFormData({...formData, cpf: formatted});
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo 5MB.');
      return;
    }
    
    setUploadingPhoto(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: formDataUpload
      });
      
      const result = await response.json();
      
      if (response.ok && result.url) {
        setFormData(prev => ({...prev, photoUrl: result.url}));
        toast.success('Foto carregada com sucesso!');
      } else {
        toast.error(result.message || 'Erro ao fazer upload');
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error('Erro ao fazer upload da foto');
    }
    setUploadingPhoto(false);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.email || !formData.agentType) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    if (!editingAgent && (!formData.password || formData.password.length < 6)) {
      toast.error('A senha deve ter pelo menos 6 caracteres');
      return;
    }

    const originalPerms = editingAgent?.permissions ? (typeof editingAgent.permissions === 'string' ? (() => { try { return JSON.parse(editingAgent.permissions); } catch { return {}; } })() : editingAgent.permissions) : {};
    const dataToSend = { 
      ...formData,
      permissions: { ...originalPerms, ...formData.permissions }
    };

    if (isSupervisor) {
      if (supervisorTeamId) {
        dataToSend.teamId = supervisorTeamId;
      }
      dataToSend.supervisorId = currentAgent?.id;
    }
    
    if (editingAgent) {
      if (!dataToSend.password) {
        delete dataToSend.password;
      }
      updateAgentMutation.mutate({
        id: editingAgent.id,
        data: dataToSend
      });
    } else {
      createAgentMutation.mutate(dataToSend);
    }
  };

  const handleTeamSubmit = () => {
    const submitData = {
      ...teamFormData,
      supervisorId: teamFormData.supervisorId === "none" ? null : teamFormData.supervisorId || null,
      coordinatorId: teamFormData.coordinatorId === "none" ? null : teamFormData.coordinatorId || null,
    };
    if (editingTeam) {
      updateTeamMutation.mutate({
        id: editingTeam.id,
        data: submitData
      });
    } else {
      createTeamMutation.mutate(submitData);
    }
  };

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team?.name || '-';
  };

  const getAgentCountByTeam = (teamId) => {
    return agents.filter(a => a.teamId === teamId).length;
  };

  const getAgentTypeBadge = (type) => {
    const dbType = agentTypes.find(t => t.key === type);
    if (dbType) {
      return { label: dbType.label, color: dbType.color, description: dbType.description };
    }
    return AGENT_TYPE_CONFIG[type] || { label: type || "Vendedor", color: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" };
  };

  if (!hasPermission) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <Card className="max-w-md bg-white dark:bg-gray-900">
          <CardContent className="p-8 text-center">
            <ShieldX className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Acesso Restrito</h2>
            <p className="text-gray-600 dark:text-gray-400">
              Você não tem permissão para acessar a gestão de agentes.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: BURGUNDY }}>Equipe de Vendas</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Gerencie vendedores, times e perfis de acesso
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-1">
          <TabsTrigger value="agents" className="data-[state=active]:text-white" style={activeTab === 'agents' ? { backgroundColor: BURGUNDY } : {}}>
            <Users className="w-4 h-4 mr-2" />
            Vendedores
          </TabsTrigger>
          {!isSupervisor && (
            <TabsTrigger value="teams" className="data-[state=active]:text-white" style={activeTab === 'teams' ? { backgroundColor: BURGUNDY } : {}}>
              <Building2 className="w-4 h-4 mr-2" />
              Times
            </TabsTrigger>
          )}
          {!isSupervisor && (
            <TabsTrigger value="types" className="data-[state=active]:text-white" style={activeTab === 'types' ? { backgroundColor: BURGUNDY } : {}}>
              <Layers className="w-4 h-4 mr-2" />
              Perfis de Acesso
            </TabsTrigger>
          )}
        </TabsList>

        {/* ===== ABA VENDEDORES ===== */}
        <TabsContent value="agents" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <p className="text-sm text-gray-500">{(isSupervisor ? agents.filter(a => (a.supervisorId || a.supervisor_id) === currentAgent?.id) : agents).length} vendedor(es) cadastrado(s)</p>
            <Button 
              onClick={() => {
                resetForm();
                setIsDialogOpen(true);
              }}
              style={{ backgroundColor: BURGUNDY }}
              className="text-white hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Vendedor
            </Button>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(isSupervisor ? agents.filter(a => (a.supervisorId || a.supervisor_id) === currentAgent?.id) : agents).map(agent => {
              const typeBadge = getAgentTypeBadge(agent.agentType);
              const hasWhatsAppToken = !!agent.whatsappAccessToken;
              const tokenExpired = agent.whatsappTokenExpiresAt && new Date(agent.whatsappTokenExpiresAt) < new Date();
              
              return (
                <Card key={agent.id} className={`border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:shadow-md transition-shadow ${!agent.active ? 'opacity-60' : ''}`}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          {agent.photoUrl ? (
                            <img 
                              src={agent.photoUrl} 
                              alt={agent.name}
                              className="w-12 h-12 rounded-full object-cover"
                              style={{ boxShadow: `0 0 0 2px ${CORAL}30` }}
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: BURGUNDY }}>
                              <span className="text-white font-semibold text-lg">
                                {agent.name?.charAt(0)?.toUpperCase() || 'A'}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base text-gray-900 dark:text-gray-100 truncate">{agent.name}</CardTitle>
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{agent.email}</p>
                        </div>
                      </div>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800">
                            <MoreVertical className="w-4 h-4 text-gray-500" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => handleEdit(agent)} className="cursor-pointer">
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleGenerateWhatsAppToken(agent)} className="cursor-pointer">
                            <MessageSquare className="w-4 h-4 mr-2 text-green-600" />
                            {hasWhatsAppToken ? 'Renovar WhatsApp' : 'Gerar Link WhatsApp'}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => {
                              setSelectedAgentForReset(agent);
                              setNewPassword("");
                              setResetPasswordDialogOpen(true);
                            }} 
                            className="cursor-pointer"
                          >
                            <KeyRound className="w-4 h-4 mr-2 text-orange-600" />
                            Redefinir Senha
                          </DropdownMenuItem>
                          {isAdmin && gcalConnectedSet.has(agent.id) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleRevokeGcal(agent)}
                                className="cursor-pointer text-amber-700 focus:text-amber-700 focus:bg-amber-50 dark:focus:bg-amber-950"
                              >
                                <Unlink className="w-4 h-4 mr-2" />
                                Revogar Google Calendar
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(agent)} className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-950">
                            <Trash2 className="w-4 h-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge className={typeBadge.color}>{typeBadge.label}</Badge>
                        {!agent.active && (
                          <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Inativo</Badge>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-600 dark:text-gray-400">{getTeamName(agent.teamId)}</span>
                        </div>
                        {(agent.supervisorId || agent.supervisor_id) && (
                          <div className="flex items-center gap-2">
                            <UserCheck className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400">
                              Sup: {agents.find(a => a.id === (agent.supervisorId || agent.supervisor_id))?.name || '-'}
                            </span>
                          </div>
                        )}
                        {agent.workingHours && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400">
                              {agent.workingHours.start || '08:00'} - {agent.workingHours.end || '18:00'}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {hasWhatsAppToken && (
                        <div className="flex items-center gap-2 pt-2">
                          <MessageSquare className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span className={`text-xs ${tokenExpired ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            WhatsApp {tokenExpired ? 'Expirado' : 'Ativo'}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ===== ABA TIMES ===== */}
        <TabsContent value="teams" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <p className="text-sm text-gray-500">{teams.length} time(s) cadastrado(s)</p>
            <Button 
              onClick={() => {
                resetTeamForm();
                setTeamDialogOpen(true);
              }}
              style={{ backgroundColor: BURGUNDY }}
              className="text-white hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Time
            </Button>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teams.map(team => (
              <Card key={team.id} className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow ${!team.active ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BURGUNDY}15` }}>
                        <Building2 className="w-5 h-5" style={{ color: BURGUNDY }} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">{team.name}</h3>
                        {team.description && (
                          <p className="text-xs text-gray-500 line-clamp-1">{team.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditTeam(team)}>
                        <Edit className="w-4 h-4 text-gray-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteTeam(team)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{getAgentCountByTeam(team.id)} vendedores</span>
                      </div>
                      {!team.active && <Badge variant="outline">Inativo</Badge>}
                    </div>
                    {(team.coordinatorId || team.coordinator_id) && (() => {
                      const coord = agents?.find(a => a.id === (team.coordinatorId || team.coordinator_id));
                      return coord ? (
                        <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
                          <ShieldX className="w-3.5 h-3.5" />
                          <span>Coord: {coord.name}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ===== ABA PERFIS DE ACESSO ===== */}
        <TabsContent value="types" className="mt-6">
          <div className="flex justify-between items-center mb-6">
            <p className="text-sm text-gray-500">{agentTypes.length} perfil(s) cadastrado(s)</p>
            <Button 
              onClick={() => {
                resetTypeForm();
                setTypeDialogOpen(true);
              }}
              style={{ backgroundColor: BURGUNDY }}
              className="text-white hover:opacity-90"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Perfil
            </Button>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agentTypes.map(type => {
              const agentCount = agents.filter(a => a.agentType === type.key).length;
              return (
                <Card key={type.id} className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-md transition-shadow ${!type.active ? 'opacity-60' : ''}`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <Badge className={type.color || "bg-gray-100 text-gray-700"}>{type.label}</Badge>
                        <p className="text-xs text-gray-500 mt-1">{type.key}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditType(type)}>
                          <Edit className="w-4 h-4 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDeleteType(type)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                    {type.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{type.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4" />
                        <span>{agentCount} vendedor(es)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Layers className="w-4 h-4" />
                        <span>{type.allowedSubmenus?.length || 0} telas</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog WhatsApp Token */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <MessageSquare className="w-5 h-5 text-green-600 dark:text-green-400" />
              Link de Acesso WhatsApp
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {generatingToken ? (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4" style={{ color: CORAL }} />
                <p className="text-gray-600 dark:text-gray-400">Gerando token de acesso...</p>
              </div>
            ) : generatedTokenData ? (
              <>
                <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
                  <MessageSquare className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <AlertDescription className="text-green-800 dark:text-green-300">
                    <strong>Link gerado com sucesso!</strong>
                    <p className="text-sm mt-1">
                      Configure este link no seu plugin de WhatsApp para permitir que <strong>{selectedAgentForWhatsApp?.name}</strong> acesse o CRM.
                    </p>
                  </AlertDescription>
                </Alert>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100 mb-2 block">URL do Quick Action:</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={generatedTokenData.quickActionUrl || ''} 
                      readOnly 
                      className="font-mono text-xs bg-gray-50 dark:bg-gray-800"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => copyToClipboard(generatedTokenData.quickActionUrl)}
                    >
                      {copiedUrl ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-sm">
                  <p className="font-medium text-gray-900 dark:text-gray-100 mb-2">Instruções:</p>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 dark:text-gray-400">
                    <li>Copie o link acima</li>
                    <li>Acesse as configurações do seu plugin de WhatsApp</li>
                    <li>Cole o link no campo de Quick Action</li>
                    <li>O vendedor poderá criar Leads direto do WhatsApp</li>
                    <li>O token expira automaticamente em 90 dias</li>
                  </ol>
                </div>
              </>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">Ocorreu um erro ao gerar o token.</p>
            )}
          </div>

          <DialogFooter>
            <Button 
              onClick={() => {
                setWhatsappDialogOpen(false);
                setGeneratedTokenData(null);
                setCopiedUrl(false);
              }}
            >
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Reset Password */}
      <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <KeyRound className="w-5 h-5" style={{ color: CORAL }} />
              Redefinir Senha
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <Alert style={{ backgroundColor: `${CORAL}15`, borderColor: `${CORAL}40` }}>
              <KeyRound className="w-4 h-4" style={{ color: CORAL }} />
              <AlertDescription style={{ color: BURGUNDY }}>
                <p className="text-sm">
                  Você está redefinindo a senha de <strong>{selectedAgentForReset?.name}</strong>.
                </p>
              </AlertDescription>
            </Alert>

            <div>
              <Label className="text-gray-900 dark:text-gray-100 mb-2 block">Nova Senha</Label>
              <Input 
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Digite a nova senha (mín. 6 caracteres)"
                className="bg-white dark:bg-gray-800"
              />
              <p className="text-xs text-gray-500 mt-1">A senha deve ter pelo menos 6 caracteres</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button 
              variant="outline"
              onClick={() => {
                setResetPasswordDialogOpen(false);
                setSelectedAgentForReset(null);
                setNewPassword("");
              }}
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleResetPassword}
              disabled={resettingPassword || !newPassword || newPassword.length < 6}
              style={{ backgroundColor: CORAL }}
              className="text-white hover:opacity-90"
            >
              {resettingPassword ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Redefinindo...
                </>
              ) : (
                'Redefinir Senha'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sheet Criar/Editar Vendedor */}
      <Sheet open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl md:max-w-2xl bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800" style={{ background: `linear-gradient(135deg, ${BURGUNDY}10, ${CORAL}10)` }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${BURGUNDY}15` }}>
                <Users className="w-6 h-6" style={{ color: BURGUNDY }} />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingAgent ? 'Editar Vendedor' : 'Novo Vendedor'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Informações, acesso e permissões do vendedor
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6">
            <div className="space-y-5 py-5">
              {/* Upload de Foto */}
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                {formData.photoUrl ? (
                  <img 
                    src={formData.photoUrl} 
                    alt="Foto do vendedor"
                    className="w-16 h-16 rounded-full object-cover"
                    style={{ border: `2px solid ${CORAL}` }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: BURGUNDY, border: `2px solid ${CORAL}` }}>
                    <span className="text-2xl font-bold text-white">
                      {formData.name?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
                <div className="flex-1">
                  <Label className="text-gray-900 dark:text-gray-100">Foto</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto}
                      id="photo-upload"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('photo-upload').click()}
                      disabled={uploadingPhoto}
                    >
                      {uploadingPhoto ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Carregando...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload
                        </>
                      )}
                    </Button>
                    {formData.photoUrl && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setFormData({...formData, photoUrl: ""})}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-gray-900 dark:text-gray-100">Nome Completo *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Nome completo do vendedor"
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">CPF</Label>
                  <Input
                    value={formData.cpf}
                    onChange={handleCpfChange}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Email (Login) *</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    placeholder="email@exemplo.com"
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">
                    {editingAgent ? 'Nova Senha (deixe vazio para manter)' : 'Senha *'}
                  </Label>
                  <Input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    placeholder={editingAgent ? "••••••••" : "Defina uma senha"}
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                  />
                  {!editingAgent && (
                    <p className="text-xs text-gray-500 mt-1">Mínimo 6 caracteres</p>
                  )}
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Perfil *</Label>
                  <Select value={formData.agentType} onValueChange={(val) => setFormData({...formData, agentType: val})}>
                    <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {agentTypes.filter(t => t.active).length > 0 ? (
                        agentTypes.filter(t => t.active).map((type) => {
                          if (!isAdmin && currentAgentType === 'coordinator' && type.key === 'admin') return null;
                          if (isSupervisor && ['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(type.key)) return null;
                          return <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>;
                        })
                      ) : (
                        AGENT_TYPE_OPTIONS.filter(type => {
                          if (!isAdmin && currentAgentType === 'coordinator' && type.key === 'admin') return false;
                          if (isSupervisor && ['admin', 'coordinator', 'supervisor', 'sales_supervisor'].includes(type.key)) return false;
                          return true;
                        }).map((type) => (
                          <SelectItem key={type.key} value={type.key}>{type.label}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Time</Label>
                  {isSupervisor ? (
                    <Input
                      value={teams.find(t => t.id === supervisorTeamId)?.name || "Meu Time"}
                      disabled
                      className="bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  ) : (
                    <Select value={formData.teamId} onValueChange={(val) => setFormData({...formData, teamId: val})}>
                      <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <SelectValue placeholder="Selecione o time (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map(team => (
                          <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {formData.agentType === 'sales' && (
                  <div>
                    <Label className="text-gray-900 dark:text-gray-100">Supervisor</Label>
                    {isSupervisor ? (
                      <Input
                        value={currentAgent?.name || "Eu (Supervisor)"}
                        disabled
                        className="bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <Select value={formData.supervisorId} onValueChange={(val) => setFormData({...formData, supervisorId: val === "none" ? "" : val})}>
                        <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <SelectValue placeholder="Selecione o supervisor (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum</SelectItem>
                          {agents.filter(a => isSupervisorType(a.agentType)).map(sup => (
                            <SelectItem key={sup.id} value={sup.id}>{sup.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* Horário de Trabalho */}
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <Label className="text-gray-900 dark:text-gray-100 font-medium">Horário de Trabalho</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500">Início</Label>
                    <Input
                      type="time"
                      value={formData.workingHours?.start || "08:00"}
                      onChange={(e) => setFormData({
                        ...formData, 
                        workingHours: {...formData.workingHours, start: e.target.value}
                      })}
                      className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Fim</Label>
                    <Input
                      type="time"
                      value={formData.workingHours?.end || "18:00"}
                      onChange={(e) => setFormData({
                        ...formData, 
                        workingHours: {...formData.workingHours, end: e.target.value}
                      })}
                      className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-gray-500 mb-2 block">Dias de Trabalho</Label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: 0, label: 'Dom' },
                      { value: 1, label: 'Seg' },
                      { value: 2, label: 'Ter' },
                      { value: 3, label: 'Qua' },
                      { value: 4, label: 'Qui' },
                      { value: 5, label: 'Sex' },
                      { value: 6, label: 'Sáb' },
                    ].map(day => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={(formData.workingHours?.days || []).includes(day.value) ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          const days = formData.workingHours?.days || [];
                          if (days.includes(day.value)) {
                            setFormData({
                              ...formData,
                              workingHours: {...formData.workingHours, days: days.filter(d => d !== day.value)}
                            });
                          } else {
                            setFormData({
                              ...formData,
                              workingHours: {...formData.workingHours, days: [...days, day.value].sort()}
                            });
                          }
                        }}
                        style={(formData.workingHours?.days || []).includes(day.value) ? { backgroundColor: BURGUNDY } : {}}
                      >
                        {day.label}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Permissões */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" style={{ color: BURGUNDY }} />
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Permissões</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 rounded-xl border" style={{ borderColor: `${BURGUNDY}20`, backgroundColor: `${BURGUNDY}05` }}>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_view_all_leads ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Todos os leads</span>
                      <p className="text-xs text-gray-500">Ver leads de todos os vendedores</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_view_all_leads || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_view_all_leads: val}
                      })}
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_view_team_leads ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Leads do time</span>
                      <p className="text-xs text-gray-500">Ver leads do seu time</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_view_team_leads || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_view_team_leads: val}
                      })}
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_access_reports ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Relatórios</span>
                      <p className="text-xs text-gray-500">Dashboards e relatórios</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_access_reports || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_access_reports: val}
                      })}
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    formData.permissions?.can_manage_agents ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Gerenciar equipe</span>
                      <p className="text-xs text-gray-500">Criar, editar e excluir vendedores</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_manage_agents || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_manage_agents: val}
                      })}
                    />
                  </label>
                  <label className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors col-span-1 sm:col-span-2 ${
                    formData.permissions?.can_manage_settings ? 'bg-white dark:bg-gray-800 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-gray-800/50'
                  }`}>
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Configurações</span>
                      <p className="text-xs text-gray-500">Alterar configurações do sistema</p>
                    </div>
                    <Switch
                      checked={formData.permissions?.can_manage_settings || false}
                      onCheckedChange={(val) => setFormData({
                        ...formData, 
                        permissions: {...formData.permissions, can_manage_settings: val}
                      })}
                    />
                  </label>
                </div>
              </div>

              {/* Toggle Ativo */}
              <label className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all cursor-pointer ${
                formData.active 
                  ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30' 
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${formData.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">Ativo</span>
                    <span className="text-xs text-gray-500 ml-2">({formData.active ? 'Sim' : 'Não'})</span>
                  </div>
                </div>
                <Switch
                  checked={formData.active}
                  onCheckedChange={(val) => setFormData({...formData, active: val})}
                />
              </label>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleSubmit}
                disabled={!formData.name || !formData.email || !formData.agentType || (!editingAgent && (!formData.password || formData.password.length < 6))}
                className="flex-1 text-white hover:opacity-90"
                style={{ backgroundColor: BURGUNDY }}
              >
                {editingAgent ? 'Salvar Alterações' : 'Criar Vendedor'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sheet Criar/Editar Time */}
      <Sheet open={teamDialogOpen} onOpenChange={setTeamDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800" style={{ background: `linear-gradient(135deg, ${BURGUNDY}10, ${CORAL}10)` }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${BURGUNDY}15` }}>
                <Building2 className="w-6 h-6" style={{ color: BURGUNDY }} />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingTeam ? 'Editar Time' : 'Novo Time'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Agrupe vendedores para gestão e relatórios
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Nome do Time *</Label>
              <Input
                value={teamFormData.name}
                onChange={(e) => setTeamFormData({...teamFormData, name: e.target.value})}
                placeholder="Ex: Equipe Vendas SP"
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Descrição</Label>
              <Textarea
                value={teamFormData.description}
                onChange={(e) => setTeamFormData({...teamFormData, description: e.target.value})}
                placeholder="Descreva as responsabilidades e área de atuação do time..."
                className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Supervisor</Label>
              <Select 
                value={teamFormData.supervisorId} 
                onValueChange={(val) => {
                  const selectedAgent = agents?.find(a => a.id === val);
                  setTeamFormData({
                    ...teamFormData, 
                    supervisorId: val,
                    supervisorEmail: selectedAgent?.email || teamFormData.supervisorEmail
                  });
                }}
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-11">
                  <SelectValue placeholder="Selecione o supervisor do time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {agents?.filter(a => isSupervisorType(a.agentType) || a.agentType === 'admin').map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ backgroundColor: BURGUNDY }}>
                          {agent.name?.charAt(0).toUpperCase()}
                        </div>
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">O supervisor gerencia os agentes e dados do time</p>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-900 dark:text-gray-100 font-medium">Coordenador</Label>
              <Select 
                value={teamFormData.coordinatorId} 
                onValueChange={(val) => setTeamFormData({...teamFormData, coordinatorId: val})}
              >
                <SelectTrigger className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 h-11">
                  <SelectValue placeholder="Selecione o coordenador do time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {agents?.filter(a => a.agentType === 'coordinator' || a.agentType === 'admin').map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white" style={{ backgroundColor: BURGUNDY }}>
                          {agent.name?.charAt(0).toUpperCase()}
                        </div>
                        {agent.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">O coordenador tem visibilidade total e gerencia os times atribuídos a ele</p>
            </div>

            {editingTeam && (
              <div className="rounded-xl p-4 border" style={{ backgroundColor: `${BURGUNDY}05`, borderColor: `${BURGUNDY}20` }}>
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4" style={{ color: BURGUNDY }} />
                  <span className="text-sm font-medium" style={{ color: BURGUNDY }}>Membros do Time</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {agents?.filter(a => a.teamId === editingTeam.id).length > 0 ? (
                    agents?.filter(a => a.teamId === editingTeam.id).map(agent => (
                      <Badge key={agent.id} variant="outline" className="bg-white dark:bg-gray-800">
                        {agent.name}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">Nenhum vendedor neste time ainda</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${teamFormData.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                <div>
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Status do Time</Label>
                  <p className="text-xs text-gray-500">{teamFormData.active ? 'Ativo e operacional' : 'Inativo'}</p>
                </div>
              </div>
              <Switch
                checked={teamFormData.active}
                onCheckedChange={(val) => setTeamFormData({...teamFormData, active: val})}
              />
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setTeamDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleTeamSubmit}
                disabled={!teamFormData.name}
                className="flex-1 text-white hover:opacity-90"
                style={{ backgroundColor: BURGUNDY }}
              >
                {editingTeam ? 'Salvar Alterações' : 'Criar Time'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Sheet Criar/Editar Perfil de Acesso */}
      <Sheet open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl bg-white dark:bg-gray-900 p-0 flex flex-col">
          <SheetHeader className="px-6 py-5 border-b border-gray-200 dark:border-gray-800" style={{ background: `linear-gradient(135deg, ${BURGUNDY}10, ${CORAL}10)` }}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${BURGUNDY}15` }}>
                <Layers className="w-6 h-6" style={{ color: BURGUNDY }} />
              </div>
              <div>
                <SheetTitle className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {editingType ? 'Editar Perfil' : 'Novo Perfil de Acesso'}
                </SheetTitle>
                <SheetDescription className="text-gray-500 dark:text-gray-400">
                  Configure quais telas este perfil pode acessar
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-4 border-b border-gray-200 dark:border-gray-800">
              <TabsList className="w-full grid grid-cols-3 h-10">
                <TabsTrigger value="info" className="text-sm">Informações</TabsTrigger>
                <TabsTrigger value="access" className="text-sm">Acessos</TabsTrigger>
                <TabsTrigger value="preview" className="text-sm">Preview</TabsTrigger>
              </TabsList>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              <TabsContent value="info" className="p-6 space-y-6 mt-0">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-gray-100 font-medium">Chave (identificador) *</Label>
                    <Input
                      value={typeFormData.key}
                      onChange={(e) => setTypeFormData({...typeFormData, key: e.target.value.toLowerCase().replace(/\s/g, '_')})}
                      placeholder="Ex: vendedor_jr"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      disabled={!!editingType}
                    />
                    <p className="text-xs text-gray-500">Identificador único, sem espaços</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-gray-900 dark:text-gray-100 font-medium">Nome de Exibição *</Label>
                    <Input
                      value={typeFormData.label}
                      onChange={(e) => setTypeFormData({...typeFormData, label: e.target.value})}
                      placeholder="Ex: Vendedor Junior"
                      className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Descrição</Label>
                  <Textarea
                    value={typeFormData.description}
                    onChange={(e) => setTypeFormData({...typeFormData, description: e.target.value})}
                    placeholder="Descreva as responsabilidades deste perfil..."
                    className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    rows={3}
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-gray-900 dark:text-gray-100 font-medium">Cor do Badge</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", label: "Cinza", color: "bg-gray-400" },
                      { value: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300", label: "Azul", color: "bg-blue-500" },
                      { value: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300", label: "Verde", color: "bg-green-500" },
                      { value: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300", label: "Roxo", color: "bg-purple-500" },
                      { value: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300", label: "Laranja", color: "bg-orange-500" },
                      { value: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", label: "Vermelho", color: "bg-red-500" },
                      { value: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300", label: "Indigo", color: "bg-indigo-500" },
                      { value: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300", label: "Rosa", color: "bg-pink-500" },
                      { value: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300", label: "Amarelo", color: "bg-yellow-500" },
                    ].map((colorOption) => (
                      <button
                        key={colorOption.value}
                        type="button"
                        onClick={() => setTypeFormData({...typeFormData, color: colorOption.value})}
                        className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                          typeFormData.color === colorOption.value 
                            ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800' 
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full ${colorOption.color}`} />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{colorOption.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${typeFormData.active ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <div>
                      <Label className="text-gray-900 dark:text-gray-100 font-medium">Status do Perfil</Label>
                      <p className="text-xs text-gray-500">{typeFormData.active ? 'Ativo' : 'Inativo'}</p>
                    </div>
                  </div>
                  <Switch
                    checked={typeFormData.active}
                    onCheckedChange={(val) => setTypeFormData({...typeFormData, active: val})}
                  />
                </div>
              </TabsContent>

              <TabsContent value="access" className="p-6 space-y-4 mt-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Módulos e Telas</h3>
                    <p className="text-xs text-gray-500">Selecione as telas que este perfil pode acessar</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {typeFormData.allowedSubmenus?.length || 0} telas
                  </Badge>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (typeFormData.modules?.includes('all')) {
                        setTypeFormData({...typeFormData, modules: [], allowedSubmenus: []});
                        setExpandedModulesInForm([]);
                      } else {
                        const allModuleIds = MENU_MODULES.map(m => m.id);
                        const allSubmenus = MENU_MODULES.flatMap(m => m.items.map(i => i.id));
                        setTypeFormData({
                          ...typeFormData, 
                          modules: ['all', ...allModuleIds],
                          allowedSubmenus: allSubmenus
                        });
                        setExpandedModulesInForm(allModuleIds);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      typeFormData.modules?.includes('all')
                        ? 'bg-green-50 dark:bg-green-950/30'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    style={typeFormData.modules?.includes('all') ? { borderColor: BURGUNDY } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${BURGUNDY}15` }}>
                        <Settings className="w-5 h-5" style={{ color: BURGUNDY }} />
                      </div>
                      <div className="text-left">
                        <span className="font-medium text-gray-900 dark:text-gray-100">Acesso Total</span>
                        <p className="text-xs text-gray-500">Acesso a todas as telas do sistema</p>
                      </div>
                    </div>
                    {typeFormData.modules?.includes('all') && (
                      <Check className="w-5 h-5" style={{ color: BURGUNDY }} />
                    )}
                  </button>

                  <div className="grid gap-2">
                    {MENU_MODULES.map((menuModule) => {
                      const isModuleSelected = typeFormData.modules?.includes(menuModule.id);
                      const isExpanded = expandedModulesInForm.includes(menuModule.id);
                      const selectedSubmenusCount = menuModule.items.filter(item => 
                        typeFormData.allowedSubmenus?.includes(item.id)
                      ).length;
                      const allSelected = selectedSubmenusCount === menuModule.items.length;

                      return (
                        <div key={menuModule.id} className={`rounded-xl border-2 overflow-hidden transition-all ${
                          isModuleSelected 
                            ? 'border-gray-300 dark:border-gray-600' 
                            : 'border-gray-200 dark:border-gray-700'
                        }`}>
                          <div 
                            className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                              isModuleSelected 
                                ? 'bg-gray-50 dark:bg-gray-800/50' 
                                : 'bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                            onClick={() => {
                              if (isExpanded) {
                                setExpandedModulesInForm(prev => prev.filter(m => m !== menuModule.id));
                              } else {
                                setExpandedModulesInForm(prev => [...prev, menuModule.id]);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={isModuleSelected}
                                onClick={(e) => e.stopPropagation()}
                                onCheckedChange={(checked) => {
                                  const modules = typeFormData.modules || [];
                                  const submenus = typeFormData.allowedSubmenus || [];
                                  const moduleSubmenus = menuModule.items.map(i => i.id);
                                  
                                  if (checked) {
                                    setTypeFormData({
                                      ...typeFormData, 
                                      modules: [...modules, menuModule.id],
                                      allowedSubmenus: [...submenus, ...moduleSubmenus]
                                    });
                                    setExpandedModulesInForm(prev => [...prev, menuModule.id]);
                                  } else {
                                    setTypeFormData({
                                      ...typeFormData, 
                                      modules: modules.filter(m => m !== menuModule.id && m !== 'all'),
                                      allowedSubmenus: submenus.filter(s => !moduleSubmenus.includes(s))
                                    });
                                  }
                                }}
                              />
                              <span className="font-medium text-gray-900 dark:text-gray-100">{menuModule.title}</span>
                              {isModuleSelected && (
                                <Badge className={`text-xs ${
                                  allSelected 
                                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300' 
                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300'
                                }`}>
                                  {selectedSubmenusCount}/{menuModule.items.length}
                                </Badge>
                              )}
                            </div>
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </div>
                          
                          {isExpanded && (
                            <div className="p-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                              <div className="grid grid-cols-2 gap-2">
                                {menuModule.items.map((item) => {
                                  const isSelected = typeFormData.allowedSubmenus?.includes(item.id);
                                  return (
                                    <label
                                      key={item.id}
                                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                        isSelected 
                                          ? 'bg-gray-50 dark:bg-gray-800' 
                                          : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                      }`}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={(checked) => {
                                          const submenus = typeFormData.allowedSubmenus || [];
                                          const modules = typeFormData.modules || [];
                                          
                                          if (checked) {
                                            const newSubmenus = [...submenus, item.id];
                                            const newModules = modules.includes(menuModule.id) ? modules : [...modules, menuModule.id];
                                            setTypeFormData({
                                              ...typeFormData, 
                                              allowedSubmenus: newSubmenus,
                                              modules: newModules
                                            });
                                          } else {
                                            const newSubmenus = submenus.filter(s => s !== item.id);
                                            const remainingModuleSubmenus = menuModule.items.filter(i => newSubmenus.includes(i.id));
                                            const newModules = remainingModuleSubmenus.length === 0 
                                              ? modules.filter(m => m !== menuModule.id && m !== 'all')
                                              : modules.filter(m => m !== 'all');
                                            setTypeFormData({
                                              ...typeFormData, 
                                              allowedSubmenus: newSubmenus,
                                              modules: newModules
                                            });
                                          }
                                        }}
                                      />
                                      <span className={`text-sm ${
                                        isSelected 
                                          ? 'text-gray-900 dark:text-gray-100 font-medium' 
                                          : 'text-gray-600 dark:text-gray-400'
                                      }`}>
                                        {item.title}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="p-6 space-y-4 mt-0">
                <div className="rounded-xl p-4 border" style={{ backgroundColor: `${BURGUNDY}05`, borderColor: `${BURGUNDY}20` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge className={typeFormData.color || "bg-gray-100 text-gray-700"}>
                      {typeFormData.label || "Nome do Perfil"}
                    </Badge>
                    <span className="text-xs text-gray-500">({typeFormData.key || "chave"})</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {typeFormData.description || "Sem descrição"}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Menu que será exibido:</h4>
                  <div className="rounded-xl p-4 space-y-2 max-h-[400px] overflow-y-auto" style={{ backgroundColor: BURGUNDY }}>
                    {MENU_MODULES.filter(mod => typeFormData.modules?.includes(mod.id) || typeFormData.modules?.includes('all')).map((mod) => {
                      const visibleItems = mod.items.filter(item => typeFormData.allowedSubmenus?.includes(item.id));
                      if (visibleItems.length === 0) return null;
                      
                      return (
                        <div key={mod.id} className="space-y-1">
                          <div className="text-xs uppercase tracking-wider px-2" style={{ color: `${CORAL}` }}>{mod.title}</div>
                          {visibleItems.map((item) => (
                            <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-lg text-gray-200 text-sm" style={{ backgroundColor: `${BURGUNDY}ee` }}>
                              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: CORAL }} />
                              {item.title}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {(!typeFormData.modules || typeFormData.modules.length === 0) && (
                      <div className="text-center py-8 text-gray-400">
                        <ShieldX className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhum módulo selecionado</p>
                        <p className="text-xs">Vá para a aba "Acessos" para configurar</p>
                      </div>
                    )}
                  </div>
                </div>

                <Alert style={{ backgroundColor: `${CORAL}15`, borderColor: `${CORAL}40` }}>
                  <Activity className="w-5 h-5" style={{ color: CORAL }} />
                  <AlertDescription>
                    <h4 className="text-sm font-medium" style={{ color: BURGUNDY }}>Importante</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      Alterações nas permissões só terão efeito após o vendedor fazer login novamente.
                    </p>
                  </AlertDescription>
                </Alert>
              </TabsContent>
            </div>
          </Tabs>

          <SheetFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex w-full gap-3">
              <Button variant="outline" onClick={() => setTypeDialogOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button 
                onClick={handleTypeSubmit}
                disabled={!typeFormData.key || !typeFormData.label}
                className="flex-1 text-white hover:opacity-90"
                style={{ backgroundColor: BURGUNDY }}
              >
                {editingType ? 'Salvar Alterações' : 'Criar Perfil'}
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
