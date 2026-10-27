import { cn } from "@/lib/utils";

export function KpiGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 90 ? 'text-success' : score >= 75 ? 'text-primary' : score >= 60 ? 'text-warning' : 'text-destructive';
  const bgColor = score >= 90 ? 'bg-success' : score >= 75 ? 'bg-primary' : score >= 60 ? 'bg-warning' : 'bg-destructive';

  return (
    <div className={cn("flex items-center gap-2", size === 'sm' ? 'gap-1.5' : 'gap-2')}>
      <div className={cn("rounded-full bg-muted overflow-hidden", size === 'sm' ? 'w-12 h-1.5' : 'w-16 h-2')}>
        <div className={cn("h-full rounded-full transition-all", bgColor)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("font-semibold tabular-nums", color, size === 'sm' ? 'text-xs' : 'text-sm')}>{score}</span>
    </div>
  );
}
