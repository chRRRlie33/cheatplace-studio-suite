import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

interface Notification {
  id: string;
  message: string;
  timestamp: number;
}

export const AdminNotifications = () => {
  const { role } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  useEffect(() => {
    if (role !== 'admin') return;

    const channel = supabase
      .channel('admin-notifs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs'
        },
        (payload) => {
          const log = payload.new as any;
          const actionMap: Record<string, string> = {
            user_login: 'CONNEXION',
            user_registered: 'INSCRIPTION',
            user_logout: 'DÉCONNEXION',
            download: 'TÉLÉCHARGEMENT',
          };

          const label = actionMap[log.action_type];
          if (!label) return;

          const meta = log.metadata as any;
          const username = meta?.username || 'Utilisateur';
          const now = new Date();
          const date = now.toLocaleDateString('fr-FR');
          const time = now.toLocaleTimeString('fr-FR');

          const id = `${Date.now()}-${Math.random()}`;
          const message = `${label} — ${username} — ${date} ${time}`;

          setNotifications(prev => [{ id, message, timestamp: Date.now() }, ...prev].slice(0, 5));

          // Auto-remove after 5 seconds
          setTimeout(() => {
            removeNotification(id);
          }, 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role, removeNotification]);

  if (role !== 'admin' || notifications.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-auto max-w-[90vw]">
      {notifications.map((notif) => (
        <div
          key={notif.id}
          className="bg-background/95 border border-primary/50 text-foreground px-5 py-3 rounded-lg shadow-lg backdrop-blur-sm animate-slide-up text-sm font-medium whitespace-nowrap"
        >
          🔔 {notif.message}
        </div>
      ))}
    </div>
  );
};
