import { useState, useRef, useMemo } from "react";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Pencil,
  StickyNote,
  X,
  Upload,
  Image as ImageIcon,
  Shield,
  History,
  ChevronsUpDown,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";

import LeadPJTimeline from "@/components/sales/LeadPJTimeline";
import LeadPJPipelineHistory from "@/components/sales/LeadPJPipelineHistory";
import LeadPJAgentHistory from "@/components/sales/LeadPJAgentHistory";
import { buildManualTemperature, normalizeManualTemperature } from "@/components/utils/temperature";
import TemperatureBadge from "@/components/sales/TemperatureBadge";
import { Thermometer } from "lucide-react";

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

// Task #67 — espelha os defaults de QuickLeadPJForm para a edição
// no detail também sobreviver a um system_settings vazio/ausente.
const DEFAULT_SOURCE_OPTIONS_PJ = [
  "Prospecção Ativa",
  "Indicação",
  "Site",
  "LinkedIn",
  "Google Ads",
  "Evento / Feira",
  "Parceiro",
  "Inbound Marketing",
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
  const [newProposalNote, setNewProposalNote] = useState("");
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [newItem, setNewItem] = useState({ descricao: "", quantidade: "1", valorUnitario: "", productId: "" });
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemDraft, setEditingItemDraft] = useState({ descricao: "", quantidade: "", valorUnitario: "", productId: "" });
  const fileInputRef = useRef(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [reassignAgentId, setReassignAgentId] = useState("");
  const [transferPendingActivities, setTransferPendingActivities] = useState(true);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: systemSettings = [] } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    staleTime: 1000 * 30,
    refetchOnMount: 'always',
  });

  // Task #67 — leitura defensiva das opções salvas em system_settings:
  //  - se o setting não existir ou estiver malformado/vazio (`'[]'`),
  //    cai pros defaults para o dropdown nunca ficar sem opções;
  //  - aceita tanto camelCase (settingValue) como snake_case (setting_value)
  //    para sobreviver a respostas inconsistentes da API.
  const readOptionsSetting = (key, defaults) => {
    const setting = systemSettings.find(
      (s) => s.settingKey === key || s.setting_key === key
    );
    if (!setting) return defaults;
    const raw = setting.settingValue ?? setting.setting_value ?? '';
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {}
    return defaults;
  };

  const INTEREST_OPTIONS = useMemo(
    () => readOptionsSetting('interest_options_pj', DEFAULT_INTEREST_OPTIONS_PJ),
    [systemSettings]
  );

  const SOURCE_OPTIONS = useMemo(
    () => readOptionsSetting('source_options_pj', DEFAULT_SOURCE_OPTIONS_PJ),
    [systemSettings]
  );

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

  // Temperatura agora é 100% manual (Task #62) — lemos direto do lead.
  // O `editedLead.temperature` cobre o caso da mutation otimista local
  // antes do refetch atualizar `lead.temperature`.
  const currentTemperatureKey = normalizeManualTemperature(
    editedLead.temperature !== undefined ? editedLead.temperature : lead?.temperature
  );
  const manualTemperature = useMemo(
    () => buildManualTemperature(currentTemperatureKey),
    [currentTemperatureKey]
  );

  const { data: templates = [] } = useQuery({
    queryKey: ['proposalTemplates'],
    queryFn: () => base44.entities.ProposalTemplate.list(),
  });

  const { data: proposalNotes = [] } = useQuery({
    queryKey: ['leadNotesPJ', leadId],
    queryFn: () => base44.entities.LeadNotePJ.filter({ lead_id: leadId }),
    enabled: !!leadId,
    staleTime: 0,
  });

  const createProposalNoteMutation = useMutation({
    mutationFn: (content) => base44.entities.LeadNotePJ.create({ lead_id: leadId, content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadNotesPJ', leadId] });
      setNewProposalNote("");
      toast.success('Nota adicionada!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao adicionar nota'),
  });

  const updateProposalNoteMutation = useMutation({
    mutationFn: ({ id, content }) => base44.entities.LeadNotePJ.update(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadNotesPJ', leadId] });
      setEditingNoteId(null);
      setEditingNoteContent("");
      toast.success('Nota atualizada!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao atualizar nota'),
  });

  const deleteProposalNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadNotePJ.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadNotesPJ', leadId] });
      toast.success('Nota removida!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao remover nota'),
  });

  const { data: proposalItems = [] } = useQuery({
    queryKey: ['leadPJProposalItems', leadId],
    queryFn: () => base44.entities.LeadPJProposalItem.filter({ lead_id: leadId }),
    enabled: !!leadId,
    staleTime: 0,
  });

  // Task #63 — catálogo de produtos para a seleção dos itens da proposta.
  // Filtramos apenas os ativos; produtos desativados continuam aparecendo no
  // histórico do item (descrição = snapshot do nome) mas somem do select.
  const { data: catalogProducts = [] } = useQuery({
    queryKey: ['productsActive'],
    queryFn: () => base44.entities.Product.filter({ active: true }),
    staleTime: 1000 * 30,
  });
  const sortedActiveProducts = useMemo(
    () => [...catalogProducts].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')),
    [catalogProducts]
  );

  const invalidateProposalItems = () => {
    queryClient.invalidateQueries({ queryKey: ['leadPJProposalItems', leadId] });
    queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
    queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
  };

  const createProposalItemMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadPJProposalItem.create(data),
    onSuccess: () => {
      invalidateProposalItems();
      setNewItem({ descricao: "", quantidade: "1", valorUnitario: "", productId: "" });
      toast.success('Item adicionado!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao adicionar item'),
  });

  const updateProposalItemMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.LeadPJProposalItem.update(id, data),
    onSuccess: () => {
      invalidateProposalItems();
      setEditingItemId(null);
      setEditingItemDraft({ descricao: "", quantidade: "", valorUnitario: "", productId: "" });
      toast.success('Item atualizado!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao atualizar item'),
  });

  const deleteProposalItemMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadPJProposalItem.delete(id),
    onSuccess: () => {
      invalidateProposalItems();
      toast.success('Item removido!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao remover item'),
  });

  const proposalItemsTotal = proposalItems.reduce(
    (sum, it) => sum + (parseFloat(it.quantidade) || 0) * (parseFloat(it.valorUnitario ?? it.valor_unitario) || 0),
    0
  );

  const handleAddProposalItem = () => {
    const descricao = (newItem.descricao || '').trim();
    const quantidade = parseFloat(newItem.quantidade);
    const valorUnitario = parseFloat(newItem.valorUnitario);
    if (!descricao) {
      toast.error('Selecione um produto ou informe a descrição');
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error('Quantidade deve ser maior que zero');
      return;
    }
    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
      toast.error('Valor unitário deve ser maior ou igual a zero');
      return;
    }
    createProposalItemMutation.mutate({
      lead_id: leadId,
      descricao,
      quantidade,
      valor_unitario: valorUnitario,
      sort_order: proposalItems.length,
      product_id: newItem.productId || null,
    });
  };

  // Task #63 — quando o vendedor escolhe um produto do catálogo, snapshot do
  // nome vai pro `descricao` (preserva o nome se o produto for desativado) e
  // o `valor_unitario` é pré-preenchido com o `default_value`. "__custom__"
  // libera a edição manual em texto livre (sem product_id).
  const FREE_TEXT_OPTION = '__custom__';
  const handleSelectProductForNew = (value) => {
    if (value === FREE_TEXT_OPTION) {
      setNewItem({ ...newItem, productId: '', descricao: '' });
      return;
    }
    const product = sortedActiveProducts.find((p) => p.id === value);
    if (!product) return;
    const defaultValue = product.defaultValue ?? product.default_value ?? 0;
    setNewItem({
      ...newItem,
      productId: product.id,
      descricao: product.name,
      valorUnitario: String(defaultValue),
    });
  };

  const handleSelectProductForEditing = (value) => {
    if (value === FREE_TEXT_OPTION) {
      setEditingItemDraft({ ...editingItemDraft, productId: '', descricao: '' });
      return;
    }
    const product = sortedActiveProducts.find((p) => p.id === value);
    if (!product) return;
    const defaultValue = product.defaultValue ?? product.default_value ?? 0;
    setEditingItemDraft({
      ...editingItemDraft,
      productId: product.id,
      descricao: product.name,
      valorUnitario: String(defaultValue),
    });
  };

  const startEditingItem = (item) => {
    setEditingItemId(item.id);
    const itemProductId = item.productId ?? item.product_id ?? '';
    // Se o item referenciar um produto que foi desativado/excluído (não está
    // mais em sortedActiveProducts), cai pro modo "texto livre" pra não deixar
    // o Select com valor fantasma e o input de descrição escondido. Quando a
    // lista ainda não carregou (vazia), preserva o productId — o estado é
    // recalculado naturalmente porque catalogProducts vem via React Query.
    const productStillActive =
      !itemProductId ||
      sortedActiveProducts.length === 0 ||
      sortedActiveProducts.some((p) => p.id === itemProductId);
    setEditingItemDraft({
      descricao: item.descricao || '',
      quantidade: String(item.quantidade ?? ''),
      valorUnitario: String(item.valorUnitario ?? item.valor_unitario ?? ''),
      productId: productStillActive ? (itemProductId || '') : '',
    });
  };

  const cancelEditingItem = () => {
    setEditingItemId(null);
    setEditingItemDraft({ descricao: "", quantidade: "", valorUnitario: "", productId: "" });
  };

  const handleSaveEditingItem = () => {
    const descricao = (editingItemDraft.descricao || '').trim();
    const quantidade = parseFloat(editingItemDraft.quantidade);
    const valorUnitario = parseFloat(editingItemDraft.valorUnitario);
    if (!descricao) {
      toast.error('Selecione um produto ou informe a descrição');
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      toast.error('Quantidade deve ser maior que zero');
      return;
    }
    if (!Number.isFinite(valorUnitario) || valorUnitario < 0) {
      toast.error('Valor unitário deve ser maior ou igual a zero');
      return;
    }
    updateProposalItemMutation.mutate({
      id: editingItemId,
      data: {
        descricao,
        quantidade,
        valor_unitario: valorUnitario,
        product_id: editingItemDraft.productId || null,
      },
    });
  };

  const { data: proposalFiles = [] } = useQuery({
    queryKey: ['leadPJFiles', leadId],
    queryFn: () => base44.entities.LeadPJFile.filter({ lead_id: leadId }),
    enabled: !!leadId,
    staleTime: 0,
  });

  const uploadFileMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('lead_id', leadId);
      formData.append('file', file);
      const token = localStorage.getItem('accessToken');
      const apiUrl = '/api';
      const res = await fetch(`${apiUrl}/lead-pj-files/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) {
        let message = 'Falha ao enviar arquivo.';
        try { message = (await res.json())?.message || message; } catch (_) {}
        throw new Error(message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJFiles', leadId] });
      toast.success('Arquivo enviado com segurança!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao enviar arquivo'),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (id) => base44.entities.LeadPJFile.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJFiles', leadId] });
      toast.success('Arquivo removido!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao remover arquivo'),
  });

  const handleProposalFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExt = ['jpg', 'jpeg', 'png', 'pdf'];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!allowedExt.includes(ext)) {
      toast.error('Tipo de arquivo não permitido. Apenas .jpg, .png e .pdf.');
      e.target.value = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error(`Arquivo excede o limite de 25MB (atual: ${(file.size / 1024 / 1024).toFixed(1)} MB).`);
      e.target.value = '';
      return;
    }

    setUploadingFile(true);
    uploadFileMutation.mutate(file, {
      onSettled: () => {
        setUploadingFile(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
    });
  };

  const buildFileUrl = (file, download = false) => {
    const token = localStorage.getItem('accessToken');
    const apiUrl = '/api';
    const params = new URLSearchParams();
    if (download) params.set('download', '1');
    if (token) params.set('access_token', token);
    const qs = params.toString();
    return `${apiUrl}/lead-pj-files/${file.id}/download${qs ? `?${qs}` : ''}`;
  };

  const openFile = async (file, asAttachment = false) => {
    try {
      const token = localStorage.getItem('accessToken');
      const apiUrl = '/api';
      const res = await fetch(
        `${apiUrl}/lead-pj-files/${file.id}/download${asAttachment ? '?download=1' : ''}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) {
        let message = 'Falha ao abrir arquivo.';
        try { message = (await res.json())?.message || message; } catch (_) {}
        toast.error(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (asAttachment) {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.originalName || 'arquivo';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } else {
        setPreviewFile({ ...file, blobUrl: url });
      }
    } catch (e) {
      toast.error(e?.message || 'Erro ao abrir arquivo.');
    }
  };

  const closePreview = () => {
    if (previewFile?.blobUrl) URL.revokeObjectURL(previewFile.blobUrl);
    setPreviewFile(null);
  };

  const formatFileSize = (bytes) => {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const updateLeadMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadPJ.update(leadId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      toast.success('Lead atualizado com sucesso!');
      setHasChanges(false);
    },
  });

  const reassignAgentMutation = useMutation({
    mutationFn: ({ newAgentId, transferPending }) =>
      base44.entities.LeadPJ.update(leadId, {
        agentId: newAgentId,
        transferPendingActivities: transferPending,
      }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['leadPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ', leadId] });
      queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setReassignAgentId("");
      setTransferPendingActivities(true);

      const summary = data?.reassignmentSummary;
      if (summary?.transferRequested && summary?.transferError) {
        toast.warning(
          'Agente responsável atualizado, mas houve falha ao transferir as atividades pendentes. Verifique e refaça se necessário.'
        );
      } else if (summary?.transferApplied && summary.transferredCount > 0) {
        const n = summary.transferredCount;
        toast.success(
          `Agente responsável atualizado e ${n} ${n === 1 ? 'atividade pendente foi transferida' : 'atividades pendentes foram transferidas'} para o novo responsável.`
        );
      } else if (variables?.transferPending) {
        toast.success('Agente responsável atualizado. Nenhuma atividade pendente para transferir.');
      } else {
        toast.success('Agente responsável atualizado.');
      }
    },
    onError: (err) => {
      toast.error(err?.message || 'Não foi possível reatribuir o agente.');
    },
  });

  const handleReassignAgent = () => {
    if (!reassignAgentId) return;
    reassignAgentMutation.mutate({
      newAgentId: reassignAgentId,
      transferPending: transferPendingActivities,
    });
  };

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

  // Task #65 — editar/excluir notas comuns na timeline. O backend impõe a
  // mesma regra (autor OR admin/coord) e devolve 403 caso contrário.
  const invalidateActivityCaches = () => {
    queryClient.invalidateQueries({ queryKey: ['activitiesPJ', leadId] });
    queryClient.invalidateQueries({ queryKey: ['activitiesPJ'] });
    // LeadPJReportList usa um queryKey dedicado para a timeline em modal —
    // garante consistência caso o modal já esteja aberto.
    queryClient.invalidateQueries({ queryKey: ['activitiesPJ-modal', leadId] });
  };

  const updateActivityNoteMutation = useMutation({
    mutationFn: ({ id, content }) =>
      base44.entities.ActivityPJ.update(id, { description: content }),
    onSuccess: () => {
      invalidateActivityCaches();
      toast.success('Nota atualizada!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao atualizar nota'),
  });

  const deleteActivityNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.ActivityPJ.delete(id),
    onSuccess: () => {
      invalidateActivityCaches();
      toast.success('Nota removida!');
    },
    onError: (err) => toast.error(err?.message || 'Erro ao remover nota'),
  });

  const handleEditTimelineNote = async (id, content) => {
    await updateActivityNoteMutation.mutateAsync({ id, content });
  };

  const handleDeleteTimelineNote = (activity) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Remover nota?',
      message: 'Esta ação não pode ser desfeita. Deseja realmente remover esta nota?',
      confirmLabel: 'Remover',
      variant: 'danger',
      onConfirm: () => {
        deleteActivityNoteMutation.mutate(activity.id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

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

  // Persiste a escolha manual de temperatura no banco e mantém o estado
  // local em sincronia para refletir a alteração instantaneamente sem
  // esperar pelo refetch do useQuery.
  const handleTemperatureChange = (nextKey) => {
    const normalized = normalizeManualTemperature(nextKey);
    setEditedLead((prev) => ({ ...prev, temperature: normalized }));
    updateLeadMutation.mutate({ temperature: normalized });
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
              {manualTemperature && (
                <div className={`absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full text-white shadow-lg ${
                  manualTemperature.key === 'hot' ? 'bg-gradient-to-br from-red-500 to-orange-500' :
                  manualTemperature.key === 'warm' ? 'bg-gradient-to-br from-yellow-400 to-amber-500' :
                  'bg-gradient-to-br from-blue-400 to-cyan-500'
                }`}>
                  <Thermometer className="w-4 h-4" />
                </div>
              )}
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
                <TemperatureBadge
                  value={currentTemperatureKey}
                  onChange={handleTemperatureChange}
                  size="md"
                  placeholder="Definir temperatura"
                  triggerClassName={
                    manualTemperature
                      ? '!bg-white/20 !text-white hover:!bg-white/30 border border-white/20'
                      : '!border-white/40 !text-white/90 hover:!bg-white/10'
                  }
                />
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
                <p className="text-white/70 text-xs uppercase tracking-wide">Total Proposta</p>
                <p className="text-2xl font-bold text-white">
                  R$ {(proposalItemsTotal > 0
                      ? proposalItemsTotal
                      : parseFloat(lead.value || lead.monthly_value || lead.monthlyValue || 0)
                    ).toFixed(2)}
                </p>
                {proposalItems.length > 0 && (
                  <p className="text-white/60 text-[11px] mt-1">
                    {proposalItems.length} {proposalItems.length === 1 ? 'item' : 'itens'}
                  </p>
                )}
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
                <TabsTrigger value="agent_history" className="data-[state=active]:bg-amber-600 data-[state=active]:text-white">
                  <History className="w-4 h-4 mr-2" />
                  Histórico
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
                        <LeadPJTimeline
                          activities={activities}
                          agents={agents}
                          currentAgent={user?.agent}
                          onEditNote={handleEditTimelineNote}
                          onDeleteNote={handleDeleteTimelineNote}
                          isUpdatingNote={updateActivityNoteMutation.isPending}
                        />
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

              <TabsContent value="proposal" className="mt-6 space-y-6">
                {/* ARQUIVOS DA PROPOSTA */}
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <FileText className="w-5 h-5" />
                      Arquivos da Proposta
                    </CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                      <Shield className="w-3.5 h-3.5" />
                      Apenas .jpg, .png e .pdf — máx. 25MB. Validados por assinatura de cabeçalho.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label
                        htmlFor="proposal-file-input"
                        className={`inline-flex items-center justify-center rounded-md text-sm font-medium h-10 px-4 py-2 text-white ${uploadingFile ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'}`}
                      >
                        {uploadingFile ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4 mr-2" />
                        )}
                        Enviar arquivo
                      </label>
                      <input
                        ref={fileInputRef}
                        id="proposal-file-input"
                        type="file"
                        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                        className="sr-only"
                        disabled={uploadingFile}
                        onChange={handleProposalFileSelected}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {proposalFiles.length} {proposalFiles.length === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                    </div>

                    {proposalFiles.length === 0 ? (
                      <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                        <FileText className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        Nenhum arquivo enviado ainda.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {proposalFiles.map((file) => {
                          const isImage = file.mimeType?.startsWith('image/');
                          const isAuthor = currentAgent && String(file.uploadedBy) === String(currentAgent.id);
                          const canDelete = isAuthor || isAdmin || isCoordinator;
                          const Icon = isImage ? ImageIcon : FileText;
                          return (
                            <div
                              key={file.id}
                              className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                            >
                              <div className="w-10 h-10 rounded-md bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                                <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {file.originalName}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatFileSize(file.fileSize)} · {file.uploadedByName || 'Usuário'}
                                  {file.createdAt && (
                                    <> · {format(new Date(file.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Visualizar"
                                  onClick={() => openFile(file, false)}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0"
                                  title="Baixar"
                                  onClick={() => openFile(file, true)}
                                >
                                  <Download className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                    title="Remover"
                                    onClick={() => {
                                      if (window.confirm(`Remover o arquivo "${file.originalName}"?`)) {
                                        deleteFileMutation.mutate(file.id);
                                      }
                                    }}
                                    disabled={deleteFileMutation.isPending}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* NOTAS DA PROPOSTA */}
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <StickyNote className="w-5 h-5" />
                      Notas da Proposta
                    </CardTitle>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      Registre informações sobre a negociação. As notas ficam organizadas em ordem cronológica.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6 space-y-6">
                    {/* Formulário de nova nota */}
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Escreva uma nova nota sobre a proposta..."
                        value={newProposalNote}
                        onChange={(e) => setNewProposalNote(e.target.value)}
                        rows={3}
                        className="resize-none"
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={() => {
                            const content = newProposalNote.trim();
                            if (!content) return;
                            createProposalNoteMutation.mutate(content);
                          }}
                          disabled={!newProposalNote.trim() || createProposalNoteMutation.isPending}
                          className="bg-indigo-600 hover:bg-indigo-700"
                        >
                          {createProposalNoteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4 mr-2" />
                          )}
                          Adicionar nota
                        </Button>
                      </div>
                    </div>

                    {/* Timeline de notas */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                      {proposalNotes.length === 0 ? (
                        <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                          <StickyNote className="w-10 h-10 mx-auto mb-2 opacity-40" />
                          Nenhuma nota registrada ainda.
                        </div>
                      ) : (
                        <div className="relative pl-6">
                          {/* Linha vertical da timeline */}
                          <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200 dark:bg-gray-700" />

                          <div className="space-y-5">
                            {proposalNotes.map((note) => {
                              const isAuthor = currentAgent && String(note.createdBy) === String(currentAgent.id);
                              const canEdit = isAuthor || isAdmin || isCoordinator;
                              const isEditing = editingNoteId === note.id;
                              const createdAt = note.createdAt ? new Date(note.createdAt) : null;
                              const updatedAt = note.updatedAt ? new Date(note.updatedAt) : null;
                              const wasEdited = createdAt && updatedAt &&
                                Math.abs(updatedAt.getTime() - createdAt.getTime()) > 1000;

                              return (
                                <div key={note.id} className="relative">
                                  {/* Bolinha da timeline */}
                                  <div className="absolute -left-[18px] top-1.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white dark:border-gray-900" />

                                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                      <div className="flex flex-col text-xs text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                          {note.createdByName || 'Usuário'}
                                        </span>
                                        <span>
                                          {createdAt && format(createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                          {wasEdited && <span className="ml-1 italic">(editada)</span>}
                                        </span>
                                      </div>
                                      {canEdit && !isEditing && (
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0"
                                            onClick={() => {
                                              setEditingNoteId(note.id);
                                              setEditingNoteContent(note.content || '');
                                            }}
                                          >
                                            <Pencil className="w-3.5 h-3.5" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                                            onClick={() => {
                                              if (window.confirm('Remover esta nota?')) {
                                                deleteProposalNoteMutation.mutate(note.id);
                                              }
                                            }}
                                            disabled={deleteProposalNoteMutation.isPending}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>

                                    {isEditing ? (
                                      <div className="space-y-2">
                                        <Textarea
                                          value={editingNoteContent}
                                          onChange={(e) => setEditingNoteContent(e.target.value)}
                                          rows={3}
                                          className="resize-none"
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setEditingNoteId(null);
                                              setEditingNoteContent('');
                                            }}
                                          >
                                            <X className="w-3.5 h-3.5 mr-1" />
                                            Cancelar
                                          </Button>
                                          <Button
                                            size="sm"
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                            onClick={() => {
                                              const content = editingNoteContent.trim();
                                              if (!content) return;
                                              updateProposalNoteMutation.mutate({ id: note.id, content });
                                            }}
                                            disabled={!editingNoteContent.trim() || updateProposalNoteMutation.isPending}
                                          >
                                            {updateProposalNoteMutation.isPending ? (
                                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                            ) : (
                                              <Save className="w-3.5 h-3.5 mr-1" />
                                            )}
                                            Salvar
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                                        {note.content}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="agent_history" className="mt-6">
                <Card className="bg-white dark:bg-gray-900">
                  <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                    <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                      <History className="w-5 h-5 text-amber-600" />
                      Histórico de Responsáveis
                    </CardTitle>
                    <p className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                      Quem foi dono deste lead em cada período, derivado das reatribuições registradas na timeline.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <LeadPJAgentHistory lead={lead} activities={activities} agents={agents} />
                  </CardContent>
                </Card>
              </TabsContent>

            </Tabs>
          </div>

          {/* COLUNA DIREITA: Agente + Info + Valores (1/3) */}
          <div className="lg:col-span-1 space-y-6">
            {/* Temperatura manual do lead */}
            <Card className="bg-white dark:bg-gray-900">
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <CardTitle className="flex items-center gap-2 text-gray-900 dark:text-gray-100 text-base">
                  <Thermometer className="w-5 h-5 text-orange-500" />
                  Temperatura do lead
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-5 space-y-3">
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Você decide. Clique para marcar como Quente, Morno ou Frio — ou
                  remova a marcação a qualquer momento.
                </p>
                <TemperatureBadge
                  value={currentTemperatureKey}
                  onChange={handleTemperatureChange}
                  size="lg"
                  placeholder="Definir temperatura"
                />
                {manualTemperature?.key === 'cold' && (
                  <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
                    <Link
                      to={`${createPageUrl('LeadsPJKanban')}?temperature=cold`}
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      <ListTodo className="w-4 h-4" />
                      Ver todos os leads frios
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agente Responsável */}
            <Card className="border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950 dark:to-indigo-900">
              <CardHeader className="border-b border-indigo-200 dark:border-indigo-700">
                <CardTitle className="flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
                  <Building2 className="w-5 h-5" />
                  Agente Responsável
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                {(() => {
                  const agent = agents.find(a => String(a.id) === String(leadAgentId));
                  if (!agent) {
                    return (
                      <p className="text-sm text-indigo-900/70 dark:text-indigo-100/70">
                        Nenhum agente atribuído a este lead.
                      </p>
                    );
                  }
                  return (
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
                  );
                })()}

                {(isAdmin || isCoordinator) && (
                  <div className="pt-4 border-t border-indigo-200 dark:border-indigo-700 space-y-2">
                    <Label className="text-xs font-semibold text-indigo-900 dark:text-indigo-100 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      Reatribuir agente responsável
                    </Label>
                    <div className="flex gap-2">
                      <Select
                        value={reassignAgentId}
                        onValueChange={setReassignAgentId}
                        disabled={reassignAgentMutation.isPending}
                      >
                        <SelectTrigger className="flex-1 bg-white dark:bg-gray-900 border-indigo-300 dark:border-indigo-700 text-sm">
                          <SelectValue placeholder="Escolha o novo agente" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents
                            .filter(a => a.active !== false)
                            .map(a => (
                              <SelectItem key={a.id} value={String(a.id)}>
                                {a.name}{a.team ? ` — ${a.team}` : ''}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={handleReassignAgent}
                        disabled={
                          !reassignAgentId ||
                          String(reassignAgentId) === String(leadAgentId) ||
                          reassignAgentMutation.isPending
                        }
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      >
                        {reassignAgentMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          'Reatribuir'
                        )}
                      </Button>
                    </div>
                    {(() => {
                      const transferableCount = activities.filter(
                        (a) => !a.completed && a.type !== 'agent_change'
                      ).length;
                      return (
                        <label className="flex items-start gap-2 mt-2 cursor-pointer select-none">
                          <Checkbox
                            id="transfer-pending-activities"
                            checked={transferPendingActivities}
                            onCheckedChange={(checked) => setTransferPendingActivities(checked === true)}
                            disabled={reassignAgentMutation.isPending}
                            className="mt-0.5 border-indigo-400 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                          />
                          <span className="text-xs text-indigo-900 dark:text-indigo-100 leading-snug">
                            Transferir também as tarefas e atividades pendentes deste lead para o novo agente
                            {transferableCount > 0 && (
                              <span className="font-semibold"> ({transferableCount} {transferableCount === 1 ? 'pendente' : 'pendentes'})</span>
                            )}
                          </span>
                        </label>
                      );
                    })()}
                    <p className="text-[11px] text-indigo-900/70 dark:text-indigo-100/70">
                      A troca fica registrada na linha do tempo de atividades do lead. Cada atividade transferida mantém o histórico de quem era o responsável original.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

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

                {/* Contato 1 */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <Label className="text-gray-900 dark:text-gray-100 font-semibold">Contato 1</Label>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Nome Contato 1</Label>
                    <Input
                      value={editedLead.contact1Name !== undefined ? editedLead.contact1Name : (lead.contact1Name || lead.contact1_name || "")}
                      onChange={(e) => handleFieldChange('contact1Name', e.target.value)}
                      placeholder="Nome do contato"
                      className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Cargo Contato 1</Label>
                    <Input
                      value={editedLead.contact1Role !== undefined ? editedLead.contact1Role : (lead.contact1Role || lead.contact1_role || "")}
                      onChange={(e) => handleFieldChange('contact1Role', e.target.value)}
                      placeholder="Cargo do contato"
                      className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Telefone Contato 1</Label>
                    <div className="flex gap-3 mt-1">
                      <Input
                        value={editedLead.contact1Phone !== undefined ? editedLead.contact1Phone : (lead.contact1Phone || lead.contact1_phone || "")}
                        onChange={(e) => handleFieldChange('contact1Phone', e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="flex-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                      {(lead.contact1Phone || lead.contact1_phone) && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const num = (lead.contact1Phone || lead.contact1_phone).replace(/\D/g, '');
                            window.open(`https://wa.me/55${num}`, '_blank');
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contato 2 */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
                  <Label className="text-gray-900 dark:text-gray-100 font-semibold">Contato 2</Label>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Nome Contato 2</Label>
                    <Input
                      value={editedLead.contact2Name !== undefined ? editedLead.contact2Name : (lead.contact2Name || lead.contact2_name || "")}
                      onChange={(e) => handleFieldChange('contact2Name', e.target.value)}
                      placeholder="Nome do contato"
                      className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Cargo Contato 2</Label>
                    <Input
                      value={editedLead.contact2Role !== undefined ? editedLead.contact2Role : (lead.contact2Role || lead.contact2_role || "")}
                      onChange={(e) => handleFieldChange('contact2Role', e.target.value)}
                      placeholder="Cargo do contato"
                      className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-gray-600 dark:text-gray-400">Telefone Contato 2</Label>
                    <div className="flex gap-3 mt-1">
                      <Input
                        value={editedLead.contact2Phone !== undefined ? editedLead.contact2Phone : (lead.contact2Phone || lead.contact2_phone || "")}
                        onChange={(e) => handleFieldChange('contact2Phone', e.target.value)}
                        placeholder="(00) 00000-0000"
                        className="flex-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      />
                      {(lead.contact2Phone || lead.contact2_phone) && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            const num = (lead.contact2Phone || lead.contact2_phone).replace(/\D/g, '');
                            window.open(`https://wa.me/55${num}`, '_blank');
                          }}
                        >
                          <Phone className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Interesse</Label>
                  {(() => {
                    const rawValue = editedLead.interest !== undefined
                      ? editedLead.interest
                      : (lead.interest || "");
                    const selectedItems = Array.isArray(rawValue)
                      ? rawValue
                      : (typeof rawValue === 'string' && rawValue.trim()
                          ? rawValue.split(',').map((s) => s.trim()).filter(Boolean)
                          : []);
                    const legacyItems = selectedItems.filter(
                      (v) => !INTEREST_OPTIONS.includes(v)
                    );
                    const allOptions = [...legacyItems, ...INTEREST_OPTIONS];
                    const toggleItem = (option, checked) => {
                      const next = checked
                        ? [...selectedItems, option]
                        : selectedItems.filter((v) => v !== option);
                      handleFieldChange('interest', next.join(', '));
                    };
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            className="mt-1 w-full justify-between font-normal h-auto min-h-[36px] py-1.5 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                          >
                            <span className="flex flex-wrap gap-1 flex-1 text-left">
                              {selectedItems.length === 0 ? (
                                <span className="text-muted-foreground">Selecione o interesse</span>
                              ) : (
                                selectedItems.map((item) => (
                                  <span
                                    key={item}
                                    className="inline-flex items-center gap-0.5 bg-primary/10 text-primary text-xs rounded px-1.5 py-0.5"
                                  >
                                    {item}
                                    {legacyItems.includes(item) ? ' (existente)' : ''}
                                    <X
                                      className="w-3 h-3 cursor-pointer hover:text-red-500"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleItem(item, false);
                                      }}
                                    />
                                  </span>
                                ))
                              )}
                            </span>
                            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[260px] p-2 max-h-[240px] overflow-y-auto" align="start">
                          {allOptions.map((option) => (
                            <label
                              key={option}
                              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer text-sm"
                            >
                              <Checkbox
                                checked={selectedItems.includes(option)}
                                onCheckedChange={(checked) => toggleItem(option, checked)}
                              />
                              {option}
                              {legacyItems.includes(option) ? ' (existente)' : ''}
                            </label>
                          ))}
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>

                <div>
                  <Label className="text-gray-900 dark:text-gray-100">Origem</Label>
                  {(() => {
                    // Task #67 — origem agora é editável no detail (antes só
                    // era setada na criação via QuickLeadPJForm). Mesmo
                    // padrão de fallback para valores legados que não estão
                    // mais nas opções configuradas.
                    const currentValue = editedLead.source !== undefined
                      ? editedLead.source
                      : (lead.source || "");
                    const renderedOptions = currentValue && !SOURCE_OPTIONS.includes(currentValue)
                      ? [currentValue, ...SOURCE_OPTIONS]
                      : SOURCE_OPTIONS;
                    const isLegacy = currentValue && !SOURCE_OPTIONS.includes(currentValue);
                    return (
                      <Select
                        value={currentValue}
                        onValueChange={(val) => handleFieldChange('source', val)}
                      >
                        <SelectTrigger className="mt-1 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <SelectValue placeholder="Selecione a origem" />
                        </SelectTrigger>
                        <SelectContent>
                          {renderedOptions.map(option => (
                            <SelectItem key={option} value={option}>
                              {option}
                              {isLegacy && option === currentValue ? ' (valor existente)' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  })()}
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
                  Itens da Proposta
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  {proposalItems.length === 0 ? (
                    <div className="text-center py-4 text-sm text-green-800/70 dark:text-green-300/70 bg-white/60 dark:bg-gray-900/40 rounded-lg border border-dashed border-green-300 dark:border-green-700">
                      Nenhum item cadastrado ainda. Adicione os produtos/serviços que compõem a proposta.
                    </div>
                  ) : (
                    proposalItems.map((item) => {
                      const isEditing = editingItemId === item.id;
                      const qty = parseFloat(item.quantidade) || 0;
                      const unit = parseFloat(item.valorUnitario ?? item.valor_unitario) || 0;
                      const subtotal = qty * unit;
                      return (
                        <div
                          key={item.id}
                          className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700 rounded-lg p-3 shadow-sm"
                        >
                          {isEditing ? (
                            <div className="space-y-2">
                              <div>
                                <Label className="text-xs text-gray-600 dark:text-gray-300">Produto</Label>
                                <Select
                                  value={editingItemDraft.productId || (editingItemDraft.descricao ? FREE_TEXT_OPTION : '')}
                                  onValueChange={handleSelectProductForEditing}
                                >
                                  <SelectTrigger className="mt-1 bg-white dark:bg-gray-800">
                                    <SelectValue placeholder="Selecione um produto do catálogo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {sortedActiveProducts.length === 0 && (
                                      <div className="px-2 py-1.5 text-xs text-gray-500">
                                        Nenhum produto ativo no catálogo
                                      </div>
                                    )}
                                    {sortedActiveProducts.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                    <SelectItem value={FREE_TEXT_OPTION}>
                                      Outro (descrição livre)
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {(!editingItemDraft.productId) && (
                                  <Input
                                    value={editingItemDraft.descricao}
                                    onChange={(e) => setEditingItemDraft({ ...editingItemDraft, descricao: e.target.value })}
                                    placeholder="Descrição do item"
                                    className="mt-2"
                                  />
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs text-gray-600 dark:text-gray-300">Quantidade</Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={editingItemDraft.quantidade}
                                    onChange={(e) => setEditingItemDraft({ ...editingItemDraft, quantidade: e.target.value })}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-600 dark:text-gray-300">Valor Unitário (R$)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={editingItemDraft.valorUnitario}
                                    onChange={(e) => setEditingItemDraft({ ...editingItemDraft, valorUnitario: e.target.value })}
                                    className="mt-1"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-2 pt-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={cancelEditingItem}
                                  disabled={updateProposalItemMutation.isPending}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={handleSaveEditingItem}
                                  disabled={updateProposalItemMutation.isPending}
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                >
                                  {updateProposalItemMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    'Salvar'
                                  )}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 break-words">
                                  {item.descricao}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  {qty.toLocaleString('pt-BR')} × {formatCurrency(unit)}
                                </p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className="text-sm font-bold text-green-700 dark:text-green-300 whitespace-nowrap">
                                  {formatCurrency(subtotal)}
                                </span>
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => startEditingItem(item)}
                                    className="h-7 w-7 p-0 text-gray-500 hover:text-green-700"
                                    title="Editar item"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setConfirmDialog({
                                        isOpen: true,
                                        title: 'Remover item',
                                        message: `Remover "${item.descricao}" da proposta?`,
                                        confirmLabel: 'Remover',
                                        variant: 'destructive',
                                        onConfirm: () => deleteProposalItemMutation.mutate(item.id),
                                      });
                                    }}
                                    className="h-7 w-7 p-0 text-gray-500 hover:text-red-600"
                                    title="Remover item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="bg-white/80 dark:bg-gray-900/50 border border-green-200 dark:border-green-700 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-semibold text-green-800 dark:text-green-300">Adicionar item</p>
                  <div>
                    <Select
                      value={newItem.productId || (newItem.descricao ? FREE_TEXT_OPTION : '')}
                      onValueChange={handleSelectProductForNew}
                    >
                      <SelectTrigger className="bg-white dark:bg-gray-800">
                        <SelectValue placeholder={
                          sortedActiveProducts.length === 0
                            ? 'Cadastre produtos em Configurações'
                            : 'Selecione um produto do catálogo'
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedActiveProducts.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-gray-500">
                            Nenhum produto ativo cadastrado.
                          </div>
                        )}
                        {sortedActiveProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                        <SelectItem value={FREE_TEXT_OPTION}>
                          Outro (descrição livre)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {!newItem.productId && (
                      <Input
                        value={newItem.descricao}
                        onChange={(e) => setNewItem({ ...newItem, descricao: e.target.value })}
                        placeholder="Descrição do produto/serviço"
                        className="bg-white dark:bg-gray-800 mt-2"
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-gray-600 dark:text-gray-300">Quantidade</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={newItem.quantidade}
                        onChange={(e) => setNewItem({ ...newItem, quantidade: e.target.value })}
                        className="mt-1 bg-white dark:bg-gray-800"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-600 dark:text-gray-300">Valor Unitário (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newItem.valorUnitario}
                        onChange={(e) => setNewItem({ ...newItem, valorUnitario: e.target.value })}
                        placeholder="0.00"
                        className="mt-1 bg-white dark:bg-gray-800"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleAddProposalItem}
                    disabled={createProposalItemMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    {createProposalItemMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-1" />
                    )}
                    Adicionar item
                  </Button>
                </div>

                {lead.monthlyRevenue && (
                  <div className="pt-1">
                    <Label className="text-sm text-green-800 dark:text-green-300">Faturamento Mensal</Label>
                    <p className="text-lg font-bold text-green-700 dark:text-green-300 mt-1">
                      {formatCurrency(lead.monthlyRevenue)}
                    </p>
                  </div>
                )}

                <div className="pt-2 border-t border-green-300 dark:border-green-700">
                  <div className="bg-white dark:bg-gray-800 p-4 rounded-lg text-center shadow-sm">
                    <p className="text-xs text-green-700 dark:text-green-400 mb-1">Total da Proposta</p>
                    <p className="text-2xl font-bold text-green-800 dark:text-green-200">
                      {formatCurrency(proposalItemsTotal)}
                    </p>
                    {proposalItems.length > 0 && (
                      <p className="text-xs text-green-700/80 dark:text-green-400/80 mt-1">
                        {proposalItems.length} {proposalItems.length === 1 ? 'item' : 'itens'} cadastrado{proposalItems.length === 1 ? '' : 's'}
                      </p>
                    )}
                    {proposalItems.length === 0 && (lead.value || lead.monthlyValue) ? (
                      <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                        Valor legado registrado: {formatCurrency(lead.value || lead.monthlyValue)}. Adicione itens para substituir.
                      </p>
                    ) : null}
                  </div>
                </div>
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

      <Dialog open={!!previewFile} onOpenChange={(open) => { if (!open) closePreview(); }}>
        <DialogContent className="bg-white dark:bg-gray-900 max-w-4xl w-[95vw] h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-gray-200 dark:border-gray-700">
            <DialogTitle className="text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              <span className="truncate">{previewFile?.originalName}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-50 dark:bg-gray-950 p-2">
            {previewFile?.mimeType?.startsWith('image/') ? (
              <img
                src={previewFile.blobUrl}
                alt={previewFile.originalName}
                className="mx-auto max-h-full"
              />
            ) : previewFile?.mimeType === 'application/pdf' ? (
              <iframe
                src={previewFile.blobUrl}
                title={previewFile.originalName}
                className="w-full h-full border-0"
                sandbox=""
              />
            ) : null}
          </div>
          <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="outline"
              onClick={() => previewFile && openFile(previewFile, true)}
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar
            </Button>
            <Button onClick={closePreview}>
              <X className="w-4 h-4 mr-2" />
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
