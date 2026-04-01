import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BrainCircuit, Loader2, ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export default function TicketClassifier({ subject, description, onClassify }) {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleClassify = async () => {
    if (!subject && !description) return;
    
    setIsLoading(true);
    setResult(null);
    try {
      const response = await base44.functions.invoke('ai_assistant', {
        action: 'classify_ticket',
        subject,
        description
      });
      
      setResult(response.data);
    } catch (error) {
      console.error("Erro ao classificar:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyClassification = () => {
    if (result && onClassify) {
      onClassify(result);
      setResult(null); // Limpa após aplicar
    }
  };

  return (
    <div className="mt-2">
      {!result ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClassify}
          disabled={isLoading || (!subject && !description)}
          className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <BrainCircuit className="w-4 h-4 mr-2" />
          )}
          {isLoading ? "Analisando..." : "Sugerir Classificação com IA"}
        </Button>
      ) : (
        <Alert className="bg-indigo-50 border-indigo-200 dark:bg-indigo-950 dark:border-indigo-800">
          <BrainCircuit className="w-4 h-4 text-indigo-600" />
          <AlertTitle className="text-indigo-900 dark:text-indigo-100 font-semibold">
            Sugestão da IA
          </AlertTitle>
          <AlertDescription className="mt-2">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <span className="text-xs text-gray-500">Prioridade</span>
                <p className="font-medium text-indigo-700">{result.priority}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Fila Sugerida</span>
                <p className="font-medium text-indigo-700">{result.suggested_queue}</p>
              </div>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 italic mb-3">
              "{result.reasoning}"
            </p>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={applyClassification}
                className="bg-indigo-600 hover:bg-indigo-700 text-white h-8"
              >
                Aplicar Sugestão <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={() => setResult(null)}
                className="h-8"
              >
                Descartar
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}