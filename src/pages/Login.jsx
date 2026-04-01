import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Loader2, LogIn, AlertCircle, BarChart3, Shield, Zap,
  MessageSquare, TrendingUp, Calendar, Bell, PieChart,
  Clock, Star, Award, Activity
} from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const user = await base44.auth.login(formData.email, formData.password);
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success("Login realizado com sucesso!");
      
      navigate("/SalesPJDashboard");
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message || "Email ou senha incorretos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding & Features */}
      <div className="hidden lg:flex lg:w-[62%] bg-gradient-to-br from-slate-50 via-white to-orange-50 relative overflow-hidden">
        {/* Subtle Background Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%234338ca' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />
        {/* Animated Background Elements */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Gradient Orbs */}
          <div className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s', background: 'linear-gradient(to bottom right, rgba(90,42,60,0.3), rgba(249,143,111,0.2))' }} />
          <div className="absolute top-1/2 -right-48 w-[400px] h-[400px] rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', background: 'linear-gradient(to bottom right, rgba(249,143,111,0.25), rgba(90,42,60,0.15))' }} />
          <div className="absolute -bottom-48 left-1/3 w-[450px] h-[450px] bg-gradient-to-br from-emerald-200/40 to-teal-200/40 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
          
          {/* Floating Icons */}
          <div className="absolute top-20 right-32 w-14 h-14 bg-white rounded-2xl flex items-center justify-center animate-bounce" style={{ animationDuration: '3s', boxShadow: '0 10px 25px rgba(90,42,60,0.15)' }}>
            <MessageSquare className="w-7 h-7 text-indigo-500" />
          </div>
          <div className="absolute top-40 right-16 w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '0.5s', boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div className="absolute top-64 right-40 w-10 h-10 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-lg flex items-center justify-center animate-bounce" style={{ animationDuration: '4s', animationDelay: '1s', boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
            <Star className="w-5 h-5 text-white" />
          </div>
          <div className="absolute bottom-48 right-20 w-14 h-14 bg-white rounded-2xl flex items-center justify-center animate-bounce" style={{ animationDuration: '3.2s', animationDelay: '0.3s', boxShadow: '0 10px 25px rgba(249,143,111,0.15)' }}>
            <PieChart className="w-7 h-7 text-blue-500" />
          </div>
          <div className="absolute bottom-32 right-48 w-11 h-11 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl flex items-center justify-center animate-bounce" style={{ animationDuration: '3.8s', animationDelay: '0.7s', boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="absolute top-1/2 right-8 w-12 h-12 bg-gradient-to-br from-cyan-400 to-blue-500 rounded-xl flex items-center justify-center animate-bounce" style={{ animationDuration: '4.2s', animationDelay: '1.2s', boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
            <Calendar className="w-6 h-6 text-white" />
          </div>
          
          {/* Decorative Lines */}
          <svg className="absolute top-0 left-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#4338ca" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>
        </div>
        
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-16 w-full max-w-2xl">
          {/* Logo Section */}
          <div className="mb-8">
            <div className="flex justify-start">
              <img 
                src="/logo-saleswo.png" 
                alt="Sales Two" 
                className="h-40 xl:h-48 w-auto object-contain"
                style={{ mixBlendMode: 'multiply' }}
              />
            </div>
            <div className="flex items-center justify-start gap-3 mt-4">
                <span className="px-4 py-1.5 text-white text-xs font-bold rounded-full shadow-lg" style={{ background: 'linear-gradient(to right, #5A2A3C, #F98F6F)' }}>
                  CRM PRO
                </span>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-semibold rounded-full">
                  v2.0
                </span>
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                  <Star className="w-4 h-4 fill-current" />
                </div>
            </div>
          </div>
          
          {/* Tagline */}
          <div className="mb-8">
            <h1 className="text-4xl xl:text-5xl font-bold text-gray-900 mb-4 leading-tight">
              Vendas B2B
              <span className="block bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(to right, #5A2A3C, #F98F6F)' }}>
                com eficiência
              </span>
            </h1>
            <p className="text-lg text-gray-600 max-w-md">
              Plataforma focada em gestão de vendas PJ, pipeline B2B e relacionamento com empresas
            </p>
          </div>
          
          {/* Feature Cards - 2x2 Grid */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            {/* Card 1 - Pipeline B2B */}
            <div className="group p-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Pipeline B2B</h3>
              <p className="text-sm text-gray-500">Gestão completa de leads PJ</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">Kanban</span>
                <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded">Propostas</span>
              </div>
            </div>
            
            {/* Card 2 - Relatórios */}
            <div className="group p-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Relatórios</h3>
              <p className="text-sm text-gray-500">Dashboards em tempo real</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">KPIs</span>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-xs font-medium rounded">Gráficos</span>
              </div>
            </div>
            
            {/* Card 3 - Automações */}
            <div className="group p-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
                <Zap className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Automações</h3>
              <p className="text-sm text-gray-500">Workflows inteligentes</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded">Triggers</span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Actions</span>
              </div>
            </div>
            
            {/* Card 4 - Gestão de Agentes */}
            <div className="group p-5 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform" style={{ boxShadow: '0 8px 16px rgba(90,42,60,0.2)' }}>
                <Shield className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 mb-1">Gestão de Acesso</h3>
              <p className="text-sm text-gray-500">Usuários e permissões</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">Perfis</span>
                <span className="px-2 py-0.5 bg-cyan-100 text-cyan-700 text-xs font-medium rounded">Regras</span>
              </div>
            </div>
          </div>
          
          {/* Bottom Stats */}
          <div className="flex items-center gap-6">
            <div className="flex-1 p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-emerald-500 rounded-xl flex items-center justify-center" style={{ boxShadow: '0 4px 12px rgba(34,197,94,0.2)' }}>
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">99.9%</div>
                  <div className="text-gray-500 text-xs">Uptime</div>
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-xl flex items-center justify-center" style={{ boxShadow: '0 4px 12px rgba(90,42,60,0.2)' }}>
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">24/7</div>
                  <div className="text-gray-500 text-xs">Suporte</div>
                </div>
              </div>
            </div>
            <div className="flex-1 p-4 rounded-xl bg-white/60 backdrop-blur-sm border border-gray-100 hover:shadow-lg transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-500 rounded-xl flex items-center justify-center" style={{ boxShadow: '0 4px 12px rgba(168,85,247,0.2)' }}>
                  <Award className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">100%</div>
                  <div className="text-gray-500 text-xs">Brasileiro</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Right Side - Login Form (Gradient) */}
      <div className="w-full lg:w-[38%] flex flex-col justify-center px-6 sm:px-10 xl:px-14 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #5A2A3C 0%, #F98F6F 100%)', boxShadow: '-30px 0 60px -15px rgba(90,42,60,0.3)' }}>
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-80 h-80 bg-white rounded-full translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/3 translate-y-1/3" />
        </div>
        
        {/* Mobile Logo */}
        <div className="lg:hidden mb-8 flex justify-center relative z-10">
          <img 
            src="/logo-saleswo.png" 
            alt="Sales Two" 
            className="h-16 w-auto object-contain brightness-0 invert"
          />
        </div>
        
        <div className="max-w-sm mx-auto w-full relative z-10">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white">
              Bem-vindo de volta
            </h2>
            <p className="mt-2" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Entre com suas credenciais para acessar o sistema
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive" className="bg-red-500/20 border-red-400/50 text-white">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/90">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu.email@empresa.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                autoComplete="email"
                className="h-12 text-base bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20 focus:border-white/40"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/90">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                autoComplete="current-password"
                className="h-12 text-base bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:bg-white/20 focus:border-white/40"
              />
            </div>
            
            <Button 
              type="submit" 
              className="w-full h-12 text-base bg-white hover:bg-white/90 font-semibold" 
              style={{ color: '#5A2A3C' }}
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-5 w-5" />
                  Entrar
                </>
              )}
            </Button>
          </form>
          
          </div>
        
        {/* Footer */}
        <p className="absolute bottom-6 left-0 right-0 text-center text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
          Powered by <a href="https://www.wescctech.com.br" target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:underline">SalesTwo</a>
        </p>
      </div>
    </div>
  );
}
