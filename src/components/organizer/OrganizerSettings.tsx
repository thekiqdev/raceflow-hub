import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export default function OrganizerSettings() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('organizer_settings')
        .select('logo_url')
        .eq('organizer_id', user.id)
        .single();

      if (data?.logo_url) {
        setLogoUrl(data.logo_url);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione uma imagem válida');
        return;
      }

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 2MB');
        return;
      }

      setUploading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Upload to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('organizer-logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('organizer-logos')
        .getPublicUrl(filePath);

      // Save to database
      const { error: dbError } = await supabase
        .from('organizer_settings')
        .upsert({
          organizer_id: user.id,
          logo_url: publicUrl,
          updated_at: new Date().toISOString(),
        });

      if (dbError) throw dbError;

      setLogoUrl(publicUrl);
      toast.success('Logo atualizada com sucesso!');
      
      // Trigger a refresh of the sidebar
      window.dispatchEvent(new Event('organizer-logo-updated'));
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error('Erro ao fazer upload da logo');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Remove from database
      const { error } = await supabase
        .from('organizer_settings')
        .update({ logo_url: null })
        .eq('organizer_id', user.id);

      if (error) throw error;

      setLogoUrl(null);
      toast.success('Logo removida com sucesso!');
      
      // Trigger a refresh of the sidebar
      window.dispatchEvent(new Event('organizer-logo-updated'));
    } catch (error) {
      console.error('Error removing logo:', error);
      toast.error('Erro ao remover logo');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-muted-foreground">
          Gerencie as configurações da sua conta e organização
        </p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="notifications">Notificações</TabsTrigger>
          <TabsTrigger value="security">Segurança</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Logo da Organização
              </CardTitle>
              <CardDescription>
                Faça upload da logo da sua organização. Esta logo será exibida no menu lateral.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Preview */}
              <div className="flex items-center justify-center w-full">
                <div className="relative w-48 h-48 border-2 border-dashed border-muted rounded-lg flex items-center justify-center bg-muted/20">
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt="Logo da organização" 
                      className="max-w-full max-h-full object-contain p-4"
                    />
                  ) : (
                    <div className="text-center p-4">
                      <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">Nenhuma logo</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Controls */}
              <div className="space-y-3">
                <div>
                  <Label htmlFor="logo-upload">Upload de Logo</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="logo-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploading}
                      className="flex-1"
                    />
                    {logoUrl && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleRemoveLogo}
                        disabled={uploading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Formatos aceitos: PNG, JPG, SVG. Tamanho máximo: 2MB
                  </p>
                </div>

                {uploading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span>Enviando logo...</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Informações da Organização</CardTitle>
              <CardDescription>
                Dados básicos da sua organização
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Nome da Organização</Label>
                <Input id="org-name" placeholder="Nome da sua organização" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-email">E-mail de Contato</Label>
                <Input id="org-email" type="email" placeholder="contato@organizacao.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-phone">Telefone</Label>
                <Input id="org-phone" type="tel" placeholder="(00) 00000-0000" />
              </div>
              <Button>Salvar Alterações</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notificações</CardTitle>
              <CardDescription>
                Configure como você deseja receber notificações
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configurações de notificações em desenvolvimento
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Segurança</CardTitle>
              <CardDescription>
                Gerencie as configurações de segurança da sua conta
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Configurações de segurança em desenvolvimento
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
