import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Loader2, BrainCircuit } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";

export default function AISummaryButton({ entityType, entityId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  const handleGenerateSummary = async () => {
    setIsLoading(true);
    setSummaryData(null);
    try {
      const response = await base44.functions.invoke('ai_assistant', {
        action: 'summarize_case',
        entity_type: entityType,
        entity_id: entityId
      });
      setSummaryData(response.data);
    } catch (error) {
      console.error("Erro ao gerar resumo:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (open && !summaryData) {
        handleGenerateSummary();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800">
          <Sparkles className="w-4 h-4" />
          Resumir com IA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <BrainCircuit className="w-5 h-5" />
            Resumo Inteligente do Caso
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-purple-600" />
              <p className="text-sm">Analisando histórico e gerando insights...</p>
            </div>
          ) : summaryData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Pontos Chave:</h4>
                <ul className="space-y-2">
                  {summaryData.summary_points?.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm bg-gray-50 dark:bg-gray-800 p-2 rounded-md">
                      <span className="text-purple-500 mt-0.5">•</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Sentimento</span>
                  <div className="mt-1">
                    <Badge variant={
                      summaryData.sentiment === 'positivo' ? 'success' : 
                      summaryData.sentiment === 'negativo' ? 'destructive' : 'secondary'
                    }>
                      {summaryData.sentiment?.toUpperCase()}
                    </Badge>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-medium text-gray-500 uppercase">Próximo Passo Sugerido</span>
                  <p className="text-sm font-medium text-purple-700 dark:text-purple-400 mt-1">
                    {summaryData.suggested_action}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-red-500">
              Erro ao gerar resumo. Tente novamente.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}