import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { isDisposableEmail } from "@/lib/disposable-emails";

type AppRole = "client" | "vendor" | "admin";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (username: string, email: string, password: string, role?: AppRole) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .order("role", { ascending: true })
        .limit(1)
        .single();

      if (!error && data) {
        setRole(data.role as AppRole);
      } else {
        setRole("client");
      }
    } catch (error) {
      console.error("Error fetching role:", error);
      setRole("client");
    }
  };

  const getClientIP = async (): Promise<string | null> => {
    try {
      const response = await fetch('https://api.ipify.org?format=json');
      const data = await response.json();
      return data.ip;
    } catch (error) {
      console.error("Error fetching IP:", error);
      return null;
    }
  };

  const checkBannedEmail = async (email: string): Promise<boolean> => {
    const { data } = await supabase
      .from("banned_emails")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    return !!data;
  };

  const checkBannedIP = async (ip: string): Promise<boolean> => {
    if (!ip) return false;
    const { data } = await supabase
      .from("banned_ips")
      .select("*")
      .eq("ip_address", ip)
      .maybeSingle();
    return !!data;
  };

  const checkUserActive = async (userId: string): Promise<boolean> => {
    const { data } = await supabase
      .from("profiles")
      .select("active")
      .eq("id", userId)
      .single();
    return data?.active !== false;
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Vérifier si l'utilisateur est actif
          const isActive = await checkUserActive(session.user.id);
          if (!isActive) {
            // Utilisateur banni - forcer la déconnexion
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setRole(null);
            navigate("/auth");
            return;
          }

          // Vérifier l'email et l'IP
          const clientIP = await getClientIP();
          const isEmailBanned = await checkBannedEmail(session.user.email || '');
          const isIPBanned = clientIP ? await checkBannedIP(clientIP) : false;

          if (isEmailBanned || isIPBanned) {
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setRole(null);
            navigate("/auth");
            return;
          }

          setTimeout(() => {
            fetchRole(session.user.id);
          }, 0);
        } else {
          setRole(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // Vérifier si l'utilisateur est actif
        const isActive = await checkUserActive(session.user.id);
        if (!isActive) {
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        // Vérifier l'email et l'IP
        const clientIP = await getClientIP();
        const isEmailBanned = await checkBannedEmail(session.user.email || '');
        const isIPBanned = clientIP ? await checkBannedIP(clientIP) : false;

        if (isEmailBanned || isIPBanned) {
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        setSession(session);
        setUser(session.user);
        fetchRole(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      // Vérifier si c'est un email temporaire
      if (isDisposableEmail(email)) {
        return { error: { message: "Les emails temporaires ne sont pas autorisés. Veuillez utiliser une adresse email permanente." } };
      }

      // Vérifier si l'email est banni AVANT la connexion
      const isEmailBanned = await checkBannedEmail(email);
      if (isEmailBanned) {
        return { error: { message: "Ce compte a été banni. Accès refusé." } };
      }

      // Vérifier si l'IP est bannie AVANT la connexion
      const clientIP = await getClientIP();
      if (clientIP) {
        const isIPBanned = await checkBannedIP(clientIP);
        if (isIPBanned) {
          return { error: { message: "Votre adresse IP a été bannie. Accès refusé." } };
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Vérifier si l'utilisateur est actif
      if (data.user) {
        const isActive = await checkUserActive(data.user.id);
        if (!isActive) {
          await supabase.auth.signOut();
          return { error: { message: "Ce compte a été banni. Accès refusé." } };
        }

        // Récupérer les infos du profil
        const { data: profileData } = await supabase
          .from("profiles")
          .select("login_count, username")
          .eq("id", data.user.id)
          .single();

        await supabase
          .from("profiles")
          .update({ 
            last_login: new Date().toISOString(),
            login_count: (profileData?.login_count || 0) + 1,
            ip_last_login: clientIP
          })
          .eq("id", data.user.id);

        // Log connexion avec détails complets
        const now = new Date();
        await supabase.from("logs").insert({
          user_id: data.user.id,
          action_type: "login",
          message: `Connexion de ${profileData?.username || 'Utilisateur'}`,
          metadata: { 
            email, 
            username: profileData?.username,
            ip: clientIP,
            date: now.toLocaleDateString('fr-FR'),
            time: now.toLocaleTimeString('fr-FR')
          },
        });
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (username: string, email: string, password: string, role: AppRole = "client") => {
    try {
      // Vérifier si c'est un email temporaire
      if (isDisposableEmail(email)) {
        return { error: { message: "Les emails temporaires ne sont pas autorisés. Veuillez utiliser une adresse email permanente." } };
      }

      // Récupérer l'IP du client pour l'inscription
      const clientIP = await getClientIP();

      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            username,
            role,
          },
        },
      });

      if (error) throw error;

      // Mettre à jour le profil avec l'IP d'inscription et de connexion
      if (data.user) {
        await supabase
          .from("profiles")
          .update({ 
            ip_signup: clientIP,
            ip_last_login: clientIP,
            last_login: new Date().toISOString(),
            login_count: 1
          })
          .eq("id", data.user.id);

        // Log inscription avec détails complets incluant l'IP
        const now = new Date();
        await supabase.from("logs").insert({
          user_id: data.user.id,
          action_type: "signup",
          message: `Inscription de ${username}`,
          metadata: { 
            email, 
            username,
            ip: clientIP,
            date: now.toLocaleDateString('fr-FR'),
            time: now.toLocaleTimeString('fr-FR')
          },
        });
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      // Essayer d'enregistrer le log de déconnexion avec détails
      if (user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        const now = new Date();
        const { error } = await supabase.from("logs").insert({
          user_id: user.id,
          action_type: "logout",
          message: `Déconnexion de ${profileData?.username || 'Utilisateur'}`,
          metadata: { 
            email: user.email,
            username: profileData?.username,
            date: now.toLocaleDateString('fr-FR'),
            time: now.toLocaleTimeString('fr-FR')
          },
        });

        if (error) {
          console.error("Error inserting logout log:", error);
        }
      }
    } catch (error) {
      console.error("Unexpected error during logout logging:", error);
    } finally {
      await supabase.auth.signOut();
      setRole(null);
      navigate("/");
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};