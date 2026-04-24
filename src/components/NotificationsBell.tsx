import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CheckCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notification[]);
  };

  useEffect(() => {
    load();
    if (!user) return;
    const channel = supabase
      .channel("notifications-bell")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unreadCount = items.filter((i) => !i.read_at).length;

  const markRead = async (id: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read_at: new Date().toISOString() } : i)));
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  };

  const markAllRead = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((i) => (i.read_at ? i : { ...i, read_at: now })));
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null);
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    await supabase.from("notifications").delete().eq("id", id);
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[420px]">
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">No notifications yet</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const isUnread = !n.read_at;
                const content = (
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${isUnread ? "font-semibold" : ""}`}>{n.title}</p>
                    {n.body && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </p>
                  </div>
                );
                return (
                  <li
                    key={n.id}
                    className={`flex items-start gap-2 p-3 hover:bg-muted/40 transition-colors ${
                      isUnread ? "bg-primary/5" : ""
                    }`}
                  >
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={() => {
                          setOpen(false);
                          if (isUnread) markRead(n.id);
                        }}
                        className="min-w-0 flex-1"
                      >
                        {content}
                      </Link>
                    ) : (
                      content
                    )}
                    <div className="flex flex-col gap-1 shrink-0">
                      {isUnread && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => markRead(n.id)}
                          title="Mark read"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => remove(n.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
