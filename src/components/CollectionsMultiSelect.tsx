import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Collection = { id: string; name: string };

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

export function CollectionsMultiSelect({ value, onChange }: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("product_collections")
      .select("id,name")
      .order("name");
    if (error) return toast.error(error.message);
    setCollections((data ?? []) as Collection[]);
  };

  useEffect(() => { load(); }, []);

  const toggle = (name: string) => {
    if (value.includes(name)) onChange(value.filter((v) => v !== name));
    else onChange([...value, name]);
  };

  const remove = (name: string) => onChange(value.filter((v) => v !== name));

  const filtered = collections.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const exactMatch = collections.some(
    (c) => c.name.toLowerCase() === search.trim().toLowerCase()
  );
  const canAdd = search.trim().length > 0 && !exactMatch;

  const addCollection = async () => {
    const name = search.trim();
    if (!name) return;
    setAdding(true);
    const { data, error } = await supabase
      .from("product_collections")
      .insert({ name, created_by: user?.id ?? null })
      .select("id,name")
      .single();
    setAdding(false);
    if (error) return toast.error(error.message);
    toast.success(`Added "${name}"`);
    setCollections((prev) => [...prev, data as Collection].sort((a, b) => a.name.localeCompare(b.name)));
    onChange([...value, name]);
    setSearch("");
  };

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className="text-muted-foreground">
              {value.length === 0
                ? "Select collections…"
                : `${value.length} selected`}
            </span>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or add new…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAdd) {
                  e.preventDefault();
                  addCollection();
                }
              }}
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && !canAdd && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                No collections found
              </div>
            )}
            {filtered.map((c) => {
              const selected = value.includes(c.name);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggle(c.name)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm hover:bg-accent text-left"
                >
                  <span>{c.name}</span>
                  <Check className={cn("h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                </button>
              );
            })}
            {canAdd && (
              <button
                type="button"
                onClick={addCollection}
                disabled={adding}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left border-t mt-1 text-primary"
              >
                <Plus className="h-3.5 w-3.5" />
                Add "{search.trim()}"
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name) => (
            <Badge key={name} variant="secondary" className="gap-1 pr-1">
              {name}
              <button
                type="button"
                onClick={() => remove(name)}
                className="hover:bg-muted-foreground/20 rounded-sm"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
