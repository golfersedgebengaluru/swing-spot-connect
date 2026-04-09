import { Bell, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { useNavigate } from "react-router-dom";
import { useState } from "react";

export function NotificationBell() {
  const { data: notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleClick = (n: NonNullable<typeof notifications>[number]) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.action_url) {
      setOpen(false);
      navigate(n.action_url);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">Notifications</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs" onClick={markAllAsRead}>
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {(notifications ?? []).length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">No notifications yet</p>
          ) : (
            <div className="divide-y divide-border">
              {(notifications ?? []).map((n) => (
                <button
                  key={n.id}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-muted/50",
                    !n.is_read && "bg-primary/5",
                    n.action_url && "cursor-pointer"
                  )}
                  onClick={() => handleClick(n)}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    <div className={cn("flex-1", !n.is_read ? "" : "ml-4")}>
                      <div className="flex items-center gap-1">
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        {n.action_url && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      </div>
                      <p className="text-xs text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
