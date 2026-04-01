import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone, MessageSquare, Mail, MapPin, FileText, Clock, Plus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

const ACTIVITY_TYPES = [
  { value: "call", label: "Ligacao", icon: Phone, color: "blue" },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare, color: "emerald" },
  { value: "email", label: "E-mail", icon: Mail, color: "purple" },
  { value: "visit", label: "Visita", icon: MapPin, color: "orange" },
  { value: "note", label: "Nota", icon: FileText, color: "gray" },
  { value: "task", label: "Tarefa", icon: Clock, color: "amber" },
];

const getTypeConfig = (value) => {
  const configs = {
    call: { gradient: "from-blue-500 to-cyan-500", bg: "bg-blue-50 dark:bg-blue-950", border: "border-blue-200 dark:border-blue-800", text: "text-blue-700 dark:text-blue-300" },
    whatsapp: { gradient: "from-emerald-500 to-green-500", bg: "bg-emerald-50 dark:bg-emerald-950", border: "border-emerald-200 dark:border-emerald-800", text: "text-emerald-700 dark:text-emerald-300" },
    email: { gradient: "from-purple-500 to-violet-500", bg: "bg-purple-50 dark:bg-purple-950", border: "border-purple-200 dark:border-purple-800", text: "text-purple-700 dark:text-purple-300" },
    visit: { gradient: "from-orange-500 to-amber-500", bg: "bg-orange-50 dark:bg-orange-950", border: "border-orange-200 dark:border-orange-800", text: "text-orange-700 dark:text-orange-300" },
    note: { gradient: "from-gray-400 to-gray-500", bg: "bg-gray-50 dark:bg-gray-900", border: "border-gray-200 dark:border-gray-700", text: "text-gray-700 dark:text-gray-300" },
    task: { gradient: "from-amber-500 to-yellow-500", bg: "bg-amber-50 dark:bg-amber-950", border: "border-amber-200 dark:border-amber-800", text: "text-amber-700 dark:text-amber-300" },
  };
  return configs[value] || configs.note;
};

export default function AddActivityForm({ referralId, onActivityAdded, currentUserEmail }) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: "note",
    title: "",
    description: "",
    scheduled_at: "",
    priority: "media",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.title && !formData.description) {
      toast.error('Preencha o titulo ou descricao');
      return;
    }

    onActivityAdded({
      ...formData,
      referral_id: referralId,
      assigned_to: currentUserEmail,
    });

    setFormData({
      type: "note",
      title: "",
      description: "",
      scheduled_at: "",
      priority: "media",
    });
    setShowForm(false);
  };

  if (!showForm) {
    return (
      <Button
        onClick={() => setShowForm(true)}
        className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 rounded-xl"
      >
        <Plus className="w-5 h-5 mr-2" />
        Adicionar Interacao
      </Button>
    );
  }

  const selectedType = ACTIVITY_TYPES.find(t => t.value === formData.type);
  const Icon = selectedType?.icon || FileText;
  const config = getTypeConfig(formData.type);

  return (
    <div className={`rounded-2xl border-2 ${config.border} ${config.bg} overflow-hidden shadow-lg`}>
      {/* Header */}
      <div className={`px-5 py-4 bg-gradient-to-r ${config.gradient}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Nova Interacao</h3>
              <p className="text-xs text-white/80">Registre uma atividade</p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setShowForm(false)}
            className="text-white hover:bg-white/20 rounded-xl"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        {/* Activity Type Selector */}
        <div>
          <Label className={`text-sm font-medium ${config.text}`}>Tipo de Interacao</Label>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {ACTIVITY_TYPES.map(type => {
              const TypeIcon = type.icon;
              const isSelected = formData.type === type.value;
              const typeConfig = getTypeConfig(type.value);
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({...formData, type: type.value})}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all duration-200 ${
                    isSelected
                      ? `${typeConfig.border} ${typeConfig.bg} shadow-md scale-105`
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300'
                  }`}
                >
                  <div className={`p-2 rounded-lg ${isSelected ? `bg-gradient-to-br ${typeConfig.gradient}` : 'bg-gray-100 dark:bg-gray-700'}`}>
                    <TypeIcon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                  </div>
                  <span className={`text-xs font-medium ${isSelected ? typeConfig.text : 'text-gray-600 dark:text-gray-400'}`}>
                    {type.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Title */}
        <div>
          <Label className={`text-sm font-medium ${config.text}`}>Titulo</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            placeholder="Ex: Primeiro contato por WhatsApp"
            className="mt-1.5 h-11 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-offset-0"
          />
        </div>

        {/* Description */}
        <div>
          <Label className={`text-sm font-medium ${config.text}`}>Descricao</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            placeholder="Descreva a interacao..."
            rows={3}
            className="mt-1.5 rounded-xl bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 resize-none"
          />
        </div>

        {/* Task-specific fields */}
        {formData.type === 'task' && (
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-amber-100/50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <div>
              <Label className="text-xs font-medium text-amber-700 dark:text-amber-300">Agendar para</Label>
              <Input
                type="datetime-local"
                value={formData.scheduled_at}
                onChange={(e) => setFormData({...formData, scheduled_at: e.target.value})}
                className="mt-1 h-9 rounded-lg bg-white dark:bg-gray-800 text-sm"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-amber-700 dark:text-amber-300">Prioridade</Label>
              <Select value={formData.priority} onValueChange={(value) => setFormData({...formData, priority: value})}>
                <SelectTrigger className="mt-1 h-9 rounded-lg bg-white dark:bg-gray-800">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500" />
                      Baixa
                    </span>
                  </SelectItem>
                  <SelectItem value="media">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      Media
                    </span>
                  </SelectItem>
                  <SelectItem value="alta">
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500" />
                      Alta
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => setShowForm(false)} 
            className="flex-1 h-11 rounded-xl border-gray-300 dark:border-gray-600"
          >
            Cancelar
          </Button>
          <Button 
            type="submit" 
            className={`flex-1 h-11 rounded-xl bg-gradient-to-r ${config.gradient} hover:opacity-90 text-white shadow-lg`}
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Salvar
          </Button>
        </div>
      </form>
    </div>
  );
}
