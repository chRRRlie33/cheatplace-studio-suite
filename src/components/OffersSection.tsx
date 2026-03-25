import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Download, Eye, Package, Play, Image as ImageIcon, ChevronLeft, ChevronRight, Key } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface MediaItem {
  url: string;
  type: 'image' | 'video';
}

export const OffersSection = () => {
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [keyDialogOffer, setKeyDialogOffer] = useState<any>(null);
  const [keyInput, setKeyInput] = useState("");
  const [validatingKey, setValidatingKey] = useState(false);
  const queryClient = useQueryClient();

  const checkOfferKeys = async (offerId: string): Promise<{ total: number; available: number }> => {
    const { data, error } = await supabase.rpc("check_offer_key_availability", {
      _offer_id: offerId,
    });

    if (error || !data || data.length === 0) {
      return { total: 0, available: 0 };
    }

    return { total: Number(data[0].total), available: Number(data[0].available) };
  };

  const handleDownloadClick = async (offer: any) => {
    if (!offer.file_url) {
      toast.error("Aucun fichier disponible pour cette offre");
      return;
    }

    const { total, available } = await checkOfferKeys(offer.id);

    // If keys exist for this offer, require one
    if (total > 0) {
      if (available === 0) {
        toast.error("Aucune key disponible pour cette offre. Téléchargement impossible.");
        return;
      }
      setKeyDialogOffer(offer);
      setKeyInput("");
      return;
    }

    // No keys associated at all = block download
    toast.error("Aucune key associée à cette offre. Téléchargement impossible.");
  };

  const handleKeySubmit = async () => {
    if (!keyDialogOffer || !keyInput.trim()) return;

    setValidatingKey(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: result, error } = await supabase.rpc("redeem_offer_key", {
        _offer_id: keyDialogOffer.id,
        _key_value: keyInput.trim(),
        _user_id: user?.id ?? null,
      });

      if (error || !result) {
        toast.error("Key invalide ou déjà utilisée");
        return;
      }

      toast.success("Key validée !");
      setKeyDialogOffer(null);
      setKeyInput("");
      await performDownload(keyDialogOffer);
    } catch {
      toast.error("Erreur lors de la validation de la key");
    } finally {
      setValidatingKey(false);
    }
  };

  const performDownload = async (offer: any) => {
    if (!offer.file_url) return;

    try {
      setDownloadingId(offer.id);

      const { error: updateError } = await supabase
        .rpc('increment_offer_download', { _offer_id: offer.id });

      if (updateError) {
        console.error("Error updating download count:", updateError);
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", user.id)
          .single();

        await supabase
          .from("user_downloads")
          .insert({
            user_id: user.id,
            offer_id: offer.id
          });

        const now = new Date();
        await supabase.from("logs").insert({
          user_id: user.id,
          action_type: "download",
          message: `Téléchargement de "${offer.title}" par ${profileData?.username || 'Utilisateur'}`,
          metadata: {
            offer_id: offer.id,
            offer_title: offer.title,
            username: profileData?.username,
            date: now.toLocaleDateString('fr-FR'),
            time: now.toLocaleTimeString('fr-FR')
          }
        });
      } else {
        // Guest download log
        const now = new Date();
        await supabase.from("logs").insert({
          action_type: "download",
          message: `Téléchargement de "${offer.title}" par un invité`,
          metadata: {
            offer_id: offer.id,
            offer_title: offer.title,
            username: "Invité",
            date: now.toLocaleDateString('fr-FR'),
            time: now.toLocaleTimeString('fr-FR')
          }
        });
      }

      const hasQuery = offer.file_url.includes("?");
      const fileExtension = offer.file_format ? `.${offer.file_format}` : "";
      const downloadFileName = `${offer.title}${fileExtension}`;
      const downloadUrl = `${offer.file_url}${hasQuery ? "&" : "?"}download=${encodeURIComponent(downloadFileName)}`;

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = downloadFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const discordLink = document.createElement("a");
      discordLink.href = "https://discord.gg/brmNnnDS";
      discordLink.target = "_blank";
      discordLink.rel = "noopener noreferrer";
      document.body.appendChild(discordLink);
      discordLink.click();
      document.body.removeChild(discordLink);

      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Téléchargement démarré");
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Erreur lors du téléchargement");
    } finally {
      setDownloadingId(null);
    }
  };

  const { data: offers, isLoading } = useQuery({
    queryKey: ["offers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offers")
        .select(`
          id, title, description, price, tags, download_count, created_at, updated_at,
          vendor_id, file_url, file_format, file_size, image_preview_url, media_type, media_url, media_urls,
          profiles:vendor_id (username, role)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "N/A";
    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Byte";
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + " " + sizes[i];
  };

  const getMediaItems = (offer: any): MediaItem[] => {
    const items: MediaItem[] = [];
    
    // Ajouter les médias du champ media_urls
    if (offer.media_urls && Array.isArray(offer.media_urls)) {
      items.push(...offer.media_urls);
    }
    
    // Ajouter l'image preview si elle n'est pas déjà incluse
    if (offer.image_preview_url && !items.some(m => m.url === offer.image_preview_url)) {
      items.unshift({ url: offer.image_preview_url, type: 'image' });
    }
    
    // Ajouter la vidéo si elle n'est pas déjà incluse
    if (offer.media_type === 'video' && offer.media_url && !items.some(m => m.url === offer.media_url)) {
      items.push({ url: offer.media_url, type: 'video' });
    }

    return items;
  };

  const handleOpenOffer = (offer: any) => {
    setSelectedOffer(offer);
    setCurrentMediaIndex(0);
  };

  const handlePrevMedia = () => {
    if (!selectedOffer) return;
    const items = getMediaItems(selectedOffer);
    setCurrentMediaIndex(prev => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const handleNextMedia = () => {
    if (!selectedOffer) return;
    const items = getMediaItems(selectedOffer);
    setCurrentMediaIndex(prev => (prev === items.length - 1 ? 0 : prev + 1));
  };

  if (isLoading) {
    return (
      <section id="offers" className="py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-display font-bold text-glow-cyan mb-4">
              NOS OFFRES
            </h2>
            <p className="text-muted-foreground">Chargement des offres...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="offers" className="py-20 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12 animate-slide-up">
          <h2 className="text-4xl font-display font-bold text-glow-cyan mb-4">
            NOS OFFRES
          </h2>
          <p className="text-muted-foreground text-lg">
            Découvrez nos cheats et outils premium
          </p>
        </div>

        {!offers || offers.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground text-lg">
              Aucune offre disponible pour le moment
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {offers.map((offer, index) => (
              <Card 
                key={offer.id} 
                className="card-glow hover:scale-105 transition-all duration-300 animate-slide-up"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {offer.image_preview_url && (
                  <div className="h-48 overflow-hidden rounded-t-lg">
                    <img
                      src={offer.image_preview_url}
                      alt={offer.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-xl">{offer.title}</CardTitle>
                    {offer.price > 0 ? (
                      <Badge variant="default" className="bg-gradient-button">
                        {offer.price}€
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-accent">
                        GRATUIT
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="text-sm">
                    Par {offer.profiles?.username || "Vendor"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {offer.description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {offer.tags?.map((tag: string) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Download className="h-3 w-3" />
                      {offer.download_count} téléchargements
                    </div>
                    {offer.file_size && (
                      <div className="flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        {formatFileSize(offer.file_size)}
                      </div>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button 
                    className="flex-1 bg-gradient-button shadow-glow-cyan" 
                    size="sm"
                    onClick={() => handleOpenOffer(offer)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Voir détails
                  </Button>
                  {offer.file_url && (
                    <Button 
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownloadClick(offer)}
                      disabled={downloadingId === offer.id}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      {downloadingId === offer.id ? "..." : "Télécharger"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog pour voir les détails avec médias */}
      <Dialog open={!!selectedOffer} onOpenChange={() => setSelectedOffer(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">{selectedOffer?.title}</DialogTitle>
            <DialogDescription>
              Par {selectedOffer?.profiles?.username || "Vendor"}
            </DialogDescription>
          </DialogHeader>
          
          {/* Galerie de médias */}
          {selectedOffer && (() => {
            const mediaItems = getMediaItems(selectedOffer);
            
            if (mediaItems.length === 0) return null;

            const currentMedia = mediaItems[currentMediaIndex];

            return (
              <div className="space-y-4">
                {/* Média principal */}
                <div className="relative rounded-lg overflow-hidden bg-muted min-h-[300px] flex items-center justify-center">
                  {currentMedia?.type === 'video' ? (
                    <video 
                      key={currentMedia.url}
                      controls 
                      className="w-full max-h-[500px] object-contain"
                      autoPlay={false}
                    >
                      <source src={currentMedia.url} type="video/mp4" />
                      Votre navigateur ne supporte pas la lecture de vidéos.
                    </video>
                  ) : currentMedia?.type === 'image' ? (
                    <img 
                      src={currentMedia.url} 
                      alt={selectedOffer?.title}
                      className="w-full max-h-[500px] object-contain"
                    />
                  ) : null}

                  {/* Navigation arrows */}
                  {mediaItems.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute left-2 top-1/2 -translate-y-1/2 opacity-80 hover:opacity-100"
                        onClick={handlePrevMedia}
                      >
                        <ChevronLeft className="h-6 w-6" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-80 hover:opacity-100"
                        onClick={handleNextMedia}
                      >
                        <ChevronRight className="h-6 w-6" />
                      </Button>
                    </>
                  )}
                </div>

                {/* Thumbnails */}
                {mediaItems.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {mediaItems.map((media, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentMediaIndex(index)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                          index === currentMediaIndex 
                            ? 'border-primary' 
                            : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        {media.type === 'video' ? (
                          <div className="w-full h-full bg-muted flex items-center justify-center">
                            <Play className="h-6 w-6 text-muted-foreground" />
                          </div>
                        ) : (
                          <img 
                            src={media.url} 
                            alt={`Thumbnail ${index}`}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              {selectedOffer?.price > 0 ? (
                <Badge variant="default" className="bg-gradient-button text-lg px-3 py-1">
                  {selectedOffer?.price}€
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-accent text-lg px-3 py-1">
                  GRATUIT
                </Badge>
              )}
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Download className="h-4 w-4" />
                {selectedOffer?.download_count} téléchargements
              </div>
            </div>

            <p className="text-muted-foreground whitespace-pre-wrap">{selectedOffer?.description}</p>

            {selectedOffer?.tags && selectedOffer.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedOffer.tags.map((tag: string) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}

            {selectedOffer?.file_size && (
              <p className="text-sm text-muted-foreground">
                Taille du fichier: {formatFileSize(selectedOffer.file_size)}
              </p>
            )}

            {selectedOffer?.file_url && (
              <Button 
                className="w-full bg-gradient-button shadow-glow-cyan"
                onClick={() => {
                  handleDownloadClick(selectedOffer);
                  setSelectedOffer(null);
                }}
                disabled={downloadingId === selectedOffer?.id}
              >
                <Download className="h-4 w-4 mr-2" />
                {downloadingId === selectedOffer?.id ? "Téléchargement..." : "Télécharger"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog pour entrer une key */}
      <Dialog open={!!keyDialogOffer} onOpenChange={() => { setKeyDialogOffer(null); setKeyInput(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Entrez votre key
            </DialogTitle>
            <DialogDescription>
              Une key est requise pour télécharger "{keyDialogOffer?.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="download-key">Key de téléchargement</Label>
              <Input
                id="download-key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder="KEY-XXXX-XXXX-XXXX"
                onKeyDown={(e) => e.key === "Enter" && handleKeySubmit()}
              />
            </div>
            <Button
              onClick={handleKeySubmit}
              className="w-full bg-gradient-button shadow-glow-cyan"
              disabled={validatingKey || !keyInput.trim()}
            >
              {validatingKey ? "Vérification..." : "Valider et télécharger"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};