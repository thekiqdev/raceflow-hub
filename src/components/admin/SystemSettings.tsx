import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Building2, Trash2 } from "lucide-react";
import { toast } from "sonner";

const SystemSettings = () => {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = () => {
    const savedLogo = localStorage.getItem('admin-logo');
    if (savedLogo) {
      setLogoUrl(savedLogo);
    }
    setLoading(false);
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

    // Convert to base64 and save to localStorage
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      localStorage.setItem('admin-logo', base64String);
      setLogoUrl(base64String);
      toast.success('Logo atualizada com sucesso!');
      
      // Trigger a refresh of the sidebar
      window.dispatchEvent(new Event('admin-logo-updated'));
      setUploading(false);
    };
    reader.onerror = () => {
      toast.error('Erro ao fazer upload da logo');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    localStorage.removeItem('admin-logo');
    setLogoUrl(null);
    toast.success('Logo removida com sucesso!');
    
    // Trigger a refresh of the sidebar
    window.dispatchEvent(new Event('admin-logo-updated'));
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
        <h2 className="text-3xl font-bold mb-2">Configurações do Sistema</h2>
        <p className="text-muted-foreground">Gerenciar configurações globais da plataforma</p>
      </div>

      <Tabs defaultValue="general" className="space-y-4">
        <TabsList>
          <TabsTrigger value="general">Geral</TabsTrigger>
          <TabsTrigger value="email">E-mail</TabsTrigger>
          <TabsTrigger value="payment">Pagamento</TabsTrigger>
          <TabsTrigger value="modules">Módulos</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Logo da Plataforma
              </CardTitle>
              <CardDescription>
                Faça upload da logo da plataforma. Esta logo será exibida no menu lateral.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Preview */}
              <div className="flex items-center justify-center w-full">
                <div className="relative w-48 h-48 border-2 border-dashed border-muted rounded-lg flex items-center justify-center bg-muted/20">
                  {logoUrl ? (
                    <img 
                      src={logoUrl} 
                      alt="Logo da plataforma" 
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
              <CardTitle>Dados Institucionais</CardTitle>
              <CardDescription>Informações gerais da plataforma</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Nome da Plataforma</label>
                <Input defaultValue="RunEvents" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">E-mail de Contato</label>
                <Input type="email" defaultValue="contato@runevents.com" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Telefone</label>
                <Input defaultValue="(11) 98765-4321" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Endereço</label>
                <Input defaultValue="Av. Paulista, 1000 - São Paulo, SP" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Redes Sociais</label>
                <div className="grid gap-2 mt-2">
                  <Input placeholder="Instagram" defaultValue="@runevents" />
                  <Input placeholder="Facebook" defaultValue="facebook.com/runevents" />
                  <Input placeholder="Twitter" defaultValue="@runevents" />
                </div>
              </div>
              <Button>Salvar Alterações</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Configurações de E-mail</CardTitle>
              <CardDescription>Configurar servidor SMTP e notificações</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Servidor SMTP</label>
                <Input defaultValue="smtp.gmail.com" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Porta</label>
                <Input defaultValue="587" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Usuário</label>
                <Input defaultValue="noreply@runevents.com" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Senha</label>
                <Input type="password" defaultValue="********" className="mt-2" />
              </div>
              <div className="space-y-2">
                <h4 className="font-medium">Notificações Automáticas</h4>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Confirmação de Inscrição</span>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Lembrete de Evento</span>
                  <Switch defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Confirmação de Pagamento</span>
                  <Switch defaultChecked />
                </div>
              </div>
              <Button>Salvar Configurações</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payment">
          <Card>
            <CardHeader>
              <CardTitle>Gateway de Pagamento</CardTitle>
              <CardDescription>Configurar integração com processadores de pagamento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Gateway Ativo</label>
                <select className="mt-2 w-full h-10 rounded-md border border-input bg-background px-3 py-2">
                  <option>Mercado Pago</option>
                  <option>PagSeguro</option>
                  <option>Stripe</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">API Key Pública</label>
                <Input defaultValue="pk_test_***" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">API Key Privada</label>
                <Input type="password" defaultValue="sk_test_***" className="mt-2" />
              </div>
              <div>
                <label className="text-sm font-medium">Comissão da Plataforma (%)</label>
                <Input type="number" defaultValue="5" className="mt-2" />
              </div>
              <Button>Salvar Configurações</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="modules">
          <Card>
            <CardHeader>
              <CardTitle>Módulos do Sistema</CardTitle>
              <CardDescription>Ativar ou desativar funcionalidades</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sistema de Cupons</p>
                  <p className="text-sm text-muted-foreground">Permitir desconto nas inscrições</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reembolsos</p>
                  <p className="text-sm text-muted-foreground">Processar cancelamentos e devoluções</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sistema de Suporte</p>
                  <p className="text-sm text-muted-foreground">Chamados e atendimento ao cliente</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações Push</p>
                  <p className="text-sm text-muted-foreground">Alertas em tempo real</p>
                </div>
                <Switch />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Análise de Dados</p>
                  <p className="text-sm text-muted-foreground">Dashboard e relatórios avançados</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Button>Salvar Alterações</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemSettings;
