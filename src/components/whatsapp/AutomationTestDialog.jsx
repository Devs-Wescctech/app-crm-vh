import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  TestTube2, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Smartphone,
  Send
} from "lucide-react";
import { toast } from "sonner";

const API_BASE_URL = '/api';

async function testAutomation(params) {
  const token = localStorage.getItem('accessToken');
  const response = await fetch(`${API_BASE_URL}/whatsapp/test-automation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Erro ao testar automação');
  }
  
  return response.json();
}

export default function AutomationTestDialog({ 
  open, 
  onOpenChange, 
  automationType,
  automationId,
  templateId,
  templateName,
  accentColor = "green"
}) {
  const [testPhone, setTestPhone] = useState("");
  const [testName, setTestName] = useState("Lead de Teste");

  const testMutation = useMutation({
    mutationFn: testAutomation,
    onSuccess: (data) => {
      toast.success('Mensagem de teste enviada com sucesso!');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Erro ao enviar teste: ${error.message}`);
    },
  });

  const handleTest = () => {
    if (!testPhone) {
      toast.error('Informe o número de telefone para teste');
      return;
    }

    testMutation.mutate({
      automationType,
      automationId,
      testPhone: testPhone.replace(/\D/g, ''),
      templateId,
      sampleData: {
        name: testName,
        email: 'teste@exemplo.com',
      },
    });
  };

  const formatPhone = (value) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const accentClasses = {
    green: "bg-green-600 hover:bg-green-700",
    yellow: "bg-yellow-600 hover:bg-yellow-700",
    indigo: "bg-indigo-600 hover:bg-indigo-700",
    blue: "bg-blue-600 hover:bg-blue-700"
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TestTube2 className="w-5 h-5 text-purple-600" />
            Testar Automação
          </DialogTitle>
          <DialogDescription>
            Envie uma mensagem de teste para verificar se a automação está funcionando corretamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {templateId ? (
            <Alert className="bg-green-50 border-green-200">
              <MessageSquare className="w-4 h-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Template selecionado:</strong> {templateName || templateId}
              </AlertDescription>
            </Alert>
          ) : (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                Nenhum template selecionado. Selecione um template primeiro.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="testPhone">
              <Smartphone className="w-4 h-4 inline mr-1" />
              Telefone para Teste *
            </Label>
            <Input
              id="testPhone"
              placeholder="(11) 99999-9999"
              value={testPhone}
              onChange={(e) => setTestPhone(formatPhone(e.target.value))}
              maxLength={15}
            />
            <p className="text-xs text-gray-500">
              A mensagem será enviada para este número via WhatsApp
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="testName">Nome do Lead de Teste</Label>
            <Input
              id="testName"
              placeholder="Nome de exemplo"
              value={testName}
              onChange={(e) => setTestName(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Este nome será usado nas variáveis do template
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleTest}
            disabled={!templateId || !testPhone || testMutation.isPending}
            className={accentClasses[accentColor]}
          >
            {testMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Teste
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
