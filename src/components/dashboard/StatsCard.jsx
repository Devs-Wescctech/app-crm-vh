import { useEffect, useRef, useState } from "react";
import { motion, useSpring, useTransform } from "framer-motion";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const colorClasses = {
  blue: {
    gradient: "from-blue-500 to-cyan-500",
    bg: "bg-gradient-to-br from-white to-blue-50/50 dark:from-gray-800 dark:to-blue-950/30",
    text: "text-blue-600 dark:text-blue-400",
    iconBg: "from-blue-500 to-cyan-500",
    shadow: "shadow-blue-500/20",
    ring: "ring-blue-100 dark:ring-blue-900"
  },
  purple: {
    gradient: "from-purple-500 to-violet-500",
    bg: "bg-gradient-to-br from-white to-purple-50/50 dark:from-gray-800 dark:to-purple-950/30",
    text: "text-purple-600 dark:text-purple-400",
    iconBg: "from-purple-500 to-violet-500",
    shadow: "shadow-purple-500/20",
    ring: "ring-purple-100 dark:ring-purple-900"
  },
  green: {
    gradient: "from-emerald-500 to-teal-500",
    bg: "bg-gradient-to-br from-white to-emerald-50/50 dark:from-gray-800 dark:to-emerald-950/30",
    text: "text-emerald-600 dark:text-emerald-400",
    iconBg: "from-emerald-500 to-teal-500",
    shadow: "shadow-emerald-500/20",
    ring: "ring-emerald-100 dark:ring-emerald-900"
  },
  emerald: {
    gradient: "from-emerald-500 to-teal-500",
    bg: "bg-gradient-to-br from-white to-emerald-50/50 dark:from-gray-800 dark:to-emerald-950/30",
    text: "text-emerald-600 dark:text-emerald-400",
    iconBg: "from-emerald-500 to-teal-500",
    shadow: "shadow-emerald-500/20",
    ring: "ring-emerald-100 dark:ring-emerald-900"
  },
  orange: {
    gradient: "from-orange-500 to-amber-500",
    bg: "bg-gradient-to-br from-white to-orange-50/50 dark:from-gray-800 dark:to-orange-950/30",
    text: "text-orange-600 dark:text-orange-400",
    iconBg: "from-orange-500 to-amber-500",
    shadow: "shadow-orange-500/20",
    ring: "ring-orange-100 dark:ring-orange-900"
  },
  amber: {
    gradient: "from-amber-500 to-yellow-500",
    bg: "bg-gradient-to-br from-white to-amber-50/50 dark:from-gray-800 dark:to-amber-950/30",
    text: "text-amber-600 dark:text-amber-400",
    iconBg: "from-amber-500 to-yellow-500",
    shadow: "shadow-amber-500/20",
    ring: "ring-amber-100 dark:ring-amber-900"
  },
  yellow: {
    gradient: "from-yellow-500 to-amber-500",
    bg: "bg-gradient-to-br from-white to-yellow-50/50 dark:from-gray-800 dark:to-yellow-950/30",
    text: "text-yellow-600 dark:text-yellow-400",
    iconBg: "from-yellow-500 to-amber-500",
    shadow: "shadow-yellow-500/20",
    ring: "ring-yellow-100 dark:ring-yellow-900"
  },
  red: {
    gradient: "from-red-500 to-rose-500",
    bg: "bg-gradient-to-br from-white to-red-50/50 dark:from-gray-800 dark:to-red-950/30",
    text: "text-red-600 dark:text-red-400",
    iconBg: "from-red-500 to-rose-500",
    shadow: "shadow-red-500/20",
    ring: "ring-red-100 dark:ring-red-900"
  },
  indigo: {
    gradient: "from-indigo-500 to-blue-500",
    bg: "bg-gradient-to-br from-white to-indigo-50/50 dark:from-gray-800 dark:to-indigo-950/30",
    text: "text-indigo-600 dark:text-indigo-400",
    iconBg: "from-indigo-500 to-blue-500",
    shadow: "shadow-indigo-500/20",
    ring: "ring-indigo-100 dark:ring-indigo-900"
  },
};

