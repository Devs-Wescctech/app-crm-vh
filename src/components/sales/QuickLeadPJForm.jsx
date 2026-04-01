import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Building2, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const DEFAULT_INTEREST_OPTIONS_PJ = [
  "Plano Funeral Empresarial",
  "Plano de Saúde Corporativo",
  "Seguro Empresarial",
  "Telemedicina Corporativa",
  "Assistência 24h",
  "Múltiplos Planos",
  "Outro",
];

const DEFAULT_SOURCE_OPTIONS_PJ = [
  "Indicação",
  "Site",
  "LinkedIn",
  "Google Ads",
  "Cold Call",
  "Evento",
  "Parceiro",
  "Outro",
];

export default function QuickLeadPJForm({ onSuccess, onCancel }) {
  const queryClient = useQueryClient();
  const [searchingCNPJ, setSearchingCNPJ] = useState(false);
  const [cnpjFound, setCnpjFound] = useState(false);
  const [duplicateError, setDuplicateError] = useState(null);

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

  const SOURCE_OPTIONS = (() => {
    const setting = systemSettings.find(s => s.settingKey === 'source_options_pj' || s.setting_key === 'source_options_pj');
    if (setting) {
      try { return JSON.parse(setting.settingValue || setting.setting_value); } catch {}
    }
    return DEFAULT_SOURCE_OPTIONS_PJ;
  })();
  const [formData, setFormData] = useState({
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    porte: "",
    naturezaJuridica: "",
    cnaePrincipal: "",
    atividadePrincipal: "",
    dataAbertura: "",
    situacaoCadastral: "",
    phone: "",
    phoneSecondary: "",
    email: "",
    contactName: "",
    contactRole: "",
    website: "",
    address: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    cep: "",
    city: "",
    state: "",
    interest: "",
    numEmployees: "",
    monthlyRevenue: "",
    value: "",
    monthlyValue: "",
    source: "",
    notes: "",
  });

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const currentAgentId = user?.agent?.id;

  const createLeadMutation = useMutation({
    mutationFn: (data) => base44.entities.LeadPJ.create(data),
    onSuccess: () => {
      toast.success('Lead PJ cadastrado com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['leadsPJ'] });
      if (onSuccess) onSuccess();
    },
    onError: (error) => {
      console.error('Erro ao criar lead PJ:', error);
      const msg = error.message || 'Erro ao criar lead PJ';
      if (msg.includes('cadastrado') || msg.includes('duplicat')) {
        setDuplicateError(msg);
        toast.error(msg, { duration: 8000, style: { background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' } });
      } else {
        toast.error(msg);
      }
    },
  });

  const formatCNPJ = (value) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 14) {
      return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    }
    return value;
  };

  const handleCNPJChange = (e) => {
    const formatted = formatCNPJ(e.target.value);
    setFormData({...formData, cnpj: formatted});
    setCnpjFound(false);
  };

  const handleBuscarCNPJ = async () => {
    if (!formData.cnpj || formData.cnpj.length < 18) {
      toast.error('Digite um CNPJ válido');
      return;
    }

    setSearchingCNPJ(true);
    setCnpjFound(false);

    try {
      const response = await base44.functions.buscaCNPJ({
        cnpj: formData.cnpj
      });

      if (response.success) {
        const data = response.data || {};
        const raw = response.raw || {};
        
        const addressParts = [
          data.street,
          data.number,
          data.complement,
          data.neighborhood,
          data.city,
          data.state,
          data.cep
        ].filter(Boolean);
        const fullAddress = addressParts.join(', ');
        
        let websiteValue = '';
        if (raw.estabelecimento?.email) {
          const emailParts = raw.estabelecimento.email.split('@');
          if (emailParts.length > 1) {
            websiteValue = `www.${emailParts[1]}`;
          }
        }
        
        setFormData(prev => ({
          ...prev,
          razaoSocial: data.razao_social || prev.razaoSocial,
          nomeFantasia: data.nome_fantasia || prev.nomeFantasia,
          contactName: data.contact_name || prev.contactName,
          atividadePrincipal: data.atividade_principal || prev.atividadePrincipal,
          situacaoCadastral: data.situacao_cadastral || prev.situacaoCadastral,
          porte: data.porte || prev.porte,
          naturezaJuridica: raw.natureza_juridica?.descricao || prev.naturezaJuridica,
          cnaePrincipal: raw.estabelecimento?.atividade_principal?.id || prev.cnaePrincipal,
          dataAbertura: raw.estabelecimento?.data_inicio_atividade || prev.dataAbertura,
          street: data.street || prev.street,
          number: data.number || prev.number,
          complement: data.complement || prev.complement,
          neighborhood: data.neighborhood || prev.neighborhood,
          city: data.city || prev.city,
          state: data.state || prev.state,
          cep: data.cep || prev.cep,
          address: fullAddress || prev.address,
          phone: data.phone || prev.phone,
          phoneSecondary: data.phone_secondary || prev.phoneSecondary,
          email: data.email || prev.email,
          website: websiteValue || prev.website,
          contactRole: raw.socios?.[0]?.qualificacao_socio?.descricao || prev.contactRole,
        }));
        setCnpjFound(true);
        toast.success('Dados da empresa carregados!');
      } else {
        toast.error(response.error || 'CNPJ não encontrado');
      }
    } catch (error) {
      console.error('Erro ao buscar CNPJ:', error);
      toast.error('Erro ao buscar dados do CNPJ');
    }

    setSearchingCNPJ(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.cnpj) {
      toast.error('CNPJ é obrigatório');
      return;
    }

    const dataToSave = {
      ...formData,
      agentId: currentAgentId || null,
      stage: 'novo',
      numEmployees: formData.numEmployees ? parseInt(formData.numEmployees) : null,
      monthlyRevenue: formData.monthlyRevenue ? parseFloat(formData.monthlyRevenue) : null,
      monthlyValue: formData.monthlyValue ? parseFloat(formData.monthlyValue) : null,
      value: formData.value ? parseFloat(formData.value) : null,
    };

    createLeadMutation.mutate(dataToSave);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Busca CNPJ */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <Label className="text-blue-900 dark:text-blue-100 font-semibold flex items-center gap-2 mb-3">
          <Building2 className="w-5 h-5" />
          CNPJ da Empresa *
        </Label>
        <div className="flex gap-2">
          <Input
            value={formData.cnpj}
            onChange={handleCNPJChange}
            placeholder="00.000.000/0000-00"
            maxLength={18}
            className="flex-1 bg-white dark:bg-gray-800"
          />
          <Button
            type="button"
            onClick={handleBuscarCNPJ}
            disabled={searchingCNPJ || !formData.cnpj || formData.cnpj.length < 18}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {searchingCNPJ ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search className="w-4 h-4 mr-2" />
                Buscar na Receita
              </>
            )}
          </Button>
        </div>
        {cnpjFound && (
          <Alert className="mt-3 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800 dark:text-green-300">
              Dados da empresa carregados com sucesso!
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Dados da Empresa */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label>Razão Social *</Label>
          <Input
            value={formData.razaoSocial}
            onChange={(e) => setFormData({...formData, razaoSocial: e.target.value})}
            placeholder="Nome oficial da empresa"
            className="mt-1"
            required
          />
        </div>

        <div>
          <Label>Nome Fantasia</Label>
          <Input
            value={formData.nomeFantasia}
            onChange={(e) => setFormData({...formData, nomeFantasia: e.target.value})}
            placeholder="Nome comercial"
            className="mt-1"
          />
        </div>

        <div>
          <Label>Porte</Label>
          <Select value={formData.porte} onValueChange={(val) => setFormData({...formData, porte: val})}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MEI">MEI</SelectItem>
              <SelectItem value="ME">ME - Microempresa</SelectItem>
              <SelectItem value="EPP">EPP - Empresa de Pequeno Porte</SelectItem>
              <SelectItem value="Médio">Médio Porte</SelectItem>
              <SelectItem value="Grande">Grande Porte</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Atividade Principal</Label>
          <Input
            value={formData.atividadePrincipal}
            onChange={(e) => setFormData({...formData, atividadePrincipal: e.target.value})}
            className="mt-1"
          />
        </div>

        <div>
          <Label>Situação Cadastral</Label>
          <Input
            value={formData.situacaoCadastral}
            onChange={(e) => setFormData({...formData, situacaoCadastral: e.target.value})}
            className="mt-1"
            readOnly
          />
        </div>
      </div>

      {/* Contato */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Dados de Contato
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Nome do Contato</Label>
            <Input
              value={formData.contactName}
              onChange={(e) => setFormData({...formData, contactName: e.target.value})}
              placeholder="Nome do responsável"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Cargo</Label>
            <Input
              value={formData.contactRole}
              onChange={(e) => setFormData({...formData, contactRole: e.target.value})}
              placeholder="Ex: Diretor, Gerente..."
              className="mt-1"
            />
          </div>

          <div>
            <Label>Telefone Principal</Label>
            <Input
              value={formData.phone}
              onChange={(e) => { setFormData({...formData, phone: e.target.value}); setDuplicateError(null); }}
              placeholder="(00) 00000-0000"
              className="mt-1"
            />
            {duplicateError && (
              <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-red-600 font-bold text-sm">⚠️ WhatsApp Duplicado!</span>
                </div>
                <p className="text-xs text-red-600 mt-1">{duplicateError}</p>
              </div>
            )}
          </div>

          <div>
            <Label>Telefone Secundário</Label>
            <Input
              value={formData.phoneSecondary}
              onChange={(e) => setFormData({...formData, phoneSecondary: e.target.value})}
              placeholder="(00) 00000-0000"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              placeholder="contato@empresa.com"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Website</Label>
            <Input
              value={formData.website}
              onChange={(e) => setFormData({...formData, website: e.target.value})}
              placeholder="www.empresa.com"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Endereço */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Endereço</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>CEP</Label>
            <Input
              value={formData.cep}
              onChange={(e) => setFormData({...formData, cep: e.target.value})}
              placeholder="00000-000"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Logradouro</Label>
            <Input
              value={formData.street}
              onChange={(e) => setFormData({...formData, street: e.target.value})}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Número</Label>
            <Input
              value={formData.number}
              onChange={(e) => setFormData({...formData, number: e.target.value})}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Complemento</Label>
            <Input
              value={formData.complement}
              onChange={(e) => setFormData({...formData, complement: e.target.value})}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Bairro</Label>
            <Input
              value={formData.neighborhood}
              onChange={(e) => setFormData({...formData, neighborhood: e.target.value})}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Cidade</Label>
            <Input
              value={formData.city}
              onChange={(e) => setFormData({...formData, city: e.target.value})}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Estado</Label>
            <Input
              value={formData.state}
              onChange={(e) => setFormData({...formData, state: e.target.value})}
              placeholder="UF"
              maxLength={2}
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Informações Comerciais */}
      <div>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Informações Comerciais</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Interesse</Label>
            <Select value={formData.interest} onValueChange={(val) => setFormData({...formData, interest: val})}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {INTEREST_OPTIONS.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Origem do Lead</Label>
            <Select value={formData.source} onValueChange={(val) => setFormData({...formData, source: val})}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map(option => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Nº de Funcionários</Label>
            <Input
              type="number"
              value={formData.numEmployees}
              onChange={(e) => setFormData({...formData, numEmployees: e.target.value})}
              placeholder="0"
              className="mt-1"
            />
          </div>

          <div>
            <Label>Faturamento Mensal (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.monthlyRevenue}
              onChange={(e) => setFormData({...formData, monthlyRevenue: e.target.value})}
              placeholder="0,00"
              className="mt-1"
            />
          </div>
        </div>
      </div>

      {/* Valores - Layout similar ao PF */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Valores do Negócio</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          O valor total será calculado automaticamente (Mensal × 12)
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="text-xs">Valor Mensal</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.monthlyValue}
              onChange={(e) => setFormData({...formData, monthlyValue: e.target.value})}
              placeholder="0,00"
              className="mt-1 h-9 bg-white dark:bg-gray-800"
            />
          </div>

          {(formData.monthlyValue && parseFloat(formData.monthlyValue) > 0) && (
            <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded">
              <Label className="text-xs text-green-800 dark:text-green-300">Valor Anual (calculado)</Label>
              <p className="text-lg font-bold text-green-900 dark:text-green-200">
                R$ {(parseFloat(formData.monthlyValue || 0) * 12).toFixed(2)}
              </p>
            </div>
          )}

          <div className={formData.monthlyValue && parseFloat(formData.monthlyValue) > 0 ? "col-span-2" : ""}>
            <Label className="text-xs">Ou informar valor total manualmente</Label>
            <Input
              type="number"
              step="0.01"
              value={formData.value}
              onChange={(e) => setFormData({...formData, value: e.target.value})}
              placeholder="0,00"
              className="mt-1 h-9 bg-white dark:bg-gray-800"
            />
          </div>
        </div>
      </div>

      {/* Observações */}
      <div>
        <Label>Observações</Label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({...formData, notes: e.target.value})}
          placeholder="Informações adicionais sobre a empresa..."
          rows={3}
          className="mt-1"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button 
          type="submit" 
          disabled={createLeadMutation.isPending || !formData.cnpj}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {createLeadMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Cadastrando...
            </>
          ) : (
            'Cadastrar Lead PJ'
          )}
        </Button>
      </div>
    </form>
  );
}