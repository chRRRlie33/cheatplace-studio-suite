import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import UserStats from "./pages/UserStats";
import NotFound from "./pages/NotFound";
import { AdminNotifications } from "@/components/AdminNotifications";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const queryClient = new QueryClient();

// Composant pour vérifier le ban IP au niveau global
const BanChecker = ({ children }: { children: React.ReactNode }) => {
  const [isBanned, setIsBanned] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkBan = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        const data = await response.json();
        const ip = data.ip;

        if (ip) {
          const { data: bannedData } = await supabase
            .from("banned_ips")
            .select("*")
            .eq("ip_address", ip)
            .maybeSingle();

          if (bannedData) {
            setIsBanned(true);
          }
        }
      } catch (error) {
        console.error("Error checking ban:", error);
      } finally {
        setChecking(false);
      }
    };

    checkBan();
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (isBanned) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="text-6xl mb-4">🚫</div>
          <h1 className="text-3xl font-bold text-destructive mb-4">Accès Refusé</h1>
          <p className="text-muted-foreground mb-4">
            Votre adresse IP a été bannie de ce site.
          </p>
          <p className="text-sm text-muted-foreground">
            Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <BanChecker>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AdminNotifications />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/stats" element={<UserStats />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </TooltipProvider>
        </AuthProvider>
      </BanChecker>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;