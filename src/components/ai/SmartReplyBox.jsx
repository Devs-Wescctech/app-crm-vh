import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, MessageSquarePlus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SmartReplyBox({ ticketId, onSelectReply }) {
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const generateSuggestions = async () => {
    setIsLoading(true);
    setIsOpen(true);
    try {
      const response = await base44.functions.invoke('ai_assistant', {
        action: 'generate_smart_reply',
        ticket_id: ticketId
      });
      
      if (response.data?.suggestions) {
        setSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error("Erro ao gerar respostas:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={generateSuggestions}
        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        Sugestões de Resposta (IA)
      </Button>
    );
  }

  return (
    <div className="mb-3 border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
          <Sparkles className="w-4 h-4" />
          Sugestões do Copiloto
        </div>
        <Button 
          variant="ghost" 
          size="xs" 
          onClick={() => setIsOpen(false)} 
          className="h-6 w-6 p-0"
        >
          ×
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span className="ml-2 text-sm text-gray-500">Gerando respostas...</span>
        </div>
      ) : (
        <div className="grid gap-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => {
                onSelectReply(suggestion.text);
                setIsOpen(false);
              }}
              className="text-left p-2 hover:bg-white dark:hover:bg-gray-800 rounded border border-transparent hover:border-blue-200 dark:hover:border-blue-800 transition-all group"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded">
                  {suggestion.label}
                </span>
                <MessageSquarePlus className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                {suggestion.text}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}