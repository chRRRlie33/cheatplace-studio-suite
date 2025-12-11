import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const RealtimeTest = () => {
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    console.log('🧪 TEST REALTIME DÉMARRÉ');

    // Test 1: Écouter TOUS les événements sur la table logs (sans filtre)
    const channel = supabase
      .channel('realtime-test')
      .on(
        'postgres_changes',
        {
          event: '*', // TOUS les événements (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'logs'
        },
        (payload) => {
          console.log('');
          console.log('🎊🎊🎊 ÉVÉNEMENT REALTIME REÇU ! 🎊🎊🎊');
          console.log('Event:', payload.eventType);
          console.log('Table:', payload.table);
          console.log('Données:', payload.new);
          console.log('');

          setEvents(prev => [{
            time: new Date().toLocaleTimeString('fr-FR'),
            event: payload.eventType,
            data: payload.new
          }, ...prev].slice(0, 5));
        }
      )
      .subscribe((status) => {
        console.log('📡 Status Realtime Test:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ REALTIME TEST ACTIF - Connecte-toi maintenant !');
        }
      });

    return () => {
      console.log('🔌 Arrêt du test Realtime');
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg shadow-xl max-w-md z-50">
      <div className="font-bold text-green-400 mb-2">
        🧪 Test Realtime Active
      </div>
      <div className="text-xs space-y-2">
        {events.length === 0 ? (
          <div className="text-yellow-400">
            En attente d'événements... Faites un login/logout !
          </div>
        ) : (
          events.map((evt, i) => (
            <div key={i} className="border-t border-gray-700 pt-2">
              <div className="text-green-400">{evt.time} - {evt.event}</div>
              <div className="text-gray-400 text-[10px] mt-1">
                {JSON.stringify(evt.data, null, 2).slice(0, 200)}...
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
