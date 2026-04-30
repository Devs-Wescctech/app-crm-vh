import { useState, useEffect, useMemo } from "react";

function useResponsive() {
  const getScreenSize = (width) => ({
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1280,
    isDesktop: width >= 1280
  });
  
  const [screenSize, setScreenSize] = useState(() => {
    if (typeof window === 'undefined') return { isMobile: false, isTablet: false, isDesktop: true };
    return getScreenSize(window.innerWidth);
  });
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    let timeoutId;
    const checkSize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const width = window.innerWidth;
        setScreenSize(getScreenSize(width));
      }, 100);
    };
    
    window.addEventListener('resize', checkSize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', checkSize);
    };
  }, []);
  
  return screenSize;
}
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import {
  LayoutDashboard,
  Plus,
  UserCog,
  TrendingUp,
  CheckSquare,
  UserCheck,
  FileText,
  Search,
  Moon,
  Sun,
  Settings,
  FileBarChart,
  CalendarIcon,
  LogOut,
  Zap,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Building2,
  Menu,
  X,
  Sparkles,
  Trophy,
  XCircle,
  History,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeProvider, useTheme } from "@/components/ui/theme-provider";
import CommandPalette from "@/components/ui/command-palette";
import { Toaster } from "@/components/ui/toaster";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import NotificationBell from "@/components/ui/notification-bell";
import { filterMenuItems, hasAnySystemsAccess } from "@/components/utils/permissions";

const PUBLIC_PAGES = [
  'Login', 'login', 'PublicSignature', 'PublicProposal',
  'PublicContractSign',
];

const isPublicRoute = (pathname) => {
  const publicPaths = [
    '/login', '/assinatura', '/publicsignature',
    '/proposta-publica', '/publicproposal',
    '/publiccontractsign',
  ];
  const lowerPath = pathname.toLowerCase();
  return publicPaths.some(path => lowerPath.includes(path));
};

const menuModules = [
  {
    id: "sales_pj",
    title: "Vendas PJ",
    icon: Building2,
    gradient: "from-orange-600 to-amber-500",
    items: [
      { title: "Dashboard", url: createPageUrl("SalesPJDashboard"), icon: LayoutDashboard },
      { title: "Dashboard Vendedores", url: createPageUrl("SalesPJAgentsDashboard"), icon: UserCheck, supervisorOnly: true },
      { title: "Dashboard Comercial", url: createPageUrl("DashboardComercial"), icon: FileBarChart, supervisorOnly: true },
      { title: "Novo Lead PJ", url: createPageUrl("NewLeadPJ"), icon: Plus, highlight: true },
      { title: "Pipeline B2B", url: createPageUrl("LeadsPJKanban"), icon: TrendingUp },
      { title: "Agenda", url: createPageUrl("SalesAgenda"), icon: CalendarIcon },
      { title: "Painel de Agendas", url: createPageUrl("AgendasPanel"), icon: CalendarIcon, supervisorOnly: true },
      { title: "Busca de Leads", url: createPageUrl("LeadPJSearch"), icon: Search },
      { title: "Relatórios", url: createPageUrl("SalesPJReports"), icon: FileBarChart, supervisorOnly: true },
      { title: "Rel. de Ganhos", url: createPageUrl("SalesPJWonReport"), icon: Trophy },
      { title: "Rel. de Perdidos", url: createPageUrl("SalesPJLostReport"), icon: XCircle },
      { title: "Períodos de Responsabilidade", url: createPageUrl("SalesPJAgentPeriodsReport"), icon: History, supervisorOnly: true },
      { title: "Lista de Leads", url: createPageUrl("LeadPJReportList"), icon: FileBarChart },
      { title: "Automações", url: createPageUrl("LeadPJAutomations"), icon: Zap, supervisorOnly: true },
      { title: "Tarefas", url: createPageUrl("SalesTasks"), icon: CheckSquare },
      { title: "Templates", url: createPageUrl("ProposalTemplates"), icon: FileText, supervisorOnly: true },
    ]
  },
  {
    id: "config",
    title: "Configurações",
    icon: Settings,
    gradient: "from-slate-500 to-gray-600",
    items: [
      { title: "Agentes", url: createPageUrl("Agents"), icon: UserCog },
    ]
  }
];

