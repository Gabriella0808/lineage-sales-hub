import { cn } from "@/lib/utils";

type BadgeVariant =
  | 'active' | 'inactive' | 'on-leave' | 'prospect'
  | 'at-risk' | 'on-track' | 'exceeding' | 'underperforming'
  | 'high' | 'medium' | 'low';

const dotColor: Record<BadgeVariant, string> = {
  active:           'bg-success',
  inactive:         'bg-muted-foreground/40',
  'on-leave':       'bg-warning',
  prospect:         'bg-chart-4',
  'at-risk':        'bg-destructive',
  'on-track':       'bg-success',
  exceeding:        'bg-accent',
  underperforming:  'bg-destructive',
  high:             'bg-success',
  medium:           'bg-warning',
  low:              'bg-destructive',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = status as BadgeVariant;
  const dot = dotColor[variant] || 'bg-muted-foreground/40';
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground capitalize",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {status.replace(/-/g, ' ')}
    </span>
  );
}
