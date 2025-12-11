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
  const { role, loading } = useAuth(); // Ajoute "loading" si disponible dans ton hook
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    console.log('🔍 Debug - Role:', role, 'Loading:', loading, 'Type:', typeof role);

    // Attendre que le rôle soit chargé
    if (loading) {
      console.log('⏳ En attente du chargement du rôle...');
      return;
    }

    // Vérifier si c'est un admin
    if (role !== 'admin') {
      console.log('❌ Pas admin, rôle actuel:', role);
      return;
    }

    console.log('✅ Utilisateur admin détecté, activation de la subscription');

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
          console.log('🔔 Notification reçue:', payload);
          
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

          console.log('📬 Ajout notification:', notification);
          setNotifications(prev => [notification, ...prev].slice(0, 10));

          // Auto-remove après 10 secondes
          setTimeout(() => {
            console.log('🗑️ Suppression auto de la notification:', notification.id);
            setNotifications(prev => prev.filter(n => n.id !== notification.id));
          }, 10000);
        }
      )
      .subscribe((status) => {
        console.log('📡 Status de la subscription:', status);
      });

    return () => {
      console.log('🔌 Déconnexion de la subscription admin');
      supabase.removeChannel(channel);
    };
  }, [role, loading]); // Dépendances importantes

  const removeNotification = (id: string) => {
    console.log('❌ Suppression manuelle notification:', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  if (loading) {
    console.log('⏳ Composant en attente...');
    return null;
  }

  if (role !== 'admin') {
    console.log('👁️ Composant masqué (non-admin)');
    return null;
  }

  if (notifications.length === 0) {
    console.log('📭 Aucune notification à afficher');
    return null;
  }

  console.log('📬 Affichage de', notifications.length, 'notification(s)');

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
