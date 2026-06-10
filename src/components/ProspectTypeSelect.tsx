import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import { useProspectTypes, useCreateProspectType } from "@/hooks/useCrm";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const NEW_VALUE = "__new__";
const NONE_VALUE = "__none__";

interface Props {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  className?: string;
  triggerClassName?: string;
  compact?: boolean;
  placeholder?: string;
}

export function ProspectTypeSelect({ value, onChange, className, triggerClassName, compact, placeholder = "—" }: Props) {
  const { data: types = [] } = useProspectTypes();
  const create = useCreateProspectType();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const handleSelect = (v: string) => {
    if (v === NEW_VALUE) {
      setName("");
      setOpen(true);
      return;
    }
    onChange(v === NONE_VALUE ? null : v);
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const existing = types.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      onChange(existing.name);
      setOpen(false);
      return;
    }
    create.mutate(trimmed, {
      onSuccess: (row) => {
        onChange(row.name);
        toast({ title: "Prospect type added", description: row.name });
        setOpen(false);
      },
      onError: (e: any) => toast({ title: "Failed to add", description: e.message, variant: "destructive" }),
    });
  };

  return (
    <div className={className}>
      <Select value={value ?? NONE_VALUE} onValueChange={handleSelect}>
        <SelectTrigger
          className={cn(
            compact
              ? "h-7 text-xs border-0 bg-muted/60 hover:bg-muted px-2 py-0 w-fit min-w-[150px]"
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
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={create.isPending || !name.trim()}>
              {create.isPending ? "Adding…" : "Add type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
