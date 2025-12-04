import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Shield, Mail, Lock } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";

const loginSchema = z.object({
  email: z.string().email({ message: "Email invalide" }),
  password: z.string().min(6, { message: "Le mot de passe doit contenir au moins 6 caractères" }),
});

const signupSchema = z.object({
  username: z.string().min(3, { message: "Le nom d'utilisateur doit contenir au moins 3 caractères" }).max(50),
  email: z.string().email({ message: "Email invalide" }),
  password: z.string().min(6, { message: "Le mot de passe doit contenir au moins 6 caractères" }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

// Admin role assignment removed for security - use database-level promotion only

const Auth = () => {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  
  // Verification code states
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [pendingAuth, setPendingAuth] = useState<{
    type: 'login' | 'signup';
    email: string;
    password: string;
    username?: string;
  } | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const checkBanned = async (email: string): Promise<boolean> => {
    const { data: bannedData } = await supabase
      .from("banned_emails")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    
    return !!bannedData;
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

  const checkBannedIP = async (ip: string): Promise<boolean> => {
    if (!ip) return false;
    const { data } = await supabase
      .from("banned_ips")
      .select("*")
      .eq("ip_address", ip)
      .maybeSingle();
    return !!data;
  };

  const checkUsernameExists = async (username: string): Promise<boolean> => {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("username", username)
      .maybeSingle();
    
    return !!data;
  };

  const sendVerificationCode = async (email: string, type: 'login' | 'signup') => {
    setSendingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-verification-email', {
        body: { email, type }
      });

      if (error) {
        throw new Error(error.message || "Erreur lors de l'envoi du code");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success("Code de vérification envoyé par email !");
      return true;
    } catch (error: any) {
      console.error("Error sending verification code:", error);
      toast.error(error.message || "Erreur lors de l'envoi du code");
      return false;
    } finally {
      setSendingCode(false);
    }
  };

  const verifyCode = async (email: string, code: string, type: 'login' | 'signup'): Promise<boolean> => {
    setVerifyingCode(true);
    try {
      const { data, error } = await supabase.functions.invoke('verify-code', {
        body: { email, code, type }
      });

      if (error) {
        throw new Error(error.message || "Erreur de vérification");
      }

      if (data?.error || !data?.valid) {
        throw new Error(data?.error || "Code invalide ou expiré");
      }

      return true;
    } catch (error: any) {
      console.error("Error verifying code:", error);
      toast.error(error.message || "Code invalide ou expiré");
      return false;
    } finally {
      setVerifyingCode(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
      
      setLoading(true);

      // Vérifier si l'IP est bannie AVANT tout
      const clientIP = await getClientIP();
      if (clientIP) {
        const isIPBanned = await checkBannedIP(clientIP);
        if (isIPBanned) {
          toast.error("Votre adresse IP a été bannie. Accès refusé.");
          setLoading(false);
          return;
        }
      }

      // Vérifier si l'email est banni
      const isBanned = await checkBanned(loginEmail);
      if (isBanned) {
        toast.error("Ce compte a été banni. Accès refusé.");
        setLoading(false);
        return;
      }

      // Envoyer le code de vérification
      const codeSent = await sendVerificationCode(loginEmail, 'login');
      if (codeSent) {
        setPendingAuth({
          type: 'login',
          email: loginEmail,
          password: loginPassword
        });
        setShowVerification(true);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Erreur lors de la connexion");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      signupSchema.parse({
        username: signupUsername,
        email: signupEmail,
        password: signupPassword,
        confirmPassword,
      });
      
      setLoading(true);

      // Vérifier si l'IP est bannie
      const clientIP = await getClientIP();
      if (clientIP) {
        const isIPBanned = await checkBannedIP(clientIP);
        if (isIPBanned) {
          toast.error("Votre adresse IP a été bannie. Accès refusé.");
          setLoading(false);
          return;
        }
      }

      // Vérifier si l'email est banni
      const isBanned = await checkBanned(signupEmail);
      if (isBanned) {
        toast.error("Cet email a été banni. Accès refusé.");
        setLoading(false);
        return;
      }

      // Vérifier si le username existe déjà
      const usernameExists = await checkUsernameExists(signupUsername);
      if (usernameExists) {
        toast.error("Ce nom d'utilisateur est déjà pris");
        setLoading(false);
        return;
      }

      // Envoyer le code de vérification
      const codeSent = await sendVerificationCode(signupEmail, 'signup');
      if (codeSent) {
        setPendingAuth({
          type: 'signup',
          email: signupEmail,
          password: signupPassword,
          username: signupUsername
        });
        setShowVerification(true);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error("Erreur d'inscription");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!pendingAuth || verificationCode.length !== 6) {
      toast.error("Veuillez entrer le code à 6 chiffres");
      return;
    }

    const isValid = await verifyCode(pendingAuth.email, verificationCode, pendingAuth.type);
    
    if (!isValid) return;

    setLoading(true);

    try {
      if (pendingAuth.type === 'login') {
        const { error } = await signIn(pendingAuth.email, pendingAuth.password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Identifiants incorrects");
          } else {
            toast.error(error.message || "Erreur de connexion");
          }
        } else {
          toast.success("Connexion réussie !");
          navigate("/");
        }
      } else {
        const { error } = await signUp(
          pendingAuth.username!,
          pendingAuth.email,
          pendingAuth.password
        );
        
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("Cet email est déjà utilisé");
          } else if (error.message.includes("duplicate key") || error.message.includes("unique constraint")) {
            toast.error("Ce nom d'utilisateur ou cet email est déjà utilisé");
          } else {
            toast.error(error.message || "Erreur d'inscription");
          }
        } else {
          toast.success("Compte créé avec succès !");
          navigate("/");
        }
      }
    } catch (error) {
      toast.error("Erreur lors de l'authentification");
    } finally {
      setLoading(false);
      setShowVerification(false);
      setPendingAuth(null);
      setVerificationCode("");
    }
  };

  const handleResendCode = async () => {
    if (!pendingAuth) return;
    await sendVerificationCode(pendingAuth.email, pendingAuth.type);
  };

  const handleBackToLogin = () => {
    setShowVerification(false);
    setPendingAuth(null);
    setVerificationCode("");
  };

  // Écran de vérification du code
  if (showVerification) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md animate-slide-up">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <Mail className="h-12 w-12 text-primary animate-glow" />
            </div>
            <h1 className="text-2xl font-display font-bold text-glow-cyan mb-2">
              Vérification
            </h1>
            <p className="text-muted-foreground">
              Un code à 6 chiffres a été envoyé à<br />
              <span className="text-foreground font-medium">{pendingAuth?.email}</span>
            </p>
          </div>

          <Card className="card-glow">
            <CardHeader>
              <CardTitle className="text-center">Entrez le code</CardTitle>
              <CardDescription className="text-center">
                Vérifiez vos emails (pensez aux spams)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center">
                <InputOTP
                  maxLength={6}
                  value={verificationCode}
                  onChange={(value) => setVerificationCode(value)}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>

              <Button 
                onClick={handleVerifyCode}
                className="w-full bg-gradient-button shadow-glow-cyan"
                disabled={verificationCode.length !== 6 || verifyingCode || loading}
              >
                {verifyingCode || loading ? "Vérification..." : "Vérifier"}
              </Button>

              <div className="flex flex-col gap-2">
                <Button 
                  variant="ghost" 
                  onClick={handleResendCode}
                  disabled={sendingCode}
                  className="w-full"
                >
                  {sendingCode ? "Envoi..." : "Renvoyer le code"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={handleBackToLogin}
                  className="w-full"
                >
                  Retour
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <Shield className="h-12 w-12 text-primary animate-glow" />
            <div>
              <h1 className="text-4xl font-display font-bold text-glow-cyan">CHEATPLACE</h1>
              <p className="text-sm text-muted-foreground">-STUDIO</p>
            </div>
          </div>
          <p className="text-muted-foreground">
            Le marketplace ultime pour les cheaters et gamers
          </p>
        </div>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">Connexion</TabsTrigger>
            <TabsTrigger value="signup">Inscription</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card className="card-glow">
              <CardHeader>
                <CardTitle>Connexion</CardTitle>
                <CardDescription>
                  Connectez-vous à votre compte
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-button shadow-glow-cyan"
                    disabled={loading || sendingCode}
                  >
                    {loading || sendingCode ? "Envoi du code..." : "Se connecter"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="signup">
            <Card className="card-glow">
              <CardHeader>
                <CardTitle>Inscription</CardTitle>
                <CardDescription>
                  Créez votre compte gratuitement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-username">Nom d'utilisateur</Label>
                    <Input
                      id="signup-username"
                      type="text"
                      placeholder="VotreUsername"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="votre@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Mot de passe</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button 
                    type="submit" 
                    className="w-full bg-gradient-button shadow-glow-cyan"
                    disabled={loading || sendingCode}
                  >
                    {loading || sendingCode ? "Envoi du code..." : "Créer un compte"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Auth;