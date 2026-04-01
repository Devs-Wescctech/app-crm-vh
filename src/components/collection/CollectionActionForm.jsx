import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Calendar, XCircle, CheckCircle, Clock, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ACTION_TYPES = {
  contact_attempt: {
    label: "Tentativa de Contato",
    icon: Phone,
    color: "orange",
    results: [
      { value: "no_answer", label: "Não atendeu" },
      { value: "wrong_number", label: "Número errado" },
      { value: "voicemail", label: "Caixa postal" },
      { value: "contact_made", label: "Contato realizado" },
    ]
  },
  information: {
    label: "Informação sobre Débito",
    icon: MessageSquare,
    color: "blue",
    results: [
      { value: "informed", label: "Cliente foi informado" },
      { value: "already_aware", label: "Cliente já estava ciente" },
      { value: "disputed_debt", label: "Cliente contestou o débito" },
    ]
  },
  payment_promise: {
    label: "Promessa de Pagamento",
    icon: CheckCircle,
    color: "green",
    results: [
      { value: "promised_full", label: "Prometeu pagar valor total" },
      { value: "promised_partial", label: "Prometeu pagar parcialmente" },
      { value: "promised_date", label: "Prometeu pagar em data específica" },
    ]
  },
  schedule_callback: {
    label: "Agendar Retorno",
    icon: Calendar,
    color: "purple",
    results: [
      { value: "customer_requested", label: "Cliente pediu para retornar" },
      { value: "better_time", label: "Melhor horário para contato" },
    ]
  },
  refusal: {
    label: "Recusa de Pagamento",
    icon: XCircle,
    color: "red",
    results: [
      { value: "cannot_pay", label: "Não pode pagar no momento" },
      { value: "refuses_to_pay", label: "Se recusa a pagar" },
      { value: "financial_difficulty", label: "Dificuldade financeira" },
    ]
  },
};

export default function CollectionActionForm({ ticket, onSubmit, onCancel, isSubmitting }) {
  const [actionType, setActionType] = useState("");
  const [result, setResult] = useState("");
  const [notes, setNotes] = useState("");
  const [promisedDate, setPromisedDate] = useState("");
  const [promisedAmount, setPromisedAmount] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!actionType) {
      alert('Selecione o tipo de ação');
      return;
    }
    
    if (!result) {
      alert('Selecione o resultado');
      return;
    }

    const actionData = {
      action_type: actionType,
      result,
      notes,
      timestamp: new Date().toISOString(),
    };

    if (actionType === 'payment_promise') {
      if (promisedDate) actionData.promised_date = promisedDate;
      if (promisedAmount) actionData.promised_amount = parseFloat(promisedAmount);
    }

    onSubmit(actionData);
  };

  const selectedType = actionType ? ACTION_TYPES[actionType] : null;

  return (
    <Card className="border-2 border-orange-200 bg-orange-50 dark:bg-orange-950/20">
      <CardHeader className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <Phone className="w-5 h-5" />
          Registrar Ação de Cobrança
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200">
            <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
              ℹ️ Use este formulário para registrar contatos, informações, promessas de pagamento e outras ações.
              <br />
              <strong>Para registrar um ACORDO, use o botão "Registrar Acordo".</strong>
            </AlertDescription>
          </Alert>

          <div>
            <Label>Tipo de Ação *</Label>
            <Select value={actionType} onValueChange={(val) => {
              setActionType(val);
              setResult("");
            }}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione o tipo de ação..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ACTION_TYPES).map(([key, type]) => {
                  const Icon = type.icon;
                  return (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedType && (
            <div>
              <Label>Resultado *</Label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o resultado..." />
                </SelectTrigger>
                <SelectContent>
                  {selectedType.results.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {actionType === 'payment_promise' && (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Data Prometida</Label>
                <input
                  type="date"
                  value={promisedDate}
                  onChange={(e) => setPromisedDate(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-md"
                />
              </div>
              <div>
                <Label>Valor Prometido (opcional)</Label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={promisedAmount}
                  onChange={(e) => setPromisedAmount(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border rounded-md"
                />
              </div>
            </div>
          )}

          <div>
            <Label>Observações / Detalhes</Label>
            <Textarea
              placeholder="Descreva o contato realizado, informações trocadas, etc..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="mt-1"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !actionType || !result}
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <Phone className="w-4 h-4 mr-2" />
                  Registrar Ação
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}