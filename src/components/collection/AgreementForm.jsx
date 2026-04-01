import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Calendar, CreditCard, FileText, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AgreementForm({ ticket, onSubmit, onCancel, isSubmitting }) {
  const [agreementData, setAgreementData] = useState({
    collection_agreement_value: '',
    collection_agreement_terms: '',
    collection_payment_method: '',
    collection_installments: 1,
    collection_agreement_notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!agreementData.collection_agreement_value) {
      alert('Valor do acordo é obrigatório');
      return;
    }
    
    if (!agreementData.collection_payment_method) {
      alert('Forma de pagamento é obrigatória');
      return;
    }

    onSubmit({
      ...agreementData,
      collection_agreement_value: parseFloat(agreementData.collection_agreement_value),
      collection_agreement_date: new Date().toISOString(),
    });
  };

  let debtValue = 0;
  try {
    const desc = JSON.parse(ticket.description || '{}');
    debtValue = desc.debt_value || 0;
  } catch {}

  return (
    <Card className="border-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20">
      <CardHeader className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5" />
          Registrar Acordo de Cobrança
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200">
            <AlertDescription className="text-yellow-800 dark:text-yellow-300">
              📊 <strong>Valor da Dívida Atual:</strong> R$ {debtValue.toFixed(2).replace('.', ',')}
            </AlertDescription>
          </Alert>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Valor do Acordo *
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={agreementData.collection_agreement_value}
                onChange={(e) => setAgreementData({
                  ...agreementData,
                  collection_agreement_value: e.target.value
                })}
                className="mt-1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">
                Valor total que o cliente vai pagar
              </p>
            </div>

            <div>
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Número de Parcelas
              </Label>
              <Input
                type="number"
                min="1"
                max="36"
                value={agreementData.collection_installments}
                onChange={(e) => setAgreementData({
                  ...agreementData,
                  collection_installments: parseInt(e.target.value) || 1
                })}
                className="mt-1"
              />
              {agreementData.collection_agreement_value && agreementData.collection_installments > 1 && (
                <p className="text-xs text-gray-600 mt-1">
                  {agreementData.collection_installments}x de R$ {
                    (parseFloat(agreementData.collection_agreement_value) / agreementData.collection_installments)
                      .toFixed(2)
                      .replace('.', ',')
                  }
                </p>
              )}
            </div>
          </div>

          <div>
            <Label className="flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              Forma de Pagamento *
            </Label>
            <Select 
              value={agreementData.collection_payment_method}
              onValueChange={(val) => setAgreementData({
                ...agreementData,
                collection_payment_method: val
              })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="boleto">Boleto Bancário</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                <SelectItem value="debito_automatico">Débito Automático</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Termos do Acordo</Label>
            <Textarea
              placeholder="Ex: Pagamento em 6x sem juros, vencimento dia 10 de cada mês..."
              value={agreementData.collection_agreement_terms}
              onChange={(e) => setAgreementData({
                ...agreementData,
                collection_agreement_terms: e.target.value
              })}
              rows={3}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              placeholder="Observações adicionais sobre o acordo..."
              value={agreementData.collection_agreement_notes}
              onChange={(e) => setAgreementData({
                ...agreementData,
                collection_agreement_notes: e.target.value
              })}
              rows={3}
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
              disabled={isSubmitting || !agreementData.collection_agreement_value || !agreementData.collection_payment_method}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Registrando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Registrar Acordo e Enviar para Efetivação
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}