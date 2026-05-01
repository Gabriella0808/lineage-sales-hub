import { cn } from "@/lib/utils";
import { LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  className?: string;
  variant?: 'default' | 'accent' | 'success' | 'warning' | 'destructive';
}

const variantClasses = {
  default: '',
  accent: 'border-l-4 border-l-accent',
  success: 'border-l-4 border-l-success',
  warning: 'border-l-4 border-l-warning',
  destructive: 'border-l-4 border-l-destructive',
};

export function StatCard({ title, value, subtitle, icon: Icon, trend, trendValue, className, variant = 'default' }: StatCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className={cn("stat-card", variantClasses[variant], className)}>
      <div className="flex items-start justify-between mb-2 sm:mb-3 gap-2">
        <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wider text-muted-foreground leading-tight">{title}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      </div>
      <p className="text-lg sm:text-2xl font-semibold tracking-tight break-words">{value}</p>
      <div className="flex items-center gap-2 mt-1">
        {trend && (
          <span className={cn("inline-flex items-center gap-1 text-xs font-medium",
            trend === 'up' && "text-success",
            trend === 'down' && "text-destructive",
            trend === 'neutral' && "text-muted-foreground"
          )}>
            <TrendIcon className="h-3 w-3" />
            {trendValue}
          </span>
        )}
        {subtitle && <span className="text-[11px] sm:text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}
