import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const RealtimeDebug = () => {
  const { role } = useAuth();
  const [lastEvent, setLastEvent] = useState<string>("");
  const [eventCount, setEventCount] = useState(0);

  useEffect(() => {
    if (role !== 'admin') return;

    console.log('🧪 TEST REALTIME DÉMARRÉ');

    const channel = supabase
      .channel('debug-test')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs'
        },
        (payload) => {
          console.log('🎊 ÉVÉNEMENT REALTIME REÇU !', payload);
          const log = payload.new as any;
          setLastEvent(`${log.action_type} - ${log.message}`);
          setEventCount(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        console.log('📡 Status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [role]);

  if (role !== 'admin') return null;

  return (
    <div 
      className="fixed top-20 right-4 bg-green-500 text-white p-4 rounded-lg shadow-xl z-[9999]"
      style={{ zIndex: 9999 }}
    >
      <div className="font-bold mb-2">🧪 Test Realtime</div>
      <div className="text-sm space-y-1">
        <div>Événements reçus: {eventCount}</div>
        <div className="text-xs mt-2 bg-black/20 p-2 rounded">
          {lastEvent || "En attente..."}
        </div>
      </div>
    </div>
  );
};
