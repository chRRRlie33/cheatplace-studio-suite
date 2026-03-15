import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Key, Plus, Trash2, Copy, Check, History, User, Clock } from "lucide-react";
import { toast } from "sonner";

export const KeysManager = () => {
  const queryClient = useQueryClient();
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const [newKeys, setNewKeys] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: offers } = useQuery({
    queryKey: ["all-offers-for-keys"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select("id, title")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: keys, isLoading } = useQuery({
    queryKey: ["offer-keys", selectedOfferId],
    queryFn: async () => {
      if (!selectedOfferId) return [];
      const { data, error } = await supabase
        .from("offer_keys")
        .select("*")
        .eq("offer_id", selectedOfferId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOfferId,
  });

  const { data: usageLogs } = useQuery({
    queryKey: ["key-usage-logs", selectedOfferId],
    queryFn: async () => {
      if (!selectedOfferId) return [];
      const { data, error } = await supabase
        .from("key_usage_logs" as any)
        .select("*")
        .eq("offer_id", selectedOfferId)
        .order("used_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      
      // Fetch usernames for the user_ids
      const userIds = [...new Set((data as any[]).map((l: any) => l.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username")
        .in("id", userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.id, p.username]) || []);
      
      // Fetch key values
      const keyIds = [...new Set((data as any[]).map((l: any) => l.key_id))];
      const { data: keysData } = await supabase
        .from("offer_keys")
        .select("id, key_value")
        .in("id", keyIds);
      
      const keyMap = new Map(keysData?.map(k => [k.id, k.key_value]) || []);
      
      return (data as any[]).map((log: any) => ({
        ...log,
        username: profileMap.get(log.user_id) || "Inconnu",
        key_value: keyMap.get(log.key_id) || "Supprimée",
      }));
    },
    enabled: !!selectedOfferId,
  });

  const addKeysMutation = useMutation({
    mutationFn: async ({ offerId, keysText, maxUsesVal }: { offerId: string; keysText: string; maxUsesVal: number }) => {
      const keysList = keysText
        .split("\n")
        .map(k => k.trim())
        .filter(k => k.length > 0);

      if (keysList.length === 0) throw new Error("Aucune key valide");

      const rows = keysList.map(key_value => ({
        offer_id: offerId,
        key_value,
        max_uses: maxUsesVal,
        use_count: 0,
        used: false,
      }));

      const { error } = await supabase.from("offer_keys").insert(rows);
      if (error) throw error;

      return keysList.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["offer-keys"] });
      toast.success(`${count} key(s) ajoutée(s) !`);
      setNewKeys("");
      setMaxUses("1");
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erreur lors de l'ajout");
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { error } = await supabase.from("offer_keys").delete().eq("id", keyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["offer-keys"] });
      toast.success("Key supprimée");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const handleCopy = (value: string, id: string) => {
    navigator.clipboard.writeText(value);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddKeys = () => {
    if (!selectedOfferId) {
      toast.error("Sélectionnez d'abord une offre");
      return;
    }
    const maxUsesVal = parseInt(maxUses) || 1;
    if (maxUsesVal < 1) {
      toast.error("Le nombre d'utilisations doit être au moins 1");
      return;
    }
    addKeysMutation.mutate({ offerId: selectedOfferId, keysText: newKeys, maxUsesVal });
  };

  const usedCount = keys?.filter(k => k.used).length || 0;
  const availableCount = keys?.filter(k => !k.used).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-display font-bold">Gestion des Keys</h2>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Label>Sélectionner une offre</Label>
          <Select value={selectedOfferId} onValueChange={setSelectedOfferId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une offre..." />
            </SelectTrigger>
            <SelectContent>
              {offers?.map(offer => (
                <SelectItem key={offer.id} value={offer.id}>
                  {offer.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedOfferId && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-button shadow-glow-cyan self-end">
                <Plus className="h-4 w-4 mr-2" />
                Ajouter des keys
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter des keys</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Keys (une par ligne)</Label>
                  <Textarea
                    value={newKeys}
                    onChange={(e) => setNewKeys(e.target.value)}
                    placeholder={"KEY-XXXX-XXXX-XXXX\nKEY-YYYY-YYYY-YYYY\nKEY-ZZZZ-ZZZZ-ZZZZ"}
                    rows={8}
                  />
                  <p className="text-xs text-muted-foreground">
                    {newKeys.split("\n").filter(k => k.trim()).length} key(s) à ajouter
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Nombre d'utilisations max par key</Label>
                  <Input
                    type="number"
                    min="1"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    placeholder="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Chaque key pourra être utilisée {parseInt(maxUses) || 1} fois
                  </p>
                </div>
                <Button
                  onClick={handleAddKeys}
                  className="w-full bg-gradient-button"
                  disabled={addKeysMutation.isPending || !newKeys.trim()}
                >
                  {addKeysMutation.isPending ? "Ajout..." : "Ajouter"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {selectedOfferId && (
        <div className="flex gap-4">
          <Badge variant="secondary" className="text-sm px-3 py-1">
            <Key className="h-3 w-3 mr-1" />
            Total: {keys?.length || 0}
          </Badge>
          <Badge variant="default" className="bg-green-600 text-sm px-3 py-1">
            Disponibles: {availableCount}
          </Badge>
          <Badge variant="destructive" className="text-sm px-3 py-1">
            Épuisées: {usedCount}
          </Badge>
        </div>
      )}

      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Chargement...</p>
      ) : !selectedOfferId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Sélectionnez une offre pour gérer ses keys</p>
          </CardContent>
        </Card>
      ) : keys && keys.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>Aucune key pour cette offre. Ajoutez-en !</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {keys?.map((key) => (
            <Card key={key.id} className={`${key.used ? 'opacity-60' : ''}`}>
              <CardContent className="py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Key className={`h-4 w-4 flex-shrink-0 ${key.used ? 'text-destructive' : 'text-green-500'}`} />
                  <code className="text-sm truncate">{key.key_value}</code>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant="outline" className="text-xs">
                    {(key as any).use_count || 0}/{(key as any).max_uses || 1} utilisations
                  </Badge>
                  {key.used ? (
                    <Badge variant="destructive" className="text-xs">Épuisée</Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs bg-green-600/20 text-green-500">Disponible</Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => handleCopy(key.key_value, key.id)}
                  >
                    {copiedId === key.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Supprimer cette key ?")) {
                        deleteKeyMutation.mutate(key.id);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
