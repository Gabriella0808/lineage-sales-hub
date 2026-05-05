import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

type Tone = "default" | "accent" | "success" | "warning" | "destructive" | "muted";

const toneRing: Record<Tone, string> = {
  default: "before:bg-foreground/30",
  accent: "before:bg-accent",
  success: "before:bg-success",
  warning: "before:bg-warning",
  destructive: "before:bg-destructive",
  muted: "before:bg-muted-foreground/30",
};

const toneIcon: Record<Tone, string> = {
  default: "text-muted-foreground",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  muted: "text-muted-foreground",
};

interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  className?: string;
  onClick?: () => void;
  active?: boolean;
}

/**
 * Compact, editorial KPI tile. Vertical bronze accent rule
 * replaces the generic colored-bar card pattern.
 */
export function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
  onClick,
  active,
}: MetricCardProps) {
  const Tag: any = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "relative text-left w-full bg-card border border-border/70 rounded-md px-4 py-3.5 transition-all",
        "before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r",
        toneRing[tone],
        onClick && "hover:shadow-elev hover:-translate-y-px cursor-pointer",
        active && "ring-1 ring-accent/60 shadow-elev",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="section-label">{label}</span>
        {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", toneIcon[tone])} />}
      </div>
      <div className="mt-1.5 font-display text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </Tag>
  );
}
