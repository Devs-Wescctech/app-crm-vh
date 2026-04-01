import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-200",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-sm shadow-blue-500/25",
        secondary:
          "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 ring-1 ring-inset ring-gray-200 dark:ring-gray-700",
        destructive:
          "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 ring-1 ring-inset ring-red-700/10 dark:ring-red-400/20",
        outline: 
          "bg-transparent border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300",
        success:
          "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-700/10 dark:ring-emerald-400/20",
        warning:
          "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-700/10 dark:ring-amber-400/20",
        info:
          "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-700/10 dark:ring-blue-400/20",
        purple:
          "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 ring-1 ring-inset ring-purple-700/10 dark:ring-purple-400/20",
        pink:
          "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300 ring-1 ring-inset ring-pink-700/10 dark:ring-pink-400/20",
        cyan:
          "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 ring-1 ring-inset ring-cyan-700/10 dark:ring-cyan-400/20",
        glow:
          "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-md shadow-blue-500/30 animate-glow-pulse",
        glass:
          "bg-white/20 dark:bg-gray-800/30 backdrop-blur-md border border-white/30 dark:border-gray-700/40 text-gray-800 dark:text-gray-100",
        gradient:
          "bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 text-white shadow-sm",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }