import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getTemplatesByToken } from "@/api/channelApi";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  MessageSquare, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Search,
  Eye,
  Smartphone,
  ExternalLink
} from "lucide-react";

export default function WhatsAppTemplateSelectorByToken({ 
  open, 
  onOpenChange, 
  selectedTemplateId, 
  onSelect,
  channelToken,
  accentColor = "orange"
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const { data: templates = [], isLoading, isError, error } = useQuery({
    queryKey: ['whatsappTemplatesByToken', channelToken],
    queryFn: () => getTemplatesByToken(channelToken),
    staleTime: 5 * 60 * 1000,
    enabled: !!channelToken && open,
  });

  const filteredTemplates = Array.isArray(templates) 
    ? templates.filter(t => {
        const searchText = (t.description || t.name || t.id || '').toLowerCase();
        return searchText.includes(searchQuery.toLowerCase());
      })
    : [];

  const getTemplateBody = (template) => {
    if (template.dynamicComponents) {
      const bodyComponent = template.dynamicComponents.find(c => c.type === 'BODY');
      if (bodyComponent?.text) return bodyComponent.text;
    }
    if (template.staticComponents) {
      const bodyComponent = template.staticComponents.find(c => c.type === 'BODY');
      if (bodyComponent?.text) return bodyComponent.text;
    }
    if (template.components) {
      const bodyComponent = template.components.find(c => c.type === 'BODY' || c.type === 'body');
      if (bodyComponent?.text) return bodyComponent.text;
    }
    if (template.body) return template.body;
    if (template.text) return template.text;
    if (template.message) return template.message;
    if (template.content) return template.content;
    if (template.template?.body) return template.template.body;
    if (template.template?.text) return template.template.text;
    if (template.quickAnswerBody) return template.quickAnswerBody;
    if (template.quickAnswer?.body) return template.quickAnswer.body;
    return null;
  };

  const getTemplateHeader = (template) => {
    if (template.staticComponents) {
      const headerComponent = template.staticComponents.find(c => c.type === 'HEADER');
      if (headerComponent?.text) return headerComponent.text;
    }
    if (template.components) {
      const headerComponent = template.components.find(c => c.type === 'HEADER' || c.type === 'header');
      if (headerComponent?.text) return headerComponent.text;
    }
    if (template.header) return template.header;
    return null;
  };

  const getTemplateFooter = (template) => {
    if (template.staticComponents) {
      const footerComponent = template.staticComponents.find(c => c.type === 'FOOTER');
      if (footerComponent?.text) return footerComponent.text;
    }
    if (template.components) {
      const footerComponent = template.components.find(c => c.type === 'FOOTER' || c.type === 'footer');
      if (footerComponent?.text) return footerComponent.text;
    }
    if (template.footer) return template.footer;
    return null;
  };

  const getTemplateButtons = (template) => {
    if (template.staticComponents) {
      const buttonsComponent = template.staticComponents.find(c => c.type === 'BUTTONS');
      if (buttonsComponent?.buttons) return buttonsComponent.buttons;
    }
    if (template.dynamicComponents) {
      const buttonsComponent = template.dynamicComponents.find(c => c.type === 'BUTTONS');
      if (buttonsComponent?.buttons) return buttonsComponent.buttons;
    }
    if (template.components) {
      const buttonsComponent = template.components.find(c => c.type === 'BUTTONS' || c.type === 'buttons');
      if (buttonsComponent?.buttons) return buttonsComponent.buttons;
    }
    if (template.buttons) return template.buttons;
    return [];
  };

  const renderTemplatePreview = (template) => {
    const header = getTemplateHeader(template);
    const body = getTemplateBody(template);
    const footer = getTemplateFooter(template);
    const buttons = getTemplateButtons(template);
    const hasContent = header || body || footer || (buttons && buttons.length > 0);

    return (
      <div className="bg-gradient-to-b from-green-700 to-green-800 rounded-3xl p-3 max-w-[300px] mx-auto shadow-lg">
        <div className="flex items-center justify-between mb-2 px-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-gray-600" />
            </div>
            <span className="text-white text-sm font-medium">WhatsApp</span>
          </div>
          <Smartphone className="w-4 h-4 text-white/70" />
        </div>
        
        <div className="bg-[#e5ddd5] rounded-2xl p-3 min-h-[200px]">
          {hasContent ? (
            <div className="bg-white rounded-lg p-3 shadow-sm max-w-[90%] ml-auto space-y-2">
              {header && (
                <div className="font-bold text-gray-900 text-sm border-b pb-1 mb-1">
                  {header}
                </div>
              )}
              {body ? (
                <div className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                  {body}
                </div>
              ) : (
                <div className="text-gray-400 text-sm italic">
                  (Conteudo do template)
                </div>
              )}
              {footer && (
                <div className="text-gray-500 text-xs mt-2 pt-1 border-t">
                  {footer}
                </div>
              )}
              {buttons && buttons.length > 0 && (
                <div className="pt-2 space-y-1 border-t mt-2">
                  {buttons.map((btn, idx) => (
                    <div 
                      key={idx} 
                      className="text-center text-blue-600 text-sm py-1.5 bg-gray-50 rounded flex items-center justify-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {btn.text || btn.title || 'Botao'}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-right">
                <span className="text-[10px] text-gray-400">12:00</span>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 shadow-sm max-w-[90%] ml-auto">
              <div className="text-center text-gray-400">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Previa nao disponivel</p>
                <p className="text-xs mt-1">Template: {template.description || template.id}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const accentClasses = {
    orange: {
      badge: "bg-orange-100 text-orange-800",
      selected: "border-orange-500 bg-orange-50",
      button: "bg-orange-600 hover:bg-orange-700",
      icon: "text-orange-600",
      ring: "ring-orange-300"
    },
    amber: {
      badge: "bg-amber-100 text-amber-800",
      selected: "border-amber-500 bg-amber-50",
      button: "bg-amber-600 hover:bg-amber-700",
      icon: "text-amber-600",
      ring: "ring-amber-300"
    },
    green: {
      badge: "bg-green-100 text-green-800",
      selected: "border-green-500 bg-green-50",
      button: "bg-green-600 hover:bg-green-700",
      icon: "text-green-600",
      ring: "ring-green-300"
    }
  };

  const colors = accentClasses[accentColor] || accentClasses.orange;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <MessageSquare className={`w-5 h-5 ${colors.icon}`} />
            Templates do Canal
          </SheetTitle>
          <SheetDescription>
            Selecione um template disponivel neste canal para enviar mensagens automaticas.
          </SheetDescription>
        </SheetHeader>

        {!channelToken ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <AlertCircle className="w-10 h-10 text-gray-400 mb-2" />
            <p className="text-gray-600 font-medium">Token do canal nao configurado</p>
            <p className="text-gray-500 text-sm mt-1">
              Configure o token do canal antes de selecionar templates.
            </p>
          </div>
        ) : (
          <>
            <div className="relative mt-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex-1 mt-4 overflow-hidden">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48">
                  <Loader2 className={`w-8 h-8 animate-spin ${colors.icon}`} />
                  <p className="mt-2 text-gray-600">Carregando templates do canal...</p>
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <AlertCircle className="w-10 h-10 text-red-400 mb-2" />
                  <p className="text-red-600 font-medium">Erro ao buscar templates</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {error?.message || "Verifique se o token do canal esta correto."}
                  </p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center px-4">
                  <AlertCircle className="w-10 h-10 text-gray-400 mb-2" />
                  <p className="text-gray-600 font-medium">Nenhum template encontrado</p>
                  <p className="text-gray-500 text-sm mt-1">
                    {searchQuery 
                      ? "Tente outra busca."
                      : "Este canal nao possui templates disponiveis."}
                  </p>
                </div>
              ) : (
                <div className="flex gap-4 h-full">
                  <ScrollArea className="flex-1 pr-2">
                    <div className="space-y-2">
                      {filteredTemplates.map(template => {
                        const isSelected = selectedTemplateId === template.id;
                        const isPreview = previewTemplate?.id === template.id;
                        const body = getTemplateBody(template);

                        return (
                          <Card 
                            key={template.id} 
                            className={`cursor-pointer transition-all hover:shadow-md ${
                              isSelected ? colors.selected + ' border-2' : 'hover:border-gray-300'
                            } ${isPreview ? `ring-2 ${colors.ring}` : ''}`}
                            onClick={() => setPreviewTemplate(template)}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-gray-900 truncate">
                                      {template.description || template.name || template.id}
                                    </h4>
                                    {isSelected && (
                                      <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${colors.icon}`} />
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5 font-mono">
                                    ID: {template.id}
                                  </p>
                                  {body && (
                                    <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                                      {body}
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  variant={isPreview ? "default" : "ghost"}
                                  className={isPreview ? colors.button : ""}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewTemplate(template);
                                  }}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </ScrollArea>

                  <div className="w-[320px] border-l pl-4 flex flex-col">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        <Smartphone className="w-4 h-4" />
                        Previa do Template
                      </h4>
                    </div>
                    
                    <div className="flex-1 overflow-auto">
                      {previewTemplate ? (
                        renderTemplatePreview(previewTemplate)
                      ) : (
                        <div className="flex flex-col items-center justify-center h-48 text-center">
                          <Eye className="w-8 h-8 text-gray-300 mb-2" />
                          <p className="text-gray-500 text-sm">
                            Clique em um template para visualizar
                          </p>
                        </div>
                      )}
                    </div>

                    {previewTemplate && (
                      <>
                        <Separator className="my-3" />

                        <div className="space-y-2">
                          <div className="text-xs text-gray-500">
                            <strong>Nome:</strong> {previewTemplate.description || previewTemplate.name || previewTemplate.id}
                          </div>
                          <div className="text-xs text-gray-500">
                            <strong>ID:</strong> <code className="bg-gray-100 px-1 rounded">{previewTemplate.id}</code>
                          </div>
                        </div>

                        <Button
                          className={`w-full mt-4 ${colors.button}`}
                          onClick={() => {
                            onSelect(previewTemplate);
                            onOpenChange(false);
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Selecionar Template
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <div className="pt-4 border-t mt-4">
          <p className="text-xs text-gray-500 text-center">
            Templates sincronizados do canal configurado
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
