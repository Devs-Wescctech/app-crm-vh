import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Edit, 
  FileText, 
  DollarSign, 
  Activity, 
  Trash2, 
  CheckCircle, 
  Copy,
  Eye,
  Palette,
  Calendar,
  CreditCard,
  X,
  GripVertical,
  Sparkles,
  FileCheck,
  AlertCircle
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ProposalTemplates() {
  const queryClient = useQueryClient();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [newFeature, setNewFeature] = useState("");
  const [newTerm, setNewTerm] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    productName: "",
    description: "",
    features: [],
    price: 0,
    paymentMethods: "",
    paymentDueDay: 10,
    validityDays: 7,
    terms: [],
    active: true,
    colorPrimary: "#0066cc",
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['proposalTemplates'],
    queryFn: () => base44.entities.ProposalTemplate.list(),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data) => base44.entities.ProposalTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposalTemplates'] });
      setIsSheetOpen(false);
      resetForm();
      toast.success('Template criado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao criar template');
    }
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ProposalTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposalTemplates'] });
      setIsSheetOpen(false);
      resetForm();
      toast.success('Template atualizado com sucesso!');
    },
    onError: () => {
      toast.error('Erro ao atualizar template');
    }
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => base44.entities.ProposalTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proposalTemplates'] });
      toast.success('Template excluído!');
    },
    onError: () => {
      toast.error('Erro ao excluir template');
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      productName: "",
      description: "",
      features: [],
      price: 0,
      paymentMethods: "",
      paymentDueDay: 10,
      validityDays: 7,
      terms: [],
      active: true,
      colorPrimary: "#0066cc",
    });
    setEditingTemplate(null);
    setNewFeature("");
    setNewTerm("");
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name || "",
      productName: template.productName || template.product_name || "",
      description: template.description || "",
      features: template.features || [],
      price: template.price || 0,
      paymentMethods: template.paymentMethods || template.payment_methods || "",
      paymentDueDay: template.paymentDueDay || template.payment_due_day || 10,
      validityDays: template.validityDays || template.validity_days || 7,
      terms: template.terms || [],
      active: template.active !== undefined ? template.active : true,
      colorPrimary: template.colorPrimary || template.color_primary || "#0066cc",
    });
    setIsSheetOpen(true);
  };

  const handleDuplicate = (template) => {
    setEditingTemplate(null);
    setFormData({
      name: `${template.name} (Cópia)`,
      productName: template.productName || template.product_name || "",
      description: template.description || "",
      features: template.features || [],
      price: template.price || 0,
      paymentMethods: template.paymentMethods || template.payment_methods || "",
      paymentDueDay: template.paymentDueDay || template.payment_due_day || 10,
      validityDays: template.validityDays || template.validity_days || 7,
      terms: template.terms || [],
      active: true,
      colorPrimary: template.colorPrimary || template.color_primary || "#0066cc",
    });
    setIsSheetOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.productName || !formData.price) {
      toast.error('Preencha os campos obrigatórios');
      return;
    }

    if (editingTemplate) {
      updateTemplateMutation.mutate({
        id: editingTemplate.id,
        data: formData
      });
    } else {
      createTemplateMutation.mutate(formData);
    }
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData({
        ...formData,
        features: [...formData.features, newFeature.trim()]
      });
      setNewFeature("");
    }
  };

  const removeFeature = (index) => {
    setFormData({
      ...formData,
      features: formData.features.filter((_, i) => i !== index)
    });
  };

  const addTerm = () => {
    if (newTerm.trim()) {
      setFormData({
        ...formData,
        terms: [...formData.terms, newTerm.trim()]
      });
      setNewTerm("");
    }
  };

  const removeTerm = (index) => {
    setFormData({
      ...formData,
      terms: formData.terms.filter((_, i) => i !== index)
    });
  };

  const activeTemplates = templates.filter(t => t.active);
  const inactiveTemplates = templates.filter(t => !t.active);

  return (
    <div className="p-6 space-y-6 bg-gray-50 dark:bg-gray-950 min-h-screen">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Templates de Proposta</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                {templates.length} templates cadastrados
              </p>
            </div>
          </div>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setIsSheetOpen(true);
          }}
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-0 shadow-lg shadow-indigo-500/25 rounded-xl"
        >
          <Plus className="w-4 h-4 mr-2" />
          Novo Template
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="border-0 bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg overflow-hidden">
          <CardContent className="p-4 relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-indigo-100">Total</p>
                <p className="text-2xl font-bold">{templates.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-lg overflow-hidden">
          <CardContent className="p-4 relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-green-100">Ativos</p>
                <p className="text-2xl font-bold">{activeTemplates.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg overflow-hidden">
          <CardContent className="p-4 relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-amber-100">Valor Médio</p>
                <p className="text-2xl font-bold">
                  R$ {templates.length > 0 ? (templates.reduce((acc, t) => acc + (parseFloat(t.price) || 0), 0) / templates.length).toFixed(2) : '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 bg-gradient-to-br from-gray-500 to-gray-600 text-white shadow-lg overflow-hidden">
          <CardContent className="p-4 relative">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-200">Inativos</p>
                <p className="text-2xl font-bold">{inactiveTemplates.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="h-24 bg-gray-200 dark:bg-gray-800" />
              <CardContent className="pt-4 space-y-3">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <Card className="border-dashed border-2 border-gray-300 dark:border-gray-700">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Nenhum template cadastrado
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
              Crie templates de proposta para agilizar o envio de propostas comerciais aos seus clientes.
            </p>
            <Button 
              onClick={() => setIsSheetOpen(true)}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-0 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(template => {
            const color = template.colorPrimary || template.color_primary || '#0066cc';
            const productName = template.productName || template.product_name;
            const paymentMethods = template.paymentMethods || template.payment_methods;
            const validityDays = template.validityDays || template.validity_days || 7;
            
            return (
              <Card 
                key={template.id} 
                className={`
                  border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 
                  hover:shadow-xl transition-all duration-300 overflow-hidden group
                  ${!template.active ? 'opacity-60' : ''}
                `}
              >
                <CardHeader 
                  className="border-b border-gray-100 dark:border-gray-800 relative overflow-hidden"
                  style={{ backgroundColor: `${color}10` }}
                >
                  <div 
                    className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-20"
                    style={{ background: `radial-gradient(circle, ${color}, transparent)`, transform: 'translate(30%, -30%)' }}
                  />
                  <div className="flex items-start justify-between relative z-10">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div 
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                        <CardTitle className="text-lg text-gray-900 dark:text-white">{template.name}</CardTitle>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{productName}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleDuplicate(template); }}
                        className="h-8 w-8 hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600"
                        title="Duplicar"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleEdit(template); }}
                        className="h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-800"
                        title="Editar"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(template.id); }}
                        className="h-8 w-8 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    {template.description && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{template.description}</p>
                    )}

                    <div className="flex items-center justify-between p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-xl">
                      <span className="text-sm text-gray-600 dark:text-gray-400">Valor Mensal</span>
                      <div className="flex items-center gap-1 text-xl font-bold text-green-600 dark:text-green-400">
                        <span className="text-sm font-normal">R$</span>
                        {(parseFloat(template.price) || 0).toFixed(2)}
                      </div>
                    </div>

                    {paymentMethods && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        <CreditCard className="w-4 h-4" />
                        {paymentMethods}
                      </div>
                    )}

                    {template.features && template.features.length > 0 && (
                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                          Benefícios
                        </p>
                        <div className="space-y-1.5">
                          {template.features.slice(0, 4).map((feature, idx) => (
                            <div key={idx} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                              <span className="line-clamp-1">{feature}</span>
                            </div>
                          ))}
                          {template.features.length > 4 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 pl-6">
                              +{template.features.length - 4} benefícios
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {template.terms && template.terms.length > 0 && (
                      <div className="pt-3 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                          Termos
                        </p>
                        <div className="space-y-1.5">
                          {template.terms.slice(0, 2).map((term, idx) => (
                            <div key={idx} className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2">
                              <FileCheck className="w-3 h-3 text-gray-400 shrink-0 mt-0.5" />
                              <span className="line-clamp-1">{term}</span>
                            </div>
                          ))}
                          {template.terms.length > 2 && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 pl-5">
                              +{template.terms.length - 2} termos
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                      <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-800">
                        <Calendar className="w-3 h-3 mr-1" />
                        Validade: {validityDays} dias
                      </Badge>
                      {!template.active && (
                        <Badge className="text-xs bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          Inativo
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto bg-white dark:bg-gray-900">
          <SheetHeader className="pb-4 border-b border-gray-100 dark:border-gray-800">
            <SheetTitle className="text-xl text-gray-900 dark:text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              {editingTemplate ? 'Editar Template' : 'Novo Template'}
            </SheetTitle>
          </SheetHeader>
          
          <div className="space-y-6 py-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Informações Básicas
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label className="text-gray-700 dark:text-gray-300">Nome do Template *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: Plano Bronze"
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 dark:text-gray-300">Nome do Produto *</Label>
                  <Input
                    value={formData.productName}
                    onChange={(e) => setFormData({...formData, productName: e.target.value})}
                    placeholder="Plano Funeral Bronze"
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 dark:text-gray-300">Valor Mensal (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                    placeholder="99.90"
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-gray-700 dark:text-gray-300">Descrição</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Descrição do produto/serviço"
                    rows={2}
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-green-500" />
                Pagamento
              </h3>
              
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-gray-700 dark:text-gray-300">Formas de Pagamento</Label>
                  <Input
                    value={formData.paymentMethods}
                    onChange={(e) => setFormData({...formData, paymentMethods: e.target.value})}
                    placeholder="Boleto, Cartão, PIX"
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 dark:text-gray-300">Dia Vencimento</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.paymentDueDay}
                    onChange={(e) => setFormData({...formData, paymentDueDay: parseInt(e.target.value) || 10})}
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-gray-700 dark:text-gray-300">Validade (dias)</Label>
                  <Input
                    type="number"
                    value={formData.validityDays}
                    onChange={(e) => setFormData({...formData, validityDays: parseInt(e.target.value) || 7})}
                    className="mt-1.5 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Benefícios / Features
              </h3>
              
              <div className="flex gap-2">
                <Input
                  value={newFeature}
                  onChange={(e) => setNewFeature(e.target.value)}
                  placeholder="Adicionar benefício..."
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                />
                <Button
                  type="button"
                  onClick={addFeature}
                  className="bg-emerald-500 hover:bg-emerald-600 rounded-xl shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {formData.features.length > 0 && (
                <div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  {formData.features.map((feature, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 group"
                    >
                      <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{feature}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFeature(index)}
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-500" />
                Termos e Condições
              </h3>
              
              <div className="flex gap-2">
                <Input
                  value={newTerm}
                  onChange={(e) => setNewTerm(e.target.value)}
                  placeholder="Adicionar termo..."
                  className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTerm())}
                />
                <Button
                  type="button"
                  onClick={addTerm}
                  className="bg-blue-500 hover:bg-blue-600 rounded-xl shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              {formData.terms.length > 0 && (
                <div className="space-y-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                  {formData.terms.map((term, index) => (
                    <div 
                      key={index} 
                      className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 group"
                    >
                      <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                      <FileCheck className="w-4 h-4 text-blue-500 shrink-0" />
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{term}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTerm(index)}
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Palette className="w-4 h-4 text-purple-500" />
                Aparência
              </h3>
              
              <div className="flex items-center gap-4">
                <div>
                  <Label className="text-gray-700 dark:text-gray-300">Cor Primária</Label>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Input
                      type="color"
                      value={formData.colorPrimary}
                      onChange={(e) => setFormData({...formData, colorPrimary: e.target.value})}
                      className="w-12 h-10 p-1 rounded-lg cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={formData.colorPrimary}
                      onChange={(e) => setFormData({...formData, colorPrimary: e.target.value})}
                      className="w-28 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-xl"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
              <div>
                <Label className="text-gray-900 dark:text-white font-medium">Template Ativo</Label>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Templates inativos não aparecem para seleção
                </p>
              </div>
              <Switch
                checked={formData.active}
                onCheckedChange={(val) => setFormData({...formData, active: val})}
              />
            </div>
          </div>

          <SheetFooter className="pt-4 border-t border-gray-100 dark:border-gray-800">
            <Button variant="outline" onClick={() => setIsSheetOpen(false)} className="rounded-xl">
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!formData.name || !formData.productName || !formData.price || createTemplateMutation.isPending || updateTemplateMutation.isPending}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 border-0 rounded-xl"
            >
              {createTemplateMutation.isPending || updateTemplateMutation.isPending 
                ? 'Salvando...' 
                : editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent className="bg-white dark:bg-gray-900">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-gray-900 dark:text-white">Excluir Template?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500 dark:text-gray-400">
              Esta ação não pode ser desfeita. O template será permanentemente removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTemplateMutation.mutate(deleteConfirmId);
                setDeleteConfirmId(null);
              }}
              className="bg-red-500 hover:bg-red-600 rounded-xl"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
