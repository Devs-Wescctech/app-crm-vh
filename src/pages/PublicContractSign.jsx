import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, FileText, Calendar, DollarSign, Clock, Loader2, Building2, Pen, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import SignaturePad from "../components/ticket/SignaturePad";

export default function PublicContractSign() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  const [contract, setContract] = useState(null);
  const [lead, setLead] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showSignature, setShowSignature] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token de acesso não fornecido');
      setIsLoading(false);
      return;
    }

    const fetchContract = async () => {
      try {
        const response = await fetch(`${window.location.origin}/api/functions/getPublicContract?token=${token}`);
        const data = await response.json();
        
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Erro ao carregar contrato');
        }
        
        setContract(data.contract);
        setLead(data.lead);
        
        if (data.contract?.signature_url) {
          setSigned(true);
        }
        
        setIsLoading(false);
      } catch (err) {
        console.error('Erro:', err);
        setError(err.message);
        setIsLoading(false);
      }
    };

    fetchContract();
  }, [token]);

  const handleSaveSignature = async (signatureDataUrl) => {
    setSigning(true);
    try {
      const response = await fetch(`${window.location.origin}/api/functions/signContract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          signatureDataUrl,
        }),
      });

      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao salvar assinatura');
      }

      setSigned(true);
      setShowSignature(false);
      setContract(prev => ({
        ...prev,
        signature_url: data.signatureUrl,
        signed_at: new Date().toISOString(),
      }));
    } catch (err) {
      console.error('Erro:', err);
      alert('Erro ao salvar assinatura. Tente novamente.');
    }
    setSigning(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
            <p className="text-gray-600">Carregando contrato...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Erro ao Carregar</h2>
            <p className="text-gray-600">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <Card className="w-full max-w-lg shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6" />
              Contrato Assinado com Sucesso!
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 text-center space-y-6">
            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
              <CheckCircle className="w-20 h-20 text-green-600 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-green-900 mb-2">
                Obrigado, {lead?.name}!
              </h3>
              <p className="text-green-800 text-lg">
                Sua assinatura foi registrada com sucesso.
              </p>
            </div>

            {contract?.signature_url && (
              <div className="bg-gray-50 rounded-lg p-4 border">
                <p className="text-sm text-gray-600 mb-2">Sua assinatura:</p>
                <img 
                  src={contract.signature_url} 
                  alt="Assinatura" 
                  className="max-h-24 mx-auto border rounded bg-white p-2"
                />
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
              <p className="text-sm text-blue-800 font-semibold mb-2">Proximos passos:</p>
              <ul className="space-y-1 text-sm text-blue-700">
                <li>• Voce recebera uma copia do contrato por e-mail</li>
                <li>• Nossa equipe entrara em contato para confirmar</li>
                <li>• O servico sera ativado apos confirmacao do pagamento</li>
              </ul>
            </div>

            <p className="text-sm text-gray-500">
              Assinado em {format(new Date(contract?.signed_at || new Date()), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Building2 className="w-12 h-12 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">SalesTwo</h1>
                <p className="text-gray-600">Plano Funeral</p>
              </div>
            </div>
            <Badge className="bg-blue-600 text-white px-6 py-2 text-lg">
              <FileText className="w-5 h-5 mr-2" />
              Contrato para Assinatura
            </Badge>
          </div>
        </div>

        <Card className="shadow-xl mb-6">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 text-white">
            <CardTitle>Dados do Cliente</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Nome</p>
                <p className="font-semibold text-gray-900">{lead?.name || 'Nao informado'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Telefone</p>
                <p className="font-semibold text-gray-900">{lead?.phone || 'Nao informado'}</p>
              </div>
              {lead?.cpf && (
                <div>
                  <p className="text-sm text-gray-500">CPF</p>
                  <p className="font-semibold text-gray-900">{lead.cpf}</p>
                </div>
              )}
              {lead?.email && (
                <div>
                  <p className="text-sm text-gray-500">E-mail</p>
                  <p className="font-semibold text-gray-900">{lead.email}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {contract?.proposal_url && (
          <Card className="shadow-xl mb-6">
            <CardHeader className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Proposta Comercial
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Visualize a proposta antes de assinar:</p>
                  <p className="font-medium text-gray-900">{contract.product_name || 'Plano Contratado'}</p>
                </div>
                <a 
                  href={contract.proposal_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Ver Proposta
                </a>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-xl mb-6">
          <CardHeader className="bg-gradient-to-r from-green-600 to-emerald-600 text-white">
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5" />
              Valor do Plano
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Investimento Mensal</p>
              <p className="text-4xl font-bold text-green-600">
                R$ {parseFloat(contract?.price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              {contract?.payment_due_day && (
                <p className="text-sm text-gray-600 mt-2">
                  Vencimento: dia {contract.payment_due_day} de cada mes
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {showSignature ? (
          <div className="mb-6">
            <SignaturePad 
              onSave={handleSaveSignature}
              onCancel={() => setShowSignature(false)}
            />
            {signing && (
              <div className="mt-4 text-center">
                <Loader2 className="w-6 h-6 mx-auto animate-spin text-blue-600" />
                <p className="text-gray-600 mt-2">Salvando assinatura...</p>
              </div>
            )}
          </div>
        ) : (
          <Card className="shadow-xl">
            <CardContent className="p-8 text-center">
              <Pen className="w-16 h-16 mx-auto mb-4 text-blue-600" />
              <h3 className="text-xl font-bold text-gray-900 mb-2">Assinar Contrato</h3>
              <p className="text-gray-600 mb-6">
                Ao assinar, voce concorda com os termos e condicoes do plano contratado.
              </p>
              <Button 
                size="lg"
                onClick={() => setShowSignature(true)}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                <Pen className="w-5 h-5 mr-2" />
                Iniciar Assinatura Digital
              </Button>
              
              <Alert className="mt-6 bg-amber-50 border-amber-200 text-left">
                <AlertCircle className="w-4 h-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  Sua assinatura digital tem validade juridica conforme a Lei 14.063/2020 (assinatura eletronica).
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        )}

        <div className="text-center mt-6 text-sm text-gray-500">
          <p>Em caso de duvidas, entre em contato com nosso suporte.</p>
        </div>
      </div>
    </div>
  );
}
