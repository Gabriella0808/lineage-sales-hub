import { cn } from "@/lib/utils";

type BadgeVariant =
  | 'active' | 'inactive' | 'on-leave' | 'prospect'
  | 'at-risk' | 'on-track' | 'exceeding' | 'underperforming'
  | 'high' | 'medium' | 'low';

const variantStyles: Record<BadgeVariant, string> = {
  active:           'bg-success/10 text-success ring-success/20',
  inactive:         'bg-muted text-muted-foreground ring-border',
  'on-leave':       'bg-warning/10 text-warning ring-warning/20',
  prospect:         'bg-chart-4/10 text-chart-4 ring-chart-4/20',
  'at-risk':        'bg-destructive/10 text-destructive ring-destructive/20',
  'on-track':       'bg-success/10 text-success ring-success/20',
  exceeding:        'bg-accent/15 text-accent ring-accent/25',
  underperforming:  'bg-destructive/10 text-destructive ring-destructive/20',
  high:             'bg-success/10 text-success ring-success/20',
  medium:           'bg-warning/10 text-warning ring-warning/20',
  low:              'bg-destructive/10 text-destructive ring-destructive/20',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const variant = status as BadgeVariant;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-sm text-[10.5px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap ring-1 ring-inset",
        variantStyles[variant] || 'bg-muted text-muted-foreground ring-border',
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {status.replace(/-/g, ' ')}
    </span>
  );
}
