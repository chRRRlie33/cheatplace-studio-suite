import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const AdminNotifications = () => {
  const { role } = useAuth();
  const [events, setEvents] = useState<string[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    console.log('🔍 AdminNotifications - Role:', role);
    
    if (role !== 'admin') {
      console.log('❌ Pas admin, arrêt');
      return;
    }

    console.log('✅ Admin détecté, création subscription...');

    const channel = supabase
      .channel('test-notifs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs'
        },
        (payload) => {
          console.log('🎉 ÉVÉNEMENT REÇU !', payload);
          const log = payload.new as any;
          const newEvent = `${log.action_type} - ${new Date().toLocaleTimeString()}`;
          setEvents(prev => [newEvent, ...prev].slice(0, 5));
        }
      )
      .subscribe((status) => {
        console.log('📡 Status subscription:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ SUBSCRIBED !');
          setIsSubscribed(true);
        }
      });

    return () => {
      console.log('🔌 Cleanup subscription');
      supabase.removeChannel(channel);
    };
  }, [role]);

  // ⚠️ TOUJOURS AFFICHER si admin (même sans événements)
  if (role !== 'admin') return null;

  return (
    <div 
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[500px]"
      style={{ 
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        color: 'white',
        padding: '20px',
        borderRadius: '10px',
        border: '2px solid lime'
      }}
    >
      <div style={{ marginBottom: '10px', fontWeight: 'bold', fontSize: '18px' }}>
        🔔 Admin Notifications
      </div>
      
      <div style={{ marginBottom: '10px', fontSize: '14px' }}>
        Status: {isSubscribed ? '✅ Connecté' : '⏳ En attente...'}
      </div>

      <div style={{ marginBottom: '10px', fontSize: '14px' }}>
        Événements reçus: {events.length}
      </div>

      {events.length === 0 ? (
        <div style={{ 
          backgroundColor: 'rgba(255, 255, 0, 0.2)',
          padding: '10px',
          borderRadius: '5px',
          fontSize: '12px'
        }}>
          ⚠️ Aucun événement reçu. Faites une connexion/déconnexion pour tester.
        </div>
      ) : (
        <div style={{ 
          backgroundColor: 'rgba(0, 255, 0, 0.2)',
          padding: '10px',
          borderRadius: '5px'
        }}>
          {events.map((evt, i) => (
            <div key={i} style={{ 
              fontSize: '12px',
              marginBottom: '5px',
              borderBottom: '1px solid rgba(255,255,255,0.2)',
              paddingBottom: '5px'
            }}>
              {evt}
            </div>
          ))}
        </div>
      )}

      <div style={{ 
        marginTop: '15px',
        fontSize: '11px',
        color: 'rgba(255,255,255,0.6)'
      }}>
        💡 Ouvrez la console (F12) pour voir les logs détaillés
      </div>
    </div>
  );
};
