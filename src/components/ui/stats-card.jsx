import * as React from "react"
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

function AnimatedCounter({ value, duration = 1.5 }) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (latest) => {
    if (typeof value === 'string') return value
    return Math.round(latest).toLocaleString('pt-BR')
  })
  const spring = useSpring(count, { duration: duration * 1000 })

  React.useEffect(() => {
    if (typeof value === 'number') {
      spring.set(value)
    }
  }, [value, spring])

  if (typeof value === 'string') {
    return <span>{value}</span>
  }

  return <motion.span>{rounded}</motion.span>
}

function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  gradient = "from-blue-500 to-cyan-500",
  className,
  delay = 0,
  ...props
}) {
  const trendColor = trend === 'up' 
    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40' 
    : trend === 'down' 
      ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40'
      : 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800'
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6",
        "bg-white dark:bg-gray-800/80",
        "border border-gray-100 dark:border-gray-700/50",
        "shadow-soft hover:shadow-soft-lg",
        "transition-shadow duration-300",
        className
      )}
      {...props}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl -translate-y-1/2 translate-x-1/2`} />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            {title}
          </p>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-3xl font-bold font-display tracking-tight text-gray-900 dark:text-white">
              <AnimatedCounter value={value} />
            </h3>
            {trendValue && (
              <span className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold",
                trendColor
              )}>
                <TrendIcon className="w-3 h-3" />
                {trendValue}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subtitle}
            </p>
          )}
        </div>
        
        {Icon && (
          <div className={cn(
            "flex-shrink-0 w-12 h-12 rounded-xl",
            `bg-gradient-to-br ${gradient}`,
            "flex items-center justify-center",
            "shadow-lg",
            gradient.includes('blue') && "shadow-blue-500/25",
            gradient.includes('emerald') && "shadow-emerald-500/25",
            gradient.includes('purple') && "shadow-purple-500/25",
            gradient.includes('amber') && "shadow-amber-500/25",
            gradient.includes('red') && "shadow-red-500/25",
          )}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function StatsCardGlass({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  gradient = "from-blue-500 to-cyan-500",
  className,
  delay = 0,
  ...props
}) {
  const trendColor = trend === 'up' 
    ? 'text-emerald-400' 
    : trend === 'down' 
      ? 'text-red-400'
      : 'text-gray-400'
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, delay }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
      className={cn(
        "relative overflow-hidden rounded-2xl p-6",
        "bg-white/10 dark:bg-white/5 backdrop-blur-xl",
        "border border-white/20 dark:border-white/10",
        "shadow-glass",
        className
      )}
      {...props}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10`} />
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/70 uppercase tracking-wider mb-2">
            {title}
          </p>
          <div className="flex items-baseline gap-2 mb-1">
            <h3 className="text-3xl font-bold font-display tracking-tight text-white">
              <AnimatedCounter value={value} />
            </h3>
            {trendValue && (
              <span className={cn("inline-flex items-center gap-1 text-xs font-semibold", trendColor)}>
                <TrendIcon className="w-3 h-3" />
                {trendValue}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-sm text-white/60">
              {subtitle}
            </p>
          )}
        </div>
        
        {Icon && (
          <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <Icon className="w-6 h-6 text-white" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function StatsGrid({ children, className, ...props }) {
  return (
    <div 
      className={cn(
        "grid gap-6",
        "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
        className
      )} 
      {...props}
    >
      {children}
    </div>
  )
}

function ProgressStats({
  title,
  value,
  max = 100,
  gradient = "from-blue-500 to-cyan-500",
  className,
  delay = 0,
  ...props
}) {
  const percentage = Math.min((value / max) * 100, 100)
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        "rounded-2xl p-4 bg-white dark:bg-gray-800/80",
        "border border-gray-100 dark:border-gray-700/50",
        "shadow-soft",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</span>
        <span className="text-sm font-bold text-gray-900 dark:text-white">{value}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, delay: delay + 0.2, ease: "easeOut" }}
          className={cn("h-full rounded-full bg-gradient-to-r", gradient)}
        />
      </div>
    </motion.div>
  )
}

export { StatsCard, StatsCardGlass, StatsGrid, ProgressStats, AnimatedCounter }