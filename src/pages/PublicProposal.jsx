import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, FileText, Calendar, DollarSign, Clock, Loader2, MessageSquare, Building2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function PublicProposal() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  const [lead, setLead] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [responding, setResponding] = useState(false);
  const [responseSubmitted, setResponseSubmitted] = useState(false);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('Token não fornecido');
      setIsLoading(false);
      return;
    }

    // Buscar dados da proposta via função backend
    const fetchProposal = async () => {
      try {
        // Usar URL absoluta para garantir que funciona
        const functionUrl = `${window.location.origin}/api/functions/getPublicProposal?token=${token}`;
        console.log('Fetching proposal from:', functionUrl);
        
        const response = await fetch(functionUrl);
        const data = await response.json();
        
        console.log('Response:', data);
        
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Erro ao carregar proposta');
        }
        
        setLead(data.lead);
        setIsLoading(false);
      } catch (err) {
        console.error('Erro:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchProposal();
  }, [token]);

  const handleResponse = async (accepted) => {
    if (responding) return;
    
    setResponding(true);
    try {
      const functionUrl = `${window.location.origin}/api/functions/respondProposal`;
      console.log('Responding to:', functionUrl);
      
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          accepted,
        }),
      });

      const data = await response.json();
      
      console.log('Response data:', data);
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao processar resposta');
      }

      setResponseSubmitted(true);
      setResponse(data);
      
      // Atualizar lead local
      setLead(prev => ({
        ...prev,
        proposal_status: accepted ? 'accepted' : 'rejected',
        proposal_responded_at: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Erro:', error);
      alert('Erro ao registrar resposta. Tente novamente.');
    }
    setResponding(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando proposta...</p>
        </div>
      </div>
    );
  }

  if (error || !lead) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <Card className="max-w-md w-full shadow-2xl">
          <CardHeader className="bg-red-600 text-white">
            <CardTitle className="flex items-center gap-2">
              <XCircle className="w-6 h-6" />
              Proposta não encontrada
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <p className="text-gray-700 mb-4">
              {error || 'Esta proposta não existe ou o link expirou.'}
            </p>
            <p className="text-sm text-gray-500">
              Entre em contato com nosso time de vendas para mais informações.
            </p>
            <div className="mt-4 p-3 bg-gray-100 rounded text-xs font-mono break-all">
              Token: {token}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verificar se já foi respondida
  const alreadyResponded = lead.proposal_status === 'accepted' || lead.proposal_status === 'rejected';
  const wasAccepted = lead.proposal_status === 'accepted';

  if (responseSubmitted || alreadyResponded) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="max-w-2xl w-full shadow-2xl">
          <CardHeader className={`${wasAccepted || response?.accepted ? 'bg-green-600' : 'bg-gray-600'} text-white`}>
            <CardTitle className="flex items-center gap-2">
              {wasAccepted || response?.accepted ? (
                <>
                  <CheckCircle className="w-6 h-6" />
                  Proposta Aceita! 🎉
                </>
              ) : (
                <>
                  <XCircle className="w-6 h-6" />
                  Proposta Recusada
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {wasAccepted || response?.accepted ? (
              <>
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 text-center">
                  <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-green-900 mb-2">
                    Obrigado, {lead.name}!
                  </h3>
                  <p className="text-green-800 text-lg mb-4">
                    Sua aceitação foi registrada com sucesso!
                  </p>
                  <p className="text-gray-700">
                    Nossa equipe entrará em contato em breve para finalizar o processo e enviar o contrato.
                  </p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    <strong>Próximos passos:</strong>
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-blue-700 ml-6">
                    <li>• Você receberá uma ligação de confirmação</li>
                    <li>• Enviaremos o contrato para assinatura</li>
                    <li>• O serviço será ativado após a confirmação</li>
                  </ul>
                </div>
              </>
            ) : (
              <>
                <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-6 text-center">
                  <XCircle className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">
                    Proposta Recusada
                  </h3>
                  <p className="text-gray-700 mb-4">
                    Agradecemos pelo seu tempo em analisar nossa proposta.
                  </p>
                  <p className="text-gray-600">
                    Se mudar de ideia ou tiver alguma dúvida, nossa equipe está à disposição!
                  </p>
                </div>
              </>
            )}
            
            <div className="text-center text-sm text-gray-500">
              <p>Respondido em {format(new Date(lead.proposal_responded_at || new Date()), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Building2 className="w-12 h-12 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">SalesTwo</h1>
                <p className="text-gray-600">Vendas B2B</p>
              </div>
            </div>
            <Badge className="bg-blue-600 text-white px-6 py-2 text-lg">
              <FileText className="w-5 h-5 mr-2" />
              Proposta Comercial
            </Badge>
          </div>
        </div>

        {/* Dados do Cliente */}
        <Card className="shadow-xl mb-6">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <CardTitle>Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Nome</p>
                <p className="font-semibold text-gray-900">{lead.name || 'Não informado'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Telefone</p>
                <p className="font-semibold text-gray-900">{lead.phone || 'Não informado'}</p>
              </div>
              {lead.email && (
                <div>
                  <p className="text-sm text-gray-500">E-mail</p>
                  <p className="font-semibold text-gray-900">{lead.email}</p>
                </div>
              )}
              {lead.address && (
                <div className="md:col-span-2">
                  <p className="text-sm text-gray-500">Endereço</p>
                  <p className="font-semibold text-gray-900">{lead.address}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Produto */}
        <Card className="shadow-xl mb-6">
          <CardHeader className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
            <CardTitle>Produto de Interesse</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="bg-purple-50 rounded-lg p-4 mb-4">
              <h3 className="text-xl font-bold text-purple-900">{lead.interest || 'Produto / Serviço'}</h3>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <span className="text-gray-700">Cobertura Nacional</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <span className="text-gray-700">Assistência 24h por dia</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <span className="text-gray-700">Transporte e translado inclusos</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <span className="text-gray-700">Cerimonial completo</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <span className="text-gray-700">Documentação inclusa</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                <span className="text-gray-700">Até 5 dependentes</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Valores */}
        <Card className="shadow-xl mb-6">
          <CardHeader className="bg-gradient-to-r from-green-600 to-green-700 text-white">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-6 h-6" />
              Valores e Condições
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="bg-green-50 rounded-lg p-6 mb-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700 text-lg">Valor Mensal:</span>
                <span className="text-3xl font-bold text-green-700">
                  R$ {(lead.deal_value || 0).toFixed(2).replace('.', ',')}
                </span>
              </div>
            </div>
            <div className="space-y-3 text-gray-700">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span><strong>Forma de Pagamento:</strong> Boleto ou Débito Automático</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span><strong>Vencimento:</strong> Todo dia 10</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Validade */}
        <Card className="shadow-xl mb-6 border-2 border-orange-300">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 text-orange-700">
              <Clock className="w-6 h-6" />
              <div>
                <p className="font-semibold">Proposta válida por 7 dias</p>
                <p className="text-sm text-gray-600">
                  Enviada em {format(new Date(lead.proposal_sent_at || lead.created_date), "dd/MM/yyyy", { locale: ptBR })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Botões de Ação */}
        <div className="grid md:grid-cols-2 gap-4">
          <Button
            onClick={() => handleResponse(true)}
            disabled={responding}
            className="h-16 text-lg bg-green-600 hover:bg-green-700 text-white shadow-lg"
          >
            {responding ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <CheckCircle className="w-6 h-6 mr-2" />
                Aceitar Proposta
              </>
            )}
          </Button>
          
          <Button
            onClick={() => handleResponse(false)}
            disabled={responding}
            variant="outline"
            className="h-16 text-lg border-2 border-red-300 text-red-700 hover:bg-red-50 shadow-lg"
          >
            {responding ? (
              <>
                <Loader2 className="w-6 h-6 mr-2 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <XCircle className="w-6 h-6 mr-2" />
                Recusar Proposta
              </>
            )}
          </Button>
        </div>

        {/* Termos */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p className="mb-2">* Carência de 30 dias para sinistros</p>
          <p className="mb-2">* Valores sujeitos a reajuste anual conforme legislação</p>
          <p className="mt-4">SalesTwo - Vendas B2B</p>
        </div>
      </div>
    </div>
  );
}