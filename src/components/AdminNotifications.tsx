import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { X } from "lucide-react";

interface Notification {
  id: string;
  type: string;
  username: string;
  timestamp: string;
  message: string;
}

export const AdminNotifications = () => {
  const { role, loading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  // 🧪 LOG 1 : Surveille les changements de role et loading
  useEffect(() => {
    console.log('═══════════════════════════════════════');
    console.log('🔍 ADMIN NOTIFICATIONS - État actuel:');
    console.log('   Role:', role);
    console.log('   Type du role:', typeof role);
    console.log('   Loading:', loading);
    console.log('   Notifications count:', notifications.length);
    console.log('═══════════════════════════════════════');
  }, [role, loading, notifications.length]);

  // 🧪 LOG 2 : Logique principale avec logs détaillés
  useEffect(() => {
    console.log('');
    console.log('🚀 DÉMARRAGE useEffect principal');
    console.log('   → Role reçu:', role);
    console.log('   → Loading:', loading);

    // Vérification 1 : Loading
    if (loading) {
      console.log('⏳ EN ATTENTE - Le rôle est en cours de chargement...');
      console.log('   → Arrêt de l\'exécution');
      return;
    }
    console.log('✓ Loading terminé');

    // Vérification 2 : Role admin
    if (role !== 'admin') {
      console.log('❌ ACCÈS REFUSÉ - Rôle actuel:', role);
      console.log('   → Rôle requis: "admin"');
      console.log('   → Comparaison:', `"${role}" !== "admin"`);
      console.log('   → Arrêt de l\'exécution');
      return;
    }
    console.log('✅ ACCÈS AUTORISÉ - Utilisateur admin confirmé');

    // Création du channel
    console.log('');
    console.log('📡 CRÉATION DE LA SUBSCRIPTION...');
    console.log('   → Channel name: admin-notifications');
    console.log('   → Table: logs');
    console.log('   → Events: INSERT (TOUTES LES ACTIONS)');
    console.log('   → Aucun filtre - écoute TOUT');

    const channel = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs'
          // ✅ PLUS DE FILTRE - écoute TOUTES les insertions
        },
        (payload) => {
          console.log('');
          console.log('🎉🎉🎉 NOTIFICATION REÇUE ! 🎉🎉🎉');
          console.log('   → Payload complet:', payload);
          console.log('   → Payload.new:', payload.new);
          
          const log = payload.new as any;
          console.log('   → Log ID:', log.id);
          console.log('   → Action type:', log.action_type);
          console.log('   → Message:', log.message);
          console.log('   → Metadata:', log.metadata);
          console.log('   → Created at:', log.created_at);
          
          const metadata = log.metadata || {};
          
          // Labels pour tous les types d'actions
          const typeLabels: Record<string, string> = {
            'login': '🔓 CONNEXION',
            'logout': '🔒 DÉCONNEXION',
            'signup': '✨ INSCRIPTION',
            'download': '📥 TÉLÉCHARGEMENT',
            'upload': '📤 UPLOAD',
            'delete': '🗑️ SUPPRESSION',
            'update': '✏️ MODIFICATION',
            'create': '➕ CRÉATION'
          };

          const date = new Date(log.created_at);
          const formattedDate = date.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          });
          const formattedTime = date.toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });

          const notification: Notification = {
            id: log.id,
            type: typeLabels[log.action_type] || `📋 ${log.action_type.toUpperCase()}`,
            username: metadata.username || metadata.email || 'Utilisateur inconnu',
            timestamp: `${formattedDate} ${formattedTime}`,
            message: log.message || ''
          };

          console.log('📦 Notification créée:', notification);
          console.log('   → Ajout à la liste...');
          
          setNotifications(prev => {
            const newList = [notification, ...prev].slice(0, 10);
            console.log('   → Nouvelle liste (', newList.length, 'items):', newList);
            return newList;
          });

          // Auto-remove après 15 secondes (augmenté pour avoir le temps de lire)
          console.log('⏱️ Timer de suppression démarré (15s)');
          setTimeout(() => {
            console.log('🗑️ Suppression auto de la notification:', notification.id);
            setNotifications(prev => prev.filter(n => n.id !== notification.id));
          }, 15000);
        }
      )
      .subscribe((status) => {
        console.log('');
        console.log('📊 CHANGEMENT DE STATUS DE LA SUBSCRIPTION');
        console.log('   → Nouveau status:', status);
        
        if (status === 'SUBSCRIBED') {
          console.log('✅✅✅ SUBSCRIPTION ACTIVE ET FONCTIONNELLE ✅✅✅');
          console.log('   → Le composant écoute maintenant TOUS les changements');
          console.log('   → Toutes les actions seront notifiées !');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ ERREUR DE CHANNEL');
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ TIMEOUT DE LA SUBSCRIPTION');
        } else if (status === 'CLOSED') {
          console.log('🔌 Channel fermé');
        }
      });

    // Cleanup
    return () => {
      console.log('');
      console.log('🔌 NETTOYAGE - Fermeture de la subscription');
      console.log('   → Suppression du channel admin-notifications');
      supabase.removeChannel(channel);
      console.log('   ✓ Channel supprimé');
    };
  }, [role, loading]);

  const removeNotification = (id: string) => {
    console.log('');
    console.log('🗑️ SUPPRESSION MANUELLE');
    console.log('   → Notification ID:', id);
    setNotifications(prev => {
      const filtered = prev.filter(n => n.id !== id);
      console.log('   → Notifications restantes:', filtered.length);
      return filtered;
    });
  };

  // Render conditions avec logs
  if (loading) {
    console.log('🎨 RENDER: Composant masqué (loading en cours)');
    return null;
  }

  if (role !== 'admin') {
    console.log('🎨 RENDER: Composant masqué (pas admin)');
    return null;
  }

  if (notifications.length === 0) {
    console.log('🎨 RENDER: Composant masqué (aucune notification)');
    return null;
  }

  console.log('🎨 RENDER: Affichage de', notifications.length, 'notification(s)');

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex flex-col gap-2 max-w-2xl w-full px-4">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className="bg-primary/90 backdrop-blur-sm text-primary-foreground px-4 py-3 rounded-lg shadow-lg flex items-start justify-between gap-4 animate-in slide-in-from-top-2 duration-300"
        >
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
              <span className="font-bold">{notification.type}</span>
              <span>—</span>
              <span>{notification.username}</span>
              <span>—</span>
              <span className="text-primary-foreground/80">{notification.timestamp}</span>
            </div>
            {notification.message && (
              <div className="text-xs text-primary-foreground/70 mt-1">
                {notification.message}
              </div>
            )}
          </div>
          <button
            onClick={() => removeNotification(notification.id)}
            className="text-primary-foreground/70 hover:text-primary-foreground transition-colors flex-shrink-0"
            aria-label="Fermer la notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
