import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, ChevronDown } from "lucide-react";
import { useProspectTypes, useCreateProspectType } from "@/hooks/useCrm";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NEW_VALUE = "__new__";
const NONE_VALUE = "__none__";

interface SingleProps {
  multi?: false;
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  className?: string;
  triggerClassName?: string;
  compact?: boolean;
  placeholder?: string;
}

interface MultiProps {
  multi: true;
  values: string[];
  onChangeMulti: (vs: string[]) => void;
  showAllOption?: boolean;
  allLabel?: string;
  className?: string;
  triggerClassName?: string;
  compact?: boolean;
  placeholder?: string;
}

type Props = SingleProps | MultiProps;

export function ProspectTypeSelect(props: Props) {
  const { data: types = [] } = useProspectTypes();
  const create = useCreateProspectType();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const submit = (afterAdd?: (n: string) => void) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = types.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      afterAdd?.(existing.name);
      setOpen(false);
      return;
    }
    create.mutate(trimmed, {
      onSuccess: (row) => {
        afterAdd?.(row.name);
        toast({ title: "Prospect type added", description: row.name });
        setOpen(false);
      },
      onError: (e: any) => toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
    });
  };

  if (props.multi) {
    const { values, onChangeMulti, showAllOption, allLabel = "All prospect types", compact, className, triggerClassName, placeholder = "—" } = props;
    const toggle = (n: string) => {
      const set = new Set(values);
      if (set.has(n)) set.delete(n); else set.add(n);
      onChangeMulti(Array.from(set));
    };
    const label = values.length === 0
      ? (showAllOption ? allLabel : placeholder)
      : values.length === 1
        ? values[0]
        : `${values.length} types`;
    return (
      <div className={className}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                compact
                  ? "h-7 text-[11px] bg-muted/60 hover:bg-muted px-2 py-0 rounded-md w-full min-w-0 inline-flex items-center gap-1.5 text-muted-foreground font-medium"
                  : "h-10 px-3 py-2 border border-input bg-background hover:bg-accent/10 rounded-md w-full inline-flex items-center gap-2 text-sm",
                triggerClassName,
              )}
            >
              <span className="truncate flex-1 text-left">{label}</span>
              <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-80 overflow-y-auto">
            {showAllOption && (
              <>
                <DropdownMenuCheckboxItem
                  checked={values.length === 0}
                  onCheckedChange={() => onChangeMulti([])}
                  onSelect={(e) => e.preventDefault()}
                >
                  {allLabel}
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
              </>
            )}
            {types.map((t) => (
              <DropdownMenuCheckboxItem
                key={t.id}
                checked={values.includes(t.name)}
                onCheckedChange={() => toggle(t.name)}
                onSelect={(e) => e.preventDefault()}
              >
                {t.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); setName(""); setOpen(true); }}
              className="text-accent"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />Add new type…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add prospect type</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Top 100 Furniture Stores"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit((n) => onChangeMulti(Array.from(new Set([...values, n])))); } }}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => submit((n) => onChangeMulti(Array.from(new Set([...values, n]))))} disabled={create.isPending || !name.trim()}>
                {create.isPending ? "Adding…" : "Add type"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const { value, onChange, className, triggerClassName, compact, placeholder = "—" } = props as SingleProps;
  const handleSelect = (v: string) => {
    if (v === NEW_VALUE) {
      setName("");
      setOpen(true);
      return;
    }
    onChange(v === NONE_VALUE ? null : v);
  };

  return (
    <div className={className}>
      <Select value={value ?? NONE_VALUE} onValueChange={handleSelect}>
        <SelectTrigger
          className={cn(
            compact
              ? "h-7 text-xs border-0 bg-muted/60 hover:bg-muted px-2 py-0 w-full min-w-0"
              : undefined,
            triggerClassName,
          )}
        >
          {compact ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              {value ?? placeholder}
            </span>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>—</SelectItem>
          {types.map((t) => (
            <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
          ))}
          <SelectItem value={NEW_VALUE} className="text-accent">
            <span className="inline-flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" />Add new type…</span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add prospect type</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Top 100 Furniture Stores"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit((n) => onChange(n)); } }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => submit((n) => onChange(n))} disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Adding…" : "Add type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
