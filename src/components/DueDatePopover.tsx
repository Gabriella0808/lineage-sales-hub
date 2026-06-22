import { useState } from "react";
import { format } from "date-fns";
import { Calendar } from "lucide-react";
import { cn, parseDateOnly } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";

interface DueDatePopoverProps {
  dueDate: string | null;
  onChange: (date: Date | null) => void;
  align?: "start" | "center" | "end";
  className?: string;
}

export function DueDatePopover({
  dueDate,
  onChange,
  align = "center",
  className,
}: DueDatePopoverProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex w-full h-full items-center justify-center gap-1 px-2 text-xs text-muted-foreground hover:bg-muted/40",
            className,
          )}
        >
          {dueDate ? (
            <>
              <Calendar className="h-3 w-3" />
              {format(parseDateOnly(dueDate)!, "MMM d")}
            </>
          ) : (
            <span className="italic">-</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        <CalendarPicker
          mode="single"
          selected={dueDate ? parseDateOnly(dueDate)! : undefined}
          onSelect={(d) => {
            onChange(d ?? null);
            setOpen(false);
          }}
          initialFocus
        />
        {dueDate && (
          <div className="p-2 border-t">
            <Button
              size="sm"
              variant="ghost"
              className="w-full text-xs"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
