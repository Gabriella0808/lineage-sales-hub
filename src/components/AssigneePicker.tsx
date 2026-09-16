import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Users, Check, X } from "lucide-react";

export interface AssignableUser {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: "admin" | "manager" | "rep";
}

// Compact assignee multi-picker used across follow-up/task creation flows
export interface AssigneePickerProps {
  users: AssignableUser[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

export function AssigneePicker({ users, selectedIds, onChange }: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const unique = Array.from(new Map(users.map((u) => [u.user_id, u])).values());
  const filtered = unique.filter((u) => {
    const q = query.toLowerCase();
    return !q || (u.full_name ?? "").toLowerCase().includes(q) || (u.email ?? "").toLowerCase().includes(q);
  });

  const selectedUsers = unique.filter((u) => selectedIds.includes(u.user_id));

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
    setOpen(false);
  };


  return (
    <div className="space-y-1.5">
      {/* modal: this Popover lives inside the "New To Do" Dialog. Radix
          Dialog scroll-locks the page and only allows scroll/wheel input
          within its own content subtree — a Popover's portaled content sits
          outside that subtree, so without `modal` here, clicks/typing still
          reach it but mouse-wheel scrolling silently does nothing. Making
          this Popover modal gives it its own scroll/focus layer that nests
          correctly inside the Dialog's. */}
      <Popover modal open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full justify-start font-normal">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {selectedUsers.length === 0
              ? "Assign to…"
              : selectedUsers.map((u) => u.full_name || u.email).join(", ")}
          </Button>
        </PopoverTrigger>
        {/* Plain scrollable list rather than cmdk's Command/CommandList — the
            latter's internal scroll doesn't reliably receive wheel/touch
            events when nested inside a Popover that's itself inside a Dialog
            (this picker lives in the "New To Do" dialog), leaving a long
            user list visually clipped with no way to reach the rest of it. */}
        <PopoverContent className="w-64 p-0" align="start">
          <div className="p-2 border-b">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users…"
              className="w-full h-8 text-xs px-2 rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground p-2">No users found</p>
            )}
            {filtered.map((u) => {
              const isOn = selectedIds.includes(u.user_id);
              return (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => toggle(u.user_id)}
                  className={cn(
                    "w-full text-left text-sm px-2 py-1.5 rounded flex items-center hover:bg-muted",
                    isOn && "bg-primary/10",
                  )}
                >
                  <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", isOn ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{u.full_name || u.email}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground capitalize shrink-0">{u.role}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedUsers.map((u) => (
            <Badge key={u.user_id} variant="secondary" className="font-normal text-xs gap-1">
              {u.full_name || u.email}
              <button
                type="button"
                onClick={() => toggle(u.user_id)}
                className="ml-0.5 rounded-full opacity-60 hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
