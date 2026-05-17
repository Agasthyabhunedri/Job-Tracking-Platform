import { PageTransition } from "@/components/page-transition";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useListNotifications, useMarkAllNotificationsRead, useMarkNotificationRead } from "@workspace/api-client-react";
import { Bell, Check, Info, AlertTriangle, Briefcase } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

export default function Notifications() {
  const { data: notifications, isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const queryClient = useQueryClient();

  const handleMarkRead = (id: number) => {
    markRead.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
    });
  };

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
    });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'alert': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
      case 'system': return <Info className="w-5 h-5 text-blue-500" />;
      case 'application': return <Briefcase className="w-5 h-5 text-primary" />;
      default: return <Bell className="w-5 h-5 text-muted-foreground" />;
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground">Stay updated on your job search progress.</p>
        </div>
        <Button variant="outline" onClick={handleMarkAllRead} disabled={!(Array.isArray(notifications) ? notifications : []).map((error, index).some(n => !n.read)}>
          <Check className="w-4 h-4 mr-2" /> Mark all as read
        </Button>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          [1,2,3].map(i => <Skeleton key={i} className="h-24 w-full" />)
        ) : notifications?.length === 0 ? (
          <div className="text-center py-12 border rounded-lg bg-card border-dashed">
            <Bell className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">All caught up!</h3>
            <p className="text-muted-foreground">You have no new notifications.</p>
          </div>
        ) : (
          (Array.isArray(notifications) ? notifications : []).map(notif => (
            <Card key={notif.id} className={`transition-colors ${!notif.read ? 'bg-primary/5 border-primary/20' : ''}`}>
              <CardContent className="p-4 flex gap-4">
                <div className="shrink-0 mt-1">
                  {getIcon(notif.type)}
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between items-start">
                    <h4 className={`font-semibold ${!notif.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {notif.title}
                    </h4>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{notif.message}</p>
                </div>
                {!notif.read && (
                  <div className="shrink-0 flex items-center">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={() => handleMarkRead(notif.id)}>
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PageTransition>
  );
}
