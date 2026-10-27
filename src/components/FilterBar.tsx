import { Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (val: string) => void;
  filters?: Array<{
    label: string;
    value: string;
    onChange: (val: string) => void;
    options: Array<{ label: string; value: string }>;
  }>;
}

export function FilterBar({ searchPlaceholder = "Search...", searchValue, onSearchChange, filters = [] }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5">
      <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={e => onSearchChange(e.target.value)}
          className="pl-9 text-sm bg-card"
        />
      </div>
      {filters.map((f, i) => (
        <Select key={i} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="flex-1 min-w-[140px] sm:flex-none sm:w-[180px] text-sm bg-card">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {f.label}</SelectItem>
            {f.options.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
