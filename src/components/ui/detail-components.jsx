import { cn } from "@/lib/utils";
import { Phone, Mail, MessageSquare, Calendar, MoreHorizontal, ChevronRight, Clock, TrendingUp, AlertCircle, CheckCircle2, XCircle, Zap } from "lucide-react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";
import { format, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ProfileHeader({ 
  name, 
  subtitle, 
  avatarUrl, 
  initials,
  statusBadge,
  temperature,
  accentColor = "blue",
  children 
}) {
  const colorClasses = {
    blue: "from-blue-600 via-blue-500 to-cyan-400",
    indigo: "from-indigo-600 via-purple-500 to-pink-400",
    amber: "from-amber-500 via-orange-500 to-red-400",
  };

  return (
    <div className={cn(
      "relative overflow-hidden rounded-2xl bg-gradient-to-r p-6 shadow-xl",
      colorClasses[accentColor] || colorClasses.blue
    )}>
      <div className="absolute inset-0 bg-black/10" />
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
      
      <div className="relative z-10 flex items-start gap-5">
        <div className="relative">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={name}
              className="h-20 w-20 rounded-2xl border-4 border-white/30 object-cover shadow-lg"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white/30 bg-white/20 text-2xl font-bold text-white shadow-lg backdrop-blur-sm">
              {initials || name?.charAt(0)?.toUpperCase() || "?"}
            </div>
          )}
          {temperature && (
            <div className={cn(
              "absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow-lg",
              temperature === "hot" && "bg-red-500 text-white",
              temperature === "warm" && "bg-yellow-500 text-white",
              temperature === "cold" && "bg-blue-400 text-white"
            )}>
              {temperature === "hot" ? "Q" : temperature === "warm" ? "M" : "F"}
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-white truncate">{name}</h1>
            {statusBadge}
          </div>
          {subtitle && (
            <p className="mt-1 text-white/80 text-sm">{subtitle}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export function StatusPill({ status, label, variant = "default" }) {
  const variants = {
    default: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
    success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    danger: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    info: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
      variants[variant] || variants.default
    )}>
      <span className={cn(
        "h-1.5 w-1.5 rounded-full",
        variant === "success" && "bg-emerald-500",
        variant === "warning" && "bg-amber-500",
        variant === "danger" && "bg-red-500",
        variant === "info" && "bg-blue-500",
        variant === "purple" && "bg-purple-500",
        variant === "default" && "bg-gray-500",
      )} />
      {label}
    </span>
  );
}

export function QuickActionBar({ actions }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <TooltipProvider delayDuration={100}>
        {actions.map((action, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <Button
                variant={action.variant || "secondary"}
                size="sm"
                onClick={action.onClick}
                disabled={action.disabled}
                className={cn(
                  "gap-2 shadow-sm transition-all hover:shadow-md",
                  action.className
                )}
              >
                {action.icon}
                {action.label && <span className="hidden sm:inline">{action.label}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{action.tooltip || action.label}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </TooltipProvider>
    </div>
  );
}

export function MetricCard({ 
  icon: Icon, 
  label, 
  value, 
  subValue, 
  trend, 
  color = "blue",
  className 
}) {
  const colorClasses = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
  };

  return (
    <div className={cn(
      "group relative overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-900",
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className={cn(
          "flex h-10 w-10 items-center justify-center rounded-lg",
          colorClasses[color] || colorClasses.blue
        )}>
          <Icon className="h-5 w-5" />
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trend > 0 ? "text-emerald-600" : "text-red-600"
          )}>
            <TrendingUp className={cn("h-3 w-3", trend < 0 && "rotate-180")} />
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        {subValue && (
          <p className="mt-1 text-xs text-gray-400">{subValue}</p>
        )}
      </div>
    </div>
  );
}

export function ProgressRing({ 
  progress, 
  size = 60, 
  strokeWidth = 6, 
  color = "blue",
  label,
  className 
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  const colorClasses = {
    blue: "stroke-blue-500",
    green: "stroke-emerald-500",
    amber: "stroke-amber-500",
    purple: "stroke-purple-500",
    red: "stroke-red-500",
  };

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          className="stroke-gray-200 dark:stroke-gray-700"
          strokeWidth={strokeWidth}
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          className={cn(colorClasses[color] || colorClasses.blue, "transition-all duration-500")}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          r={radius}
          cx={size / 2}
          cy={size / 2}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold text-gray-900 dark:text-white">{progress}%</span>
        {label && <span className="text-[10px] text-gray-500">{label}</span>}
      </div>
    </div>
  );
}

export function InfoRow({ icon: Icon, label, value, copyable, className }) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-lg py-2 px-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50",
      className
    )}>
      {Icon && (
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800">
          <Icon className="h-4 w-4 text-gray-500" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{value || "-"}</p>
      </div>
    </div>
  );
}

export function TimelineItem({ 
  icon: Icon, 
  title, 
  description, 
  time, 
  color = "blue",
  isLast = false 
}) {
  const colorClasses = {
    blue: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400",
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400",
    purple: "bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-400",
    red: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400",
  };

  return (
    <div className="relative flex gap-4 pb-6">
      {!isLast && (
        <div className="absolute left-5 top-10 h-full w-px bg-gray-200 dark:bg-gray-700" />
      )}
      <div className={cn(
        "relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        colorClasses[color] || colorClasses.blue
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 pt-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-gray-900 dark:text-white">{title}</p>
          {time && (
            <span className="shrink-0 text-xs text-gray-500">{time}</span>
          )}
        </div>
        {description && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
        )}
      </div>
    </div>
  );
}

export function SectionCard({ title, icon: Icon, action, children, className }) {
  return (
    <div className={cn(
      "rounded-xl border bg-white shadow-sm dark:bg-gray-900 dark:border-gray-800",
      className
    )}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b px-5 py-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="h-5 w-5 text-gray-500" />}
            <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function TemperatureIndicator({ lastContactAt, className }) {
  if (!lastContactAt) return null;
  
  const days = differenceInDays(new Date(), new Date(lastContactAt));
  
  let temp, label, colors;
  if (days <= 2) {
    temp = "hot";
    label = "Quente";
    colors = "bg-gradient-to-r from-red-500 to-orange-500 text-white";
  } else if (days <= 5) {
    temp = "warm";
    label = "Morno";
    colors = "bg-gradient-to-r from-yellow-400 to-amber-500 text-white";
  } else {
    temp = "cold";
    label = "Frio";
    colors = "bg-gradient-to-r from-blue-400 to-cyan-500 text-white";
  }

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold shadow-sm",
      colors,
      className
    )}>
      <Zap className="h-3 w-3" />
      {label}
      <span className="opacity-75">({days}d)</span>
    </div>
  );
}

export function StageProgress({ stages, currentStage, onStageClick, className }) {
  const currentIndex = stages.findIndex(s => s.value === currentStage);
  
  return (
    <div className={cn("relative", className)}>
      <div className="absolute top-4 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
      <div 
        className="absolute top-4 left-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500"
        style={{ width: `${(currentIndex / (stages.length - 1)) * 100}%` }}
      />
      <div className="relative flex justify-between">
        {stages.map((stage, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = stage.value === currentStage;
          
          return (
            <button
              key={stage.value}
              onClick={() => onStageClick?.(stage.value)}
              className={cn(
                "flex flex-col items-center gap-2 transition-all",
                onStageClick && "cursor-pointer hover:scale-105"
              )}
            >
              <div className={cn(
                "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all",
                isCurrent && "border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-500/30",
                isCompleted && !isCurrent && "border-blue-500 bg-blue-500 text-white",
                !isCompleted && "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
              )}>
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>
              <span className={cn(
                "text-[10px] font-medium text-center max-w-[60px]",
                isCurrent ? "text-blue-600 dark:text-blue-400" : "text-gray-500"
              )}>
                {stage.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
