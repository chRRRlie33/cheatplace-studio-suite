import { createContext, useContext, useEffect, useState, useRef } from "react";
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
  const { data } = await supabase.rpc("is_email_banned", { _email: email });
  return !!data;
};

const checkBannedIP = async (ip: string): Promise<boolean> => {
  if (!ip) return false;
  const { data } = await supabase.rpc("is_ip_banned", { _ip_address: ip });
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

const fetchUserRole = async (userId: string): Promise<AppRole> => {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role", { ascending: true })
      .limit(1)
      .single();
    if (!error && data) return data.role as AppRole;
    return "client";
  } catch {
    return "client";
  }
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // 1. First restore session from storage
    supabase.auth.getSession().then(async ({ data: { session: currentSession } }) => {
      if (currentSession?.user) {
        // Quick: set user/session immediately so UI renders
        setSession(currentSession);
        setUser(currentSession.user);

        // Then validate in background
        const [isActive, userRole] = await Promise.all([
          checkUserActive(currentSession.user.id),
          fetchUserRole(currentSession.user.id),
        ]);

        if (!isActive) {
          await supabase.auth.signOut();
          setUser(null);
          setSession(null);
          setRole(null);
        } else {
          setRole(userRole);
        }
      }
      setLoading(false);
    });

    // 2. Listen for future auth changes (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // Skip the initial INITIAL_SESSION event — we handle it above
        if (event === 'INITIAL_SESSION') return;

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          const [isActive, userRole] = await Promise.all([
            checkUserActive(newSession.user.id),
            fetchUserRole(newSession.user.id),
          ]);

          if (!isActive) {
            await supabase.auth.signOut();
            setUser(null);
            setSession(null);
            setRole(null);
            navigate("/auth");
            return;
          }
          setRole(userRole);
        } else {
          setRole(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  const signIn = async (email: string, password: string) => {
    try {
      if (isDisposableEmail(email)) {
        return { error: { message: "Les emails temporaires ne sont pas autorisés. Veuillez utiliser une adresse email permanente." } };
      }

      const [isEmailBanned, clientIP] = await Promise.all([
        checkBannedEmail(email),
        getClientIP(),
      ]);

      if (isEmailBanned) {
        return { error: { message: "Ce compte a été banni. Accès refusé." } };
      }

      if (clientIP) {
        const isIPBanned = await checkBannedIP(clientIP);
        if (isIPBanned) {
          return { error: { message: "Votre adresse IP a été bannie. Accès refusé." } };
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      if (data.user) {
        const isActive = await checkUserActive(data.user.id);
        if (!isActive) {
          await supabase.auth.signOut();
          return { error: { message: "Ce compte a été banni. Accès refusé." } };
        }

        // Fire-and-forget profile update + log (non-blocking)
        try {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("login_count, username")
            .eq("id", data.user.id)
            .single();

          const now = new Date();
          Promise.all([
            supabase.from("profiles").update({
              last_login: now.toISOString(),
              login_count: (profileData?.login_count || 0) + 1,
              ip_last_login: clientIP,
            }).eq("id", data.user.id),
            supabase.from("logs").insert({
              user_id: data.user.id,
              action_type: "login",
              message: `Connexion de ${profileData?.username || 'Utilisateur'}`,
              metadata: {
                email,
                username: profileData?.username,
                ip: clientIP,
                date: now.toLocaleDateString('fr-FR'),
                time: now.toLocaleTimeString('fr-FR'),
              },
            }),
          ]).catch(err => console.error("Non-critical login logging error:", err));
        } catch (e) {
          console.error("Non-critical profile update error:", e);
        }
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signUp = async (username: string, email: string, password: string, role: AppRole = "client") => {
    try {
      if (isDisposableEmail(email)) {
        return { error: { message: "Les emails temporaires ne sont pas autorisés. Veuillez utiliser une adresse email permanente." } };
      }

      const clientIP = await getClientIP();
      const redirectUrl = `${window.location.origin}/`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: { username, role },
        },
      });

      if (error) throw error;

      if (data.user) {
        const now = new Date();
        await Promise.all([
          supabase.from("profiles").update({
            ip_signup: clientIP,
            ip_last_login: clientIP,
            last_login: now.toISOString(),
            login_count: 1,
          }).eq("id", data.user.id),
          supabase.from("logs").insert({
            user_id: data.user.id,
            action_type: "signup",
            message: `Inscription de ${username}`,
            metadata: {
              email,
              username,
              ip: clientIP,
              date: now.toLocaleDateString('fr-FR'),
              time: now.toLocaleTimeString('fr-FR'),
            },
          }),
        ]);
      }

      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      if (user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        const now = new Date();
        await supabase.from("logs").insert({
          user_id: user.id,
          action_type: "logout",
          message: `Déconnexion de ${profileData?.username || 'Utilisateur'}`,
          metadata: {
            email: user.email,
            username: profileData?.username,
            date: now.toLocaleDateString('fr-FR'),
            time: now.toLocaleTimeString('fr-FR'),
          },
        });
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
