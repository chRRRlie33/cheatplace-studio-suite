import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Filter, Clock, User, Mail } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type LogMetadata = {
  username?: string;
  email?: string;
  offer_title?: string;
  [key: string]: unknown;
};

export const LogsViewer = () => {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: logs } = useQuery({
    queryKey: ["logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const filteredLogs = logs?.filter((log) => {
    const matchesAction = actionFilter === "all" || log.action_type === actionFilter;
    const metadata = log.metadata as LogMetadata | null;
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      log.message.toLowerCase().includes(searchLower) ||
      metadata?.username?.toLowerCase().includes(searchLower) ||
      metadata?.email?.toLowerCase().includes(searchLower);
    return matchesAction && matchesSearch;
  });

  const getActionBadgeVariant = (action: string) => {
    switch (action) {
      case "login":
        return "default";
      case "logout":
        return "secondary";
      case "signup":
        return "outline";
      case "download":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "login":
        return "Connexion";
      case "logout":
        return "Déconnexion";
      case "signup":
        return "Inscription";
      case "download":
        return "Téléchargement";
      default:
        return action;
    }
  };

  return (
    <Card className="card-glow">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Journaux d'activité
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par utilisateur, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Type d'action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les actions</SelectItem>
                <SelectItem value="login">Connexions</SelectItem>
                <SelectItem value="logout">Déconnexions</SelectItem>
                <SelectItem value="signup">Inscriptions</SelectItem>
                <SelectItem value="download">Téléchargements</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Logs list */}
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {filteredLogs?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun log trouvé
            </div>
          ) : (
            filteredLogs?.map((log) => {
              const metadata = log.metadata as LogMetadata | null;
              return (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border rounded-lg bg-card/50 hover:bg-card/80 transition-colors gap-2"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={getActionBadgeVariant(log.action_type)}>
                        {getActionLabel(log.action_type)}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM yyyy 'à' HH:mm:ss", { locale: fr })}
                      </span>
                    </div>
                    <p className="text-sm">{log.message}</p>
                    {metadata && (metadata.username || metadata.email) && (
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {metadata.username && (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {metadata.username}
                          </span>
                        )}
                        {metadata.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {metadata.email}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t">
          {["login", "logout", "signup", "download"].map((action) => {
            const count = logs?.filter((l) => l.action_type === action).length || 0;
            return (
              <div key={action} className="text-center">
                <div className="text-2xl font-bold text-primary">{count}</div>
                <div className="text-xs text-muted-foreground">{getActionLabel(action)}s</div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