function AnimatedNumber({ value, isInView }) {
  // Check if value contains % - if so, handle as percentage
  const hasPercent = typeof value === 'string' && value.includes('%');
  const hasCurrency = typeof value === 'string' && value.includes('R$');
  
  // For percentages and currency, extract numeric part
  let numericValue = 0;
  let prefix = '';
  let suffix = '';
  
  if (hasPercent) {
    numericValue = parseFloat(value.replace('%', '').replace(',', '.')) || 0;
    suffix = '%';
  } else if (hasCurrency) {
    const cleanValue = value.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
    numericValue = parseFloat(cleanValue) || 0;
    prefix = 'R$ ';
  } else {
    numericValue = typeof value === 'number' ? value : (parseFloat(String(value).replace(',', '.')) || 0);
  }
  
  const spring = useSpring(0, { 
    mass: 0.5,
    stiffness: 40,
    damping: 15
  });
  
  const display = useTransform(spring, (v) => {
    if (hasPercent) {
      return v.toFixed(1) + suffix;
    } else if (hasCurrency) {
      return prefix + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return Math.round(v).toLocaleString('pt-BR');
  });
  
  useEffect(() => {
    if (isInView) {
      spring.set(numericValue);
    }
  }, [isInView, numericValue, spring]);
  
  // For non-numeric strings (except currency/percentage), just display as-is
  if (typeof value === 'string' && !hasPercent && !hasCurrency && isNaN(parseFloat(value))) {
    return <span>{value}</span>;
  }
  
  return <motion.span>{display}</motion.span>;
}

export default function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  color = "blue", 
  trend, 
  trendUp,
  subtitle,
  helpText,
  pulse = false,
  delay = 0
}) {
  const colors = colorClasses[color] || colorClasses.blue;
  const cardRef = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    
    if (cardRef.current) {
      observer.observe(cardRef.current);
    }
    
    return () => observer.disconnect();
  }, []);

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <Card className={`relative overflow-hidden border border-gray-100 dark:border-gray-700/50 shadow-soft hover:shadow-soft-lg transition-all duration-300 ${colors.bg} ${pulse ? 'animate-pulse' : ''} h-[140px]`}>
        <div className={`absolute top-0 right-0 w-40 h-40 transform translate-x-16 -translate-y-16 bg-gradient-to-br ${colors.gradient} rounded-full opacity-10 blur-xl`} />
        <div className={`absolute bottom-0 left-0 w-24 h-24 transform -translate-x-12 translate-y-12 bg-gradient-to-br ${colors.gradient} rounded-full opacity-5 blur-xl`} />
        
        <CardHeader className="p-5 relative h-full">
          <div className="flex justify-between items-start h-full">
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="flex items-center gap-1 mb-2">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {title}
                </p>
                {helpText && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[250px] text-sm">
                        <p>{helpText}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
              <CardTitle className={`text-3xl font-bold font-display tracking-tight ${colors.text} mb-1`}>
                <AnimatedNumber value={value} isInView={isInView} />
              </CardTitle>
              
              {trend && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: delay + 0.3 }}
                  className="flex items-center mt-2 text-xs"
                >
                  {trendUp ? (
                    <div className="flex items-center px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/40 rounded-full">
                      <TrendingUp className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        {trend}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center px-2 py-0.5 bg-red-100 dark:bg-red-900/40 rounded-full">
                      <TrendingDown className="w-3 h-3 mr-1 text-red-600 dark:text-red-400" />
                      <span className="text-red-600 dark:text-red-400 font-semibold">
                        {trend}
                      </span>
                    </div>
                  )}
                </motion.div>
              )}
              
              {subtitle && !trend && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {subtitle}
                </p>
              )}
            </div>
            
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", delay: delay + 0.2, stiffness: 200 }}
              className={`p-3 rounded-xl bg-gradient-to-br ${colors.iconBg} shadow-lg ${colors.shadow} ring-4 ${colors.ring}`}
            >
              <Icon className="w-5 h-5 text-white" />
            </motion.div>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}