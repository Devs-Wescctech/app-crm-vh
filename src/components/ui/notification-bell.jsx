
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Bell, Check, CheckCheck, X, AlertCircle, Clock, TrendingUp, DollarSign, FileText, MessageSquare, CalendarClock } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const notificationIcons = {
  sla_warning: { icon: AlertCircle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-950" },
  ticket_assigned: { icon: FileText, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950" },
  customer_replied: { icon: MessageSquare, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-950" },
  proposal_accepted: { icon: Check, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-950" },
  proposal_rejected: { icon: X, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-950" },
  payment_overdue: { icon: DollarSign, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-950" },
  lead_cold: { icon: Clock, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-950" },
  signature_pending: { icon: FileText, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-950" },
  agreement_made: { icon: DollarSign, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-950" },
  ticket_reopened: { icon: AlertCircle, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-950" },
  activity_reminder: { icon: CalendarClock, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 dark:bg-indigo-950" },
};

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: () => base44.entities.Notification.filter({ user_email: user.email }, '-created_at', 50),
    enabled: !!user?.email,
    initialData: [],
    refetchInterval: 30000, // Refetch a cada 30 segundos
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { 
      read: true, 
      read_at: new Date().toISOString() 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadNotifications = notifications.filter(n => !n.read);
      await Promise.all(
        unreadNotifications.map(n => 
          base44.entities.Notification.update(n.id, { 
            read: true, 
            read_at: new Date().toISOString() 
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = notifications.filter(n => !n.read).length;
  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      setOpen(false);
    }
  };

  const NotificationItem = ({ notification }) => {
    const config = notificationIcons[notification.type] || notificationIcons.ticket_assigned;
    const Icon = config.icon;

    return (
      <div
        onClick={() => handleNotificationClick(notification)}
        className={cn(
          "p-3 border-b border-gray-200 dark:border-gray-800 cursor-pointer transition-colors",
          !notification.read 
            ? "bg-blue-50 dark:bg-blue-950 hover:bg-blue-100 dark:hover:bg-blue-900" 
            : "hover:bg-gray-50 dark:hover:bg-gray-900"
        )}
      >
        <div className="flex gap-3">
          <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${config.color}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className={cn(
                "text-sm font-medium text-gray-900 dark:text-gray-100",
                !notification.read && "font-semibold"
              )}>
                {notification.title}
              </p>
              {notification.priority === 'urgent' && (
                <Badge className="bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 text-xs shrink-0">
                  Urgente
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
              {notification.message}
            </p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {notification.created_at ? format(new Date(notification.created_at), "dd/MM HH:mm", { locale: ptBR }) : 'Agora'}
              </span>
              {!notification.read && (
                <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          {unreadCount > 0 && (
            <>
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center bg-red-500 text-white text-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="end">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Notificações
          </h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              className="text-xs"
            >
              <CheckCheck className="w-3 h-3 mr-1" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <Tabs defaultValue="unread" className="w-full">
          <TabsList className="w-full grid grid-cols-2 bg-gray-100 dark:bg-gray-900">
            <TabsTrigger value="unread">
              Não lidas ({unreadCount})
            </TabsTrigger>
            <TabsTrigger value="all">
              Todas ({notifications.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="unread" className="m-0">
            <ScrollArea className="h-[400px]">
              {unreadNotifications.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                  <p className="text-sm">Nenhuma notificação não lida</p>
                </div>
              ) : (
                unreadNotifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="all" className="m-0">
            <ScrollArea className="h-[400px]">
              {notifications.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-700" />
                  <p className="text-sm">Nenhuma notificação</p>
                </div>
              ) : (
                notifications.map((notification) => (
                  <NotificationItem key={notification.id} notification={notification} />
                ))
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