const sidebarVariants = {
  open: { width: 280, transition: { type: "spring", stiffness: 300, damping: 30 } },
  closed: { width: 88, transition: { type: "spring", stiffness: 300, damping: 30 } }
};

const menuItemVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.05, duration: 0.3 }
  })
};

function ModernSidebar({ user, filteredMenuModules, expandedModules, toggleModule, location, sidebarOpen, setSidebarOpen }) {
  const navigate = useNavigate();
  const { data: settings = [] } = useQuery({
    queryKey: ['system-settings'],
    queryFn: () => base44.entities.SystemSettings.list(),
    enabled: !!user,
  });

  const logoUrl = settings.find(s => s.setting_key === 'company_logo')?.setting_value;
  const companyName = settings.find(s => s.setting_key === 'company_name')?.setting_value || 'SalesTwo';

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <motion.aside
      initial={false}
      animate={sidebarOpen ? "open" : "closed"}
      variants={sidebarVariants}
      className="fixed left-0 top-0 h-screen z-40 flex flex-col
                 bg-white/80 dark:bg-gray-900/90 backdrop-blur-2xl
                 border-r border-gray-200/50 dark:border-gray-700/50
                 shadow-glass"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
      
      <div className="relative flex items-center justify-center p-4 border-b border-gray-200/50 dark:border-gray-700/50">
        <AnimatePresence mode="wait">
          {sidebarOpen ? (
            <motion.img
              key="logo-full"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              src="/logo-saleswo.png" 
              alt="Sales Two" 
              className="h-24 max-w-[250px] object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
          ) : (
            <motion.div
              key="logo-icon"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="w-12 h-12 overflow-hidden flex items-center justify-center"
            >
              <img 
                src="/logo-saleswo-icon-nobg.png" 
                alt="Sales Two" 
                className="w-auto h-auto object-contain"
                style={{ transform: 'scale(3.5)', transformOrigin: 'center center' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="relative flex-1 overflow-y-auto scrollbar-thin py-4 px-3 space-y-1">
        {filteredMenuModules.map((module, moduleIndex) => (
          <div key={module.id} className="mb-2">
            {sidebarOpen ? (
              <>
                {module.singleItem ? (
                  <Link
                    to={module.url}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                               transition-all duration-200 group
                               ${location.pathname === module.url
                                 ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10 text-cyan-600 dark:text-cyan-400'
                                 : 'hover:bg-gray-100/60 dark:hover:bg-gray-800/40'}`}
                  >
                    <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${module.gradient}
                                   flex items-center justify-center shadow-sm flex-shrink-0
                                   group-hover:shadow-md transition-shadow duration-200`}>
                      <module.icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">
                      {module.title}
                    </span>
                  </Link>
                ) : (
                <button
                  onClick={() => toggleModule(module.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                             transition-all duration-200 group
                             ${expandedModules.includes(module.id) 
                               ? 'bg-gray-100/80 dark:bg-gray-800/60' 
                               : 'hover:bg-gray-100/60 dark:hover:bg-gray-800/40'}`}
                >
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${module.gradient}
                                 flex items-center justify-center shadow-sm flex-shrink-0
                                 group-hover:shadow-md transition-shadow duration-200`}>
                    <module.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 flex items-center justify-between min-w-0">
                    <span className="font-medium text-sm text-gray-700 dark:text-gray-200 truncate">
                      {module.title}
                    </span>
                    <motion.div
                      animate={{ rotate: expandedModules.includes(module.id) ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    </motion.div>
                  </div>
                </button>
                )}

                <AnimatePresence>
                  {!module.singleItem && expandedModules.includes(module.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 ml-3 pl-5 border-l-2 border-gray-200 dark:border-gray-700 space-y-0.5">
                        {module.items.map((item, index) => {
                          const isActive = location.pathname === item.url;
                          return (
                            <motion.div
                              key={item.title}
                              custom={index}
                              initial="hidden"
                              animate="visible"
                              variants={menuItemVariants}
                            >
                              <Link
                                to={item.url}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm
                                           transition-all duration-200
                                           ${isActive
                                             ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-600 dark:text-blue-400 font-medium border-l-2 border-blue-500 -ml-[2px] pl-[14px]'
                                             : item.highlight
                                               ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-500/25 hover:shadow-md hover:shadow-blue-500/30'
                                               : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/60 dark:hover:bg-gray-800/40 hover:text-gray-900 dark:hover:text-gray-100'
                                           }`}
                              >
                                <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-blue-500' : ''}`} />
                                <span className="truncate">{item.title}</span>
                              </Link>
                            </motion.div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            ) : (
              module.singleItem ? (
                <Link
                  to={module.url}
                  className={`w-full flex items-center justify-center py-2 rounded-xl
                             transition-all duration-200 group
                             ${location.pathname === module.url
                               ? 'bg-gradient-to-r from-cyan-500/10 to-blue-500/10'
                               : 'hover:bg-gray-100/60 dark:hover:bg-gray-800/40'}`}
                >
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${module.gradient}
                                 flex items-center justify-center shadow-lg
                                 group-hover:shadow-xl group-hover:scale-110 transition-all duration-200
                                 ring-2 ring-white/20 dark:ring-white/10`}>
                    <module.icon className="w-5 h-5 text-white drop-shadow-sm" />
                  </div>
                </Link>
              ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="w-full flex items-center justify-center py-2 rounded-xl
                               transition-all duration-200 group hover:bg-gray-100/60 dark:hover:bg-gray-800/40"
                  >
                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${module.gradient}
                                   flex items-center justify-center shadow-lg
                                   group-hover:shadow-xl group-hover:scale-110 transition-all duration-200
                                   ring-2 ring-white/20 dark:ring-white/10`}>
                      <module.icon className="w-5 h-5 text-white drop-shadow-sm" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent 
                  side="right" 
                  align="start" 
                  sideOffset={12}
                  className="w-64 p-2 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl 
                             border border-gray-200/50 dark:border-gray-700/50 
                             shadow-xl shadow-black/10 dark:shadow-black/30 rounded-xl"
                >
                  <div className={`flex items-center gap-3 p-3 mb-2 rounded-lg bg-gradient-to-r ${module.gradient} shadow-md`}>
                    <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center">
                      <module.icon className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-semibold text-white text-sm">{module.title}</span>
                  </div>
                  <div className="space-y-1">
                    {module.items.map((item) => {
                      const isActive = location.pathname === item.url;
                      return (
                        <button
                          key={item.title}
                          onClick={() => navigate(item.url)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                                     transition-all duration-200 text-left
                                     ${isActive
                                       ? 'bg-gradient-to-r from-blue-500/15 to-cyan-500/15 text-blue-600 dark:text-blue-400 font-medium'
                                       : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                     }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                                         ${isActive 
                                           ? 'bg-blue-500/20 text-blue-500' 
                                           : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                            <item.icon className="w-4 h-4" />
                          </div>
                          <span>{item.title}</span>
                          {isActive && (
                            <div className="ml-auto w-2 h-2 rounded-full bg-blue-500"></div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
              )
            )}
          </div>
        ))}

        {(user?.role === 'admin' || hasAnySystemsAccess(user?.agent)) && (
          <div className="pt-4 mt-4 border-t border-gray-200/50 dark:border-gray-700/50">
            <Link
              to={createPageUrl("Settings")}
              className={`flex items-center ${sidebarOpen ? 'gap-3 px-3' : 'justify-center py-2'} py-2.5 rounded-xl text-sm
                         transition-all duration-200 group
                         ${location.pathname === createPageUrl("Settings")
                           ? 'bg-gradient-to-r from-blue-500/10 to-cyan-500/10 text-blue-600 dark:text-blue-400 font-medium'
                           : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100/60 dark:hover:bg-gray-800/40'
                         }`}
            >
              <div className={`${sidebarOpen ? 'w-8 h-8' : 'w-11 h-11'} rounded-xl bg-gradient-to-br from-gray-500 to-slate-600
                             flex items-center justify-center shadow-lg
                             ${!sidebarOpen ? 'group-hover:shadow-xl group-hover:scale-110 ring-2 ring-white/20 dark:ring-white/10' : ''}
                             transition-all duration-200`}>
                <Settings className={`${sidebarOpen ? 'w-4 h-4' : 'w-5 h-5'} text-white drop-shadow-sm`} />
              </div>
              {sidebarOpen && <span>Sistema</span>}
            </Link>
          </div>
        )}
      </nav>

      <div className="relative px-3 py-3">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className={`w-full flex items-center justify-center py-2 rounded-lg
                     text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                     hover:bg-gray-100/50 dark:hover:bg-gray-800/50
                     transition-all duration-200 group`}
        >
          {sidebarOpen ? (
            <div className="flex items-center gap-2">
              <motion.div
                whileHover={{ x: -2 }}
                className="w-5 h-5 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </motion.div>
              <span className="text-xs font-medium">Recolher</span>
            </div>
          ) : (
            <motion.div
              whileHover={{ x: 2 }}
              className="w-5 h-5 flex items-center justify-center"
            >
              <ChevronRight className="w-4 h-4" />
            </motion.div>
          )}
        </button>
      </div>

      <div className="relative p-4 border-t border-gray-200/50 dark:border-gray-700/50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 p-2 rounded-xl
                              hover:bg-gray-100/60 dark:hover:bg-gray-800/40
                              transition-all duration-200 group">
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600
                               flex items-center justify-center shadow-md shadow-blue-500/20">
                  <span className="text-white font-semibold text-sm">
                    {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full
                               border-2 border-white dark:border-gray-900" />
              </div>
              <AnimatePresence>
                {sidebarOpen && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="font-medium text-sm text-gray-900 dark:text-white truncate">
                      {user?.full_name || 'Usuário'}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {user?.role === 'admin' ? 'Administrador' : 'Agente'}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-lg border-gray-200/50 dark:border-gray-700/50">
            <DropdownMenuLabel className="px-3 py-2">
              <div className="flex flex-col gap-1">
                <p className="font-semibold text-gray-900 dark:text-white">{user?.full_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
                {user?.role === 'admin' && (
                  <Badge className="w-fit mt-1 text-white border-0" style={{ background: 'linear-gradient(to right, #5A2A3C, #F98F6F)' }}>
                    Administrador
                  </Badge>
                )}
              </div>
            </DropdownMenuLabel>
            {user?.role === 'admin' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate(createPageUrl("Settings"))} className="px-3 py-2 rounded-lg mx-1">
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Configurações</span>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="px-3 py-2 rounded-lg mx-1 text-red-600 dark:text-red-400 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sair</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.aside>
  );
}

function ModernHeader({ sidebarOpen, setCommandOpen, mobileMenuOpen, setMobileMenuOpen }) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl
                       border-b border-gray-200/50 dark:border-gray-700/50">
      <div className="flex items-center justify-between px-4 md:px-6 py-3">
        <div className="flex items-center gap-3 md:gap-4">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex items-center justify-center w-10 h-10 
                       rounded-xl bg-gray-100/80 dark:bg-gray-800/60 
                       hover:bg-gray-200/80 dark:hover:bg-gray-700/60
                       transition-all duration-200"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            ) : (
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            )}
          </button>
          
          <div className="md:hidden flex items-center">
            <img 
              src="/logo-saleswo.png" 
              alt="Sales Two" 
              className="h-10 object-contain"
              style={{ mixBlendMode: 'multiply' }}
            />
          </div>
          
          <button
            onClick={() => setCommandOpen(true)}
            className="hidden md:flex items-center gap-3 px-4 py-2.5 
                       bg-gray-100/80 dark:bg-gray-800/60 
                       hover:bg-gray-200/80 dark:hover:bg-gray-700/60
                       rounded-xl transition-all duration-200 
                       text-sm text-gray-500 dark:text-gray-400
                       border border-transparent hover:border-gray-300 dark:hover:border-gray-600
                       min-w-[280px] group"
          >
            <Search className="w-4 h-4 group-hover:text-blue-500 transition-colors" />
            <span>Buscar no sistema...</span>
            <kbd className="ml-auto px-2 py-0.5 bg-white dark:bg-gray-700 
                           rounded-md text-xs font-medium shadow-sm
                           border border-gray-200 dark:border-gray-600">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="h-10 w-10 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800
                      transition-all duration-200"
          >
            <motion.div
              key={theme}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {theme === "light" ? (
                <Moon className="w-5 h-5 text-gray-600" />
              ) : (
                <Sun className="w-5 h-5 text-amber-400" />
              )}
            </motion.div>
          </Button>
        </div>
      </div>
    </header>
  );
}

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [expandedModules, setExpandedModules] = useState(["sales_pj"]);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [lastSalesModule, setLastSalesModule] = useState(null);
  const { isMobile, isTablet, isDesktop } = useResponsive();
  
  // Em tablets, a sidebar fica recolhida por padrão
  useEffect(() => {
    if (isTablet && sidebarOpen) {
      setSidebarOpen(false);
    }
  }, [isTablet]);

  const isPublicPage = PUBLIC_PAGES.some(page =>
    currentPageName?.toLowerCase() === page.toLowerCase()
  ) || isPublicRoute(location.pathname);

  const { data: user, isLoading: isLoadingUser, error: userError } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    enabled: !isPublicPage && !!localStorage.getItem('accessToken'),
    retry: 1,
    retryDelay: 500,
    staleTime: 30000,
  });

  const currentAgent = user?.agent || null;

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!isPublicPage && !isLoadingUser && (userError || !token)) {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setIsRedirecting(true);
      navigate('/login');
    }
  }, [isPublicPage, isLoadingUser, userError, user, navigate]);

  useEffect(() => {
    if (isRedirecting && (isPublicPage || user)) {
      setIsRedirecting(false);
    }
  }, [isRedirecting, isPublicPage, user]);

  const toggleModule = (moduleId) => {
    setExpandedModules(prev =>
      prev.includes(moduleId)
        ? prev.filter(id => id !== moduleId)
        : [...prev, moduleId]
    );
  };

  useEffect(() => {
    if (!isPublicPage) {
      const sharedPages = ['/SalesAgenda', '/SalesTasks', '/ProposalTemplates'];
      const isSharedPage = sharedPages.includes(location.pathname);
      
      const matchingModules = menuModules.filter(module =>
        module.items.some(item => item.url === location.pathname)
      );
      
      if (matchingModules.length > 0) {
        let currentModule = matchingModules[0];
        
        if (isSharedPage && lastSalesModule && matchingModules.some(m => m.id === lastSalesModule)) {
          currentModule = matchingModules.find(m => m.id === lastSalesModule);
        }
        
        if (currentModule.id === 'sales_pj') {
          setLastSalesModule(currentModule.id);
        }
        
        if (currentModule && !expandedModules.includes(currentModule.id)) {
          setExpandedModules(prev => [...prev, currentModule.id]);
        }
      }
    }
  }, [location.pathname, isPublicPage, lastSalesModule]);

  const currentAgentType = currentAgent?.agentType || currentAgent?.agent_type;
  const isAdminUser = user?.role === 'admin' || currentAgentType === 'admin';
  const isCoordinatorUser = currentAgentType === 'coordinator';
  const isSupervisorUser = currentAgentType?.includes('supervisor');
  const isCommercialUser = !isAdminUser && !isCoordinatorUser && !isSupervisorUser && !!currentAgent;

  const filteredMenuModules = useMemo(() => {
    let modules = user?.role === 'admin'
      ? menuModules
      : currentAgent
        ? filterMenuItems(currentAgent, menuModules)
        : [];

    if (isCommercialUser) {
      modules = modules.map(mod => {
        if (mod.id !== 'sales_pj') return mod;
        return {
          ...mod,
          items: mod.items
            .filter(item => {
              if (item.url === createPageUrl("SalesPJDashboard")) return false;
              if (item.url === createPageUrl("SalesPJAgentsDashboard")) return false;
              return true;
            })
            .map(item => item)
            .concat([])
        };
      });
      modules = modules.map(mod => {
        if (mod.id !== 'sales_pj') return mod;
        return {
          ...mod,
          items: [
            { title: "Meu Dashboard", url: createPageUrl("MyDashboardPJ"), icon: LayoutDashboard },
            ...mod.items
          ]
        };
      });
    }

    // Coordenador: tem visibilidade total e vê todos os itens dos perfis
    // de Vendas e Supervisor (incluindo "Meu Dashboard"), sem remover
    // os dashboards de equipe (SalesPJDashboard/SalesPJAgentsDashboard).
    if (isCoordinatorUser) {
      modules = modules.map(mod => {
        if (mod.id !== 'sales_pj') return mod;
        const myDashboardUrl = createPageUrl("MyDashboardPJ");
        const alreadyHas = mod.items.some(i => i.url === myDashboardUrl);
        if (alreadyHas) return mod;
        return {
          ...mod,
          items: [
            { title: "Meu Dashboard", url: myDashboardUrl, icon: LayoutDashboard },
            ...mod.items
          ]
        };
      });
    }

    return modules;
  }, [user, currentAgent, isCommercialUser, isCoordinatorUser]);

  if (isPublicPage) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/30 to-purple-50/20 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        {children}
        <Toaster />
      </div>
    );
  }

  if (isLoadingUser || isRedirecting) {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 dark:from-gray-950 dark:to-gray-900">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="relative w-16 h-16 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full animate-spin" 
                 style={{ background: 'linear-gradient(to right, #5A2A3C, #F98F6F)', clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" }} />
            <div className="absolute inset-2 rounded-full bg-white dark:bg-gray-900" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-6 h-6" style={{ color: '#5A2A3C' }} />
            </div>
          </div>
          <p className="text-gray-600 dark:text-gray-400 font-medium">
            {isRedirecting ? 'Redirecionando...' : 'Carregando...'}
          </p>
        </motion.div>
      </div>
    );
  }

  if (userError || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50/20 to-purple-50/10 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      {/* Sidebar - hidden on mobile, visible on tablet and desktop */}
      <div className="hidden md:block">
        <ModernSidebar
          user={user}
          filteredMenuModules={filteredMenuModules}
          expandedModules={expandedModules}
          toggleModule={toggleModule}
          location={location}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
        />
      </div>

      {/* Mobile Menu Overlay - only on phones */}
      <AnimatePresence>
        {mobileMenuOpen && isMobile && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-gray-900 shadow-2xl overflow-y-auto"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                <img 
                  src="/logo-saleswo.png" 
                  alt="Sales Two" 
                  className="h-12 object-contain"
                  style={{ mixBlendMode: 'multiply' }}
                />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                </button>
              </div>
              
              <nav className="p-4 space-y-2">
                {filteredMenuModules.map((module) => (
                  <div key={module.id} className="mb-4">
                    {module.singleItem ? (
                      <button
                        onClick={() => {
                          navigate(module.url);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${module.gradient} shadow-md
                                   ${location.pathname === module.url ? 'ring-2 ring-white/50' : ''}`}
                      >
                        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                          <module.icon className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-semibold text-white text-sm">{module.title}</span>
                      </button>
                    ) : (
                      <>
                        <div className={`flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r ${module.gradient} shadow-md mb-2`}>
                          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <module.icon className="w-4 h-4 text-white" />
                          </div>
                          <span className="font-semibold text-white text-sm">{module.title}</span>
                        </div>
                        <div className="space-y-1 pl-2">
                          {module.items.map((item) => {
                            const isActive = location.pathname === item.url;
                            return (
                              <button
                                key={item.title}
                                onClick={() => {
                                  navigate(item.url);
                                  setMobileMenuOpen(false);
                                }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                                           transition-all duration-200 text-left
                                           ${isActive
                                             ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                             : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                           }`}
                              >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center
                                               ${isActive 
                                                 ? 'bg-blue-500/20 text-blue-500' 
                                                 : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                                  <item.icon className="w-3.5 h-3.5" />
                                </div>
                                <span>{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                
                {(user?.role === 'admin' || hasAnySystemsAccess(currentAgent)) && (
                  <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      onClick={() => {
                        navigate(createPageUrl("Settings"));
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                                 transition-all duration-200 text-left
                                 ${location.pathname === createPageUrl("Settings")
                                   ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-medium'
                                   : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                                 }`}
                    >
                      <div className="w-7 h-7 rounded-lg bg-gray-500 flex items-center justify-center">
                        <Settings className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span>Sistema</span>
                    </button>
                  </div>
                )}
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div
        style={{ 
          marginLeft: isMobile ? 0 : (sidebarOpen ? 280 : 72),
          transition: 'margin-left 0.3s ease'
        }}
        className="min-h-screen flex flex-col"
      >
        <ModernHeader 
          sidebarOpen={sidebarOpen} 
          setCommandOpen={setCommandOpen}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />

          <main className="flex-1 overflow-x-hidden">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="p-3 md:p-6"
            >
              {children}
            </motion.div>
          </main>
      </div>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <Toaster />
    </div>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <ThemeProvider defaultTheme="light" storageKey="salestwo-theme">
      <LayoutContent currentPageName={currentPageName}>{children}</LayoutContent>
    </ThemeProvider>
  );
}