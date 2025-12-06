import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Download, Upload, Image, Video, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const MAX_FILE_SIZE = 150 * 1024 * 1024; // 150 MB pour fichier téléchargeable
// Pas de limite pour les médias (images/vidéos)

const offerSchema = z.object({
  title: z.string().min(3, "Le titre doit contenir au moins 3 caractères").max(100),
  description: z.string().min(10, "La description doit contenir au moins 10 caractères").max(5000),
  price: z.number().min(0, "Le prix doit être positif"),
  tags: z.string(),
});

interface MediaFile {
  file: File;
  type: 'image' | 'video';
  preview: string;
}

export const OffersManager = () => {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<any>(null);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const isAdmin = role === 'admin';

  // Admins voient toutes les offres, vendors voient seulement les leurs
  const { data: offers, isLoading } = useQuery({
    queryKey: ["managed-offers", user?.id, isAdmin],
    queryFn: async () => {
      let query = supabase
        .from("offers")
        .select("*, profiles:vendor_id(username)")
        .order("created_at", { ascending: false });
      
      // Les admins voient toutes les offres, les vendors seulement les leurs
      if (!isAdmin) {
        query = query.eq("vendor_id", user?.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast.error(`Le fichier dépasse la limite de 150 MB`);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newMediaFiles: MediaFile[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Pas de limite de taille pour les médias (images/vidéos)
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !isVideo) {
        toast.error(`${file.name} n'est pas un fichier média valide`);
        continue;
      }

      newMediaFiles.push({
        file,
        type: isImage ? 'image' : 'video',
        preview: URL.createObjectURL(file)
      });
    }

    setMediaFiles(prev => [...prev, ...newMediaFiles]);
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const uploadMediaFiles = async (): Promise<{ url: string; type: string }[]> => {
    const uploadedMedia: { url: string; type: string }[] = [];

    for (const media of mediaFiles) {
      const fileExt = media.file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('offer-media')
        .upload(fileName, media.file);

      if (uploadError) {
        console.error("Media upload error:", uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('offer-media')
        .getPublicUrl(fileName);

      uploadedMedia.push({
        url: publicUrl,
        type: media.type
      });
    }

    return uploadedMedia;
  };

  const createMutation = useMutation({
    mutationFn: async (offerData: any) => {
      let fileUrl = null;
      let fileSize = null;
      let fileFormat = null;
      let mediaUrls: { url: string; type: string }[] = [];

      setUploading(true);

      // Upload main file if provided
      if (file && user?.id) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('offer-files')
          .upload(fileName, file);

        if (uploadError) {
          setUploading(false);
          throw new Error(`Erreur d'upload: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('offer-files')
          .getPublicUrl(fileName);

        fileUrl = publicUrl;
        fileSize = file.size;
        fileFormat = fileExt;
      }

      // Upload media files
      if (mediaFiles.length > 0) {
        mediaUrls = await uploadMediaFiles();
      }

      setUploading(false);

      // Set first image as preview if available
      const firstImage = mediaUrls.find(m => m.type === 'image');
      const firstVideo = mediaUrls.find(m => m.type === 'video');

      const { error } = await supabase.from("offers").insert({
        ...offerData,
        vendor_id: user?.id,
        file_url: fileUrl,
        file_size: fileSize,
        file_format: fileFormat,
        media_urls: mediaUrls,
        image_preview_url: firstImage?.url || null,
        media_url: firstVideo?.url || null,
        media_type: firstVideo ? 'video' : (firstImage ? 'image' : null),
      });

      if (error) throw error;

      // Log creation
      await supabase.from("logs").insert({
        user_id: user?.id,
        action_type: "offer_created",
        message: `Offre créée: ${offerData.title}`,
        metadata: { title: offerData.title, hasFile: !!fileUrl, mediaCount: mediaUrls.length },
      });

      // Envoyer un email à tous les utilisateurs
      try {
        await supabase.functions.invoke('notify-new-offer', {
          body: {
            offerTitle: offerData.title,
            offerDescription: offerData.description
          }
        });
      } catch (emailError) {
        console.error("Erreur envoi emails:", emailError);
        // Ne pas bloquer la création si l'email échoue
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-offers"] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Offre créée avec succès ! Emails envoyés aux utilisateurs.");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erreur lors de la création");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...offerData }: any) => {
      let fileUrl = offerData.file_url;
      let fileSize = offerData.file_size;
      let fileFormat = offerData.file_format;
      let mediaUrls = offerData.media_urls || [];

      setUploading(true);

      // Upload new file if provided
      if (file && user?.id) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('offer-files')
          .upload(fileName, file);

        if (uploadError) {
          setUploading(false);
          throw new Error(`Erreur d'upload: ${uploadError.message}`);
        }

        const { data: { publicUrl } } = supabase.storage
          .from('offer-files')
          .getPublicUrl(fileName);

        fileUrl = publicUrl;
        fileSize = file.size;
        fileFormat = fileExt;
      }

      // Upload new media files
      if (mediaFiles.length > 0) {
        const newMedia = await uploadMediaFiles();
        mediaUrls = [...(mediaUrls || []), ...newMedia];
      }

      setUploading(false);

      // Set first image as preview if available
      const firstImage = mediaUrls.find((m: any) => m.type === 'image');
      const firstVideo = mediaUrls.find((m: any) => m.type === 'video');

      const { error } = await supabase
        .from("offers")
        .update({
          ...offerData,
          file_url: fileUrl,
          file_size: fileSize,
          file_format: fileFormat,
          media_urls: mediaUrls,
          image_preview_url: firstImage?.url || offerData.image_preview_url,
          media_url: firstVideo?.url || offerData.media_url,
          media_type: firstVideo ? 'video' : (firstImage ? 'image' : offerData.media_type),
        })
        .eq("id", id);

      if (error) throw error;

      // Log update
      await supabase.from("logs").insert({
        user_id: user?.id,
        action_type: "offer_updated",
        message: `Offre modifiée: ${offerData.title}`,
        metadata: { offerId: id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-offers"] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Offre modifiée avec succès !");
      resetForm();
      setIsDialogOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.message || "Erreur lors de la modification");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("offers").delete().eq("id", id);
      if (error) throw error;

      // Log deletion
      await supabase.from("logs").insert({
        user_id: user?.id,
        action_type: "offer_deleted",
        message: "Offre supprimée",
        metadata: { offerId: id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-offers"] });
      queryClient.invalidateQueries({ queryKey: ["offers"] });
      toast.success("Offre supprimée !");
    },
    onError: (error: any) => {
      toast.error(error.message || "Erreur lors de la suppression");
    },
  });

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPrice("0");
    setTags("");
    setFile(null);
    mediaFiles.forEach(m => URL.revokeObjectURL(m.preview));
    setMediaFiles([]);
    setEditingOffer(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validated = offerSchema.parse({
        title,
        description,
        price: parseFloat(price),
        tags,
      });

      const offerData = {
        title: validated.title,
        description: validated.description,
        price: validated.price,
        tags: validated.tags.split(",").map(t => t.trim()).filter(Boolean),
      };

      if (editingOffer) {
        updateMutation.mutate({ 
          id: editingOffer.id, 
          ...offerData,
          media_urls: editingOffer.media_urls || []
        });
      } else {
        createMutation.mutate(offerData);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      }
    }
  };

  const handleEdit = (offer: any) => {
    setEditingOffer(offer);
    setTitle(offer.title);
    setDescription(offer.description);
    setPrice(offer.price.toString());
    setTags(offer.tags?.join(", ") || "");
    setIsDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetForm();
    }
    setIsDialogOpen(open);
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-display font-bold">{isAdmin ? "Toutes les Offres" : "Mes Offres"}</h2>
        <Dialog open={isDialogOpen} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-button shadow-glow-cyan">
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle offre
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingOffer ? "Modifier l'offre" : "Créer une nouvelle offre"}</DialogTitle>
              <DialogDescription>
                Ajoutez les détails de votre offre
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Titre *</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Aimbot CS2 Premium"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description * (max 5000 caractères)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez votre offre en détail..."
                  rows={6}
                  maxLength={5000}
                  required
                />
                <p className="text-xs text-muted-foreground text-right">
                  {description.length}/5000 caractères
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="price">Prix (€) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tags">Tags (séparés par virgules)</Label>
                  <Input
                    id="tags"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    placeholder="cs2, aimbot, premium"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="file">Fichier téléchargeable (max 150 MB)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="file"
                    type="file"
                    onChange={handleFileChange}
                    accept=".zip,.rar,.7z,.exe,.dll,.txt,.html,.css,.php,.py,.c,.cpp,.js,.json,.xml"
                    className="cursor-pointer"
                  />
                  {file && (
                    <Badge variant="outline" className="whitespace-nowrap">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </Badge>
                  )}
                </div>
                {editingOffer?.file_url && !file && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Upload className="h-3 w-3" />
                    Fichier actuel: {editingOffer.file_format?.toUpperCase()} ({(editingOffer.file_size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Images et Vidéos (sans limite de taille)</Label>
                <div className="border-2 border-dashed border-border rounded-lg p-4">
                  <Input
                    type="file"
                    onChange={handleMediaChange}
                    accept="image/*,video/*"
                    multiple
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Formats acceptés: images (jpg, png, gif, webp) et vidéos (mp4, webm, mov)
                  </p>
                </div>

                {/* Preview des médias sélectionnés */}
                {mediaFiles.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {mediaFiles.map((media, index) => (
                      <div key={index} className="relative group">
                        {media.type === 'image' ? (
                          <img 
                            src={media.preview} 
                            alt={`Preview ${index}`}
                            className="w-full h-24 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center">
                            <Video className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeMedia(index)}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <Badge 
                          variant="secondary" 
                          className="absolute bottom-1 left-1 text-xs"
                        >
                          {media.type === 'image' ? <Image className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Médias existants lors de l'édition */}
                {editingOffer?.media_urls && editingOffer.media_urls.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground mb-2">Médias actuels:</p>
                    <div className="grid grid-cols-3 gap-2">
                      {editingOffer.media_urls.map((media: any, index: number) => (
                        <div key={index} className="relative">
                          {media.type === 'image' ? (
                            <img 
                              src={media.url} 
                              alt={`Media ${index}`}
                              className="w-full h-24 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-full h-24 bg-muted rounded-lg flex items-center justify-center">
                              <Video className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Annuler
                </Button>
                <Button 
                  type="submit" 
                  className="bg-gradient-button shadow-glow-cyan"
                  disabled={uploading}
                >
                  {uploading ? "Upload en cours..." : editingOffer ? "Modifier" : "Créer"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!offers || offers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucune offre. Créez votre première offre !
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {offers.map((offer: any) => {
            const canEdit = isAdmin || offer.vendor_id === user?.id;
            return (
              <Card key={offer.id} className="card-glow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl mb-2">{offer.title}</CardTitle>
                      <CardDescription className="line-clamp-2">
                        {offer.description}
                      </CardDescription>
                      {isAdmin && offer.profiles && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Par: {offer.profiles.username}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(offer)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            if (confirm("Supprimer cette offre ?")) {
                              deleteMutation.mutate(offer.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-4">
                    <Badge variant="default" className="bg-gradient-button">
                      {offer.price > 0 ? `${offer.price}€` : "GRATUIT"}
                    </Badge>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Download className="h-4 w-4" />
                      {offer.download_count} téléchargements
                    </div>
                    {offer.media_urls && offer.media_urls.length > 0 && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Image className="h-4 w-4" />
                        {offer.media_urls.length} média(s)
                      </div>
                    )}
                    {offer.tags && offer.tags.length > 0 && (
                      <div className="flex gap-2">
                        {offer.tags.map((tag: string) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};