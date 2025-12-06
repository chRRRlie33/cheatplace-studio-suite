import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { X } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  username: string;
  timestamp: string;
}

export const AdminNotifications = () => {
  const { role } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (role !== 'admin') return;

    // Écouter les nouveaux logs en temps réel
    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs',
          filter: 'action_type=in.(login,logout,signup)'
        },
        (payload) => {
          const log = payload.new as any;
          const metadata = log.metadata || {};
          
          const typeLabels: Record<string, string> = {
            'login': 'CONNEXION',
            'logout': 'DÉCONNEXION',
            'signup': 'INSCRIPTION'
          };

          const date = new Date(log.created_at);
          const formattedDate = date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          const formattedTime = date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit'
          });

          const notification: Notification = {
            id: log.id,
            type: typeLabels[log.action_type] || log.action_type.toUpperCase(),
            username: metadata.username || 'Utilisateur inconnu',
            timestamp: `${formattedDate} ${formattedTime}`
          };

          setNotifications(prev => [notification, ...prev].slice(0, 10));

          // Auto-remove après 10 secondes
          setTimeout(() => {
            setNotifications(prev => prev.filter(n => n.id !== notification.id));
          }, 10000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role]);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (role !== 'admin' || notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 max-w-lg w-full px-4">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-primary/90 backdrop-blur-sm text-primary-foreground px-4 py-3 rounded-lg shadow-lg flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300"
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="font-bold">{notification.type}</span>
            <span>—</span>
            <span>{notification.username}</span>
            <span>—</span>
            <span className="text-primary-foreground/80">{notification.timestamp}</span>
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-primary-foreground/70 hover:text-primary-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
