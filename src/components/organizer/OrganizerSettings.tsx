import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Trash2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getOrganizerSettings,
  updateOrganizerSettings,
  type OrganizerSettings,
} from "@/lib/api/organizerSettings";

export default function OrganizerSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [settings, setSettings] = useState<OrganizerSettings | null>(null);
  
  // Form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [bio, setBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadSettings();
    }
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const response = await getOrganizerSettings();

      if (response.success && response.data) {
        setSettings(response.data);
        setFullName(response.data.full_name || "");
        setPhone(response.data.phone || "");
        setOrganizationName(response.data.organization_name || "");
        setContactEmail(response.data.contact_email || "");
        setContactPhone(response.data.contact_phone || "");
        setBio(response.data.bio || "");
        setWebsiteUrl(response.data.website_url || "");
        setLogoUrl(response.data.logo_url || null);
      } else {
        toast.error(response.error || "Erro ao carregar configurações");
      }
    } catch (error: any) {
      console.error("Error loading settings:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
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

    // Convert to base64 and save
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      
      try {
        const response = await updateOrganizerSettings({ logo_url: base64String });
        
        if (response.success && response.data) {
          setLogoUrl(base64String);
          setSettings(response.data);
          toast.success('Logo atualizada com sucesso!');
          
          // Trigger a refresh of the sidebar
          window.dispatchEvent(new Event('organizer-logo-updated'));
        } else {
          toast.error(response.error || 'Erro ao atualizar logo');
        }
      } catch (error: any) {
        console.error("Error updating logo:", error);
        toast.error('Erro ao fazer upload da logo');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error('Erro ao fazer upload da logo');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    try {
      const response = await updateOrganizerSettings({ logo_url: null });
      
      if (response.success && response.data) {
        setLogoUrl(null);
        setSettings(response.data);
        toast.success('Logo removida com sucesso!');
        
        // Trigger a refresh of the sidebar
        window.dispatchEvent(new Event('organizer-logo-updated'));
      } else {
        toast.error(response.error || 'Erro ao remover logo');
      }
    } catch (error: any) {
      console.error("Error removing logo:", error);
      toast.error('Erro ao remover logo');
    }
  };

  const handleSaveGeneral = async () => {
    if (!user) return;

    try {
      setSaving(true);
      const response = await updateOrganizerSettings({
        full_name: fullName,
        phone: phone,
        organization_name: organizationName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        bio: bio,
        website_url: websiteUrl,
      });

      if (response.success && response.data) {
        setSettings(response.data);
        toast.success('Configurações salvas com sucesso!');
      } else {
        toast.error(response.error || 'Erro ao salvar configurações');
      }
    } catch (error: any) {
      console.error("Error saving settings:", error);
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                    <Loader2 className="h-4 w-4 animate-spin" />
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
                <Label htmlFor="full-name">Nome Completo</Label>
                <Input 
                  id="full-name" 
                  placeholder="Seu nome completo"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-name">Nome da Organização</Label>
                <Input 
                  id="org-name" 
                  placeholder="Nome da sua organização"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input 
                  id="phone" 
                  type="tel" 
                  placeholder="(00) 00000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-email">E-mail de Contato</Label>
                <Input 
                  id="org-email" 
                  type="email" 
                  placeholder="contato@organizacao.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-phone">Telefone de Contato</Label>
                <Input 
                  id="org-phone" 
                  type="tel" 
                  placeholder="(00) 00000-0000"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Site</Label>
                <Input 
                  id="website" 
                  type="url" 
                  placeholder="https://www.exemplo.com"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bio">Biografia</Label>
                <Textarea 
                  id="bio" 
                  placeholder="Descreva sua organização..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                />
              </div>
              <Button onClick={handleSaveGeneral} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Salvar Alterações
                  </>
                )}
              </Button>
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
