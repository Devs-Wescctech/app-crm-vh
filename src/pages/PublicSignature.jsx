import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import SignaturePad from "../components/ticket/SignaturePad";

export default function PublicSignature() {
  const urlParams = new URLSearchParams(window.location.search);
  const pathSegments = window.location.pathname.split('/');
  const token = pathSegments[pathSegments.length - 1];
  
  const [signatureSaved, setSignatureSaved] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['publicTicket', token],
    queryFn: async () => {
      const tickets = await base44.entities.Ticket.list();
      return tickets.find(t => t.signature_link_token === token);
    },
    enabled: !!token,
  });

  const saveSignatureMutation = useMutation({
    mutationFn: async (signatureDataUrl) => {
      // Converter data URL para Blob
      const response = await fetch(signatureDataUrl);
      const blob = await response.blob();
      const file = new File([blob], `assinatura_${ticket.id}.png`, { type: 'image/png' });

      // Upload da imagem
      const uploadResult = await base44.integrations.Core.UploadFile({ file });
      
      // Atualizar ticket
      await base44.entities.Ticket.update(ticket.id, {
        signature_url: uploadResult.file_url,
        signature_date: new Date().toISOString(),
        signature_method: 'link_whatsapp',
      });

      // Registrar na timeline
      await base44.entities.TicketMessage.create({
        ticket_id: ticket.id,
        message_type: 'system_event',
        author_email: 'sistema@salestwo.com.br',
        body: 'Assinatura realizada via link do WhatsApp',
        channel: ticket.channel,
      });

      return uploadResult;
    },
    onSuccess: () => {
      setSignatureSaved(true);
    },
  });

  const handleSaveSignature = async (dataUrl) => {
    setUploading(true);
    try {
      await saveSignatureMutation.mutateAsync(dataUrl);
    } catch (error) {
      console.error('Erro ao salvar assinatura:', error);
      alert('Erro ao salvar assinatura. Tente novamente.');
    }
    setUploading(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
            <p className="text-gray-600">Carregando...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12">
            <Alert variant="destructive">
              <AlertCircle className="w-5 h-5" />
              <AlertDescription className="text-lg">
                Link inválido ou ticket não encontrado.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (ticket.signature_url) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12">
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <AlertDescription className="text-lg text-yellow-800">
                Este ticket já foi assinado anteriormente.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (signatureSaved) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">
              Assinatura Registrada!
            </h1>
            <p className="text-gray-600 text-lg">
              Sua assinatura foi salva com sucesso.
            </p>
            <p className="text-gray-500 mt-2">
              Você pode fechar esta janela.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (uploading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl">
          <CardContent className="p-12 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-blue-600" />
            <p className="text-gray-600 text-lg">Salvando assinatura...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            SalesTwo - Vendas B2B
          </h1>
          <p className="text-gray-600">
            Ticket #{ticket.id.slice(0, 8)} - {ticket.subject}
          </p>
        </div>

        <SignaturePad
          onSave={handleSaveSignature}
          onCancel={() => window.close()}
        />

        <div className="mt-6 text-center text-sm text-gray-600">
          <p>⚠️ Ao assinar, você confirma o recebimento do atendimento</p>
          <p className="mt-1">📱 Após salvar, você pode fechar esta janela</p>
        </div>
      </div>
    </div>
  );
}