import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getSystemSettings, updateSystemSettings, type SystemSettings as SystemSettingsType } from "@/lib/api/systemSettings";

const SystemSettings = () => {
  const [settings, setSettings] = useState<SystemSettingsType | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Form states
  const [generalForm, setGeneralForm] = useState({
    platform_name: "",
    contact_email: "",
    contact_phone: "",
    company_address: "",
    company_city: "",
    company_state: "",
    company_zip: "",
    company_country: "",
  });
  
  const [emailForm, setEmailForm] = useState({
    smtp_host: "",
    smtp_port: "",
    smtp_user: "",
    smtp_password: "",
    smtp_from_email: "",
    smtp_from_name: "",
    smtp_secure: true,
  });
  
  const [paymentForm, setPaymentForm] = useState({
    payment_gateway: "stripe",
    payment_test_mode: true,
    payment_public_key: "",
    payment_secret_key: "",
  });
  
  const [modulesForm, setModulesForm] = useState<Record<string, boolean>>({
    coupons: false,
    refunds: false,
    support: false,
    notifications: false,
    analytics: false,
    transfers: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const response = await getSystemSettings();
      if (response.success && response.data) {
        const data = response.data;
        setSettings(data);
        
        // Set logo URL
        if (data.platform_logo_url) {
          setLogoUrl(data.platform_logo_url);
          localStorage.setItem('admin-logo', data.platform_logo_url);
        } else {
          const savedLogo = localStorage.getItem('admin-logo');
          if (savedLogo) {
            setLogoUrl(savedLogo);
          }
        }
        
        // Populate forms
        setGeneralForm({
          platform_name: data.platform_name || "",
          contact_email: data.contact_email || "",
          contact_phone: data.contact_phone || "",
          company_address: data.company_address || "",
          company_city: data.company_city || "",
          company_state: data.company_state || "",
          company_zip: data.company_zip || "",
          company_country: data.company_country || "Brasil",
        });
        
        setEmailForm({
          smtp_host: data.smtp_host || "",
          smtp_port: data.smtp_port?.toString() || "",
          smtp_user: data.smtp_user || "",
          smtp_password: data.smtp_password || "",
          smtp_from_email: data.smtp_from_email || "",
          smtp_from_name: data.smtp_from_name || "",
          smtp_secure: data.smtp_secure ?? true,
        });
        
        setPaymentForm({
          payment_gateway: data.payment_gateway || "stripe",
          payment_test_mode: data.payment_test_mode ?? true,
          payment_public_key: data.payment_public_key || "",
          payment_secret_key: data.payment_secret_key || "",
        });
        
        setModulesForm(data.enabled_modules || {
          coupons: false,
          refunds: false,
          support: false,
          notifications: false,
          analytics: false,
          transfers: false,
        });
      }
    } catch (error) {
      console.error("Erro ao carregar configurações:", error);
      toast.error("Erro ao carregar configurações");
    } finally {
      setLoading(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      
      try {
        // Save to backend
        const response = await updateSystemSettings({
          platform_logo_url: base64String,
        });
        
        if (response.success) {
          localStorage.setItem('admin-logo', base64String);
          setLogoUrl(base64String);
          if (response.data) {
            setSettings(response.data);
          }
          toast.success('Logo atualizada com sucesso!');
          window.dispatchEvent(new Event('admin-logo-updated'));
        } else {
          toast.error(response.error || 'Erro ao atualizar logo');
        }
      } catch (error) {
        toast.error('Erro ao fazer upload da logo');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      toast.error('Erro ao processar imagem');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    try {
      const response = await updateSystemSettings({
        platform_logo_url: null,
      });
      
      if (response.success) {
        localStorage.removeItem('admin-logo');
        setLogoUrl(null);
        if (response.data) {
          setSettings(response.data);
        }
        toast.success('Logo removida com sucesso!');
        window.dispatchEvent(new Event('admin-logo-updated'));
      } else {
        toast.error(response.error || 'Erro ao remover logo');
      }
    } catch (error) {
      toast.error('Erro ao remover logo');
    }
  };
  
  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      const response = await updateSystemSettings({
        platform_name: generalForm.platform_name,
        contact_email: generalForm.contact_email || null,
        contact_phone: generalForm.contact_phone || null,
        company_address: generalForm.company_address || null,
        company_city: generalForm.company_city || null,
        company_state: generalForm.company_state || null,
        company_zip: generalForm.company_zip || null,
        company_country: generalForm.company_country,
      });
      
      if (response.success) {
        if (response.data) {
          setSettings(response.data);
        }
        toast.success('Configurações gerais salvas com sucesso!');
      } else {
        toast.error(response.error || 'Erro ao salvar configurações');
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveEmail = async () => {
    setSaving(true);
    try {
      const response = await updateSystemSettings({
        smtp_host: emailForm.smtp_host || null,
        smtp_port: emailForm.smtp_port ? parseInt(emailForm.smtp_port) : null,
        smtp_user: emailForm.smtp_user || null,
        smtp_password: emailForm.smtp_password || null,
        smtp_from_email: emailForm.smtp_from_email || null,
        smtp_from_name: emailForm.smtp_from_name || null,
        smtp_secure: emailForm.smtp_secure,
      });
      
      if (response.success) {
        if (response.data) {
          setSettings(response.data);
        }
        toast.success('Configurações de e-mail salvas com sucesso!');
      } else {
        toast.error(response.error || 'Erro ao salvar configurações');
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };
  
  const handleSavePayment = async () => {
    setSaving(true);
    try {
      const response = await updateSystemSettings({
        payment_gateway: paymentForm.payment_gateway,
        payment_test_mode: paymentForm.payment_test_mode,
        payment_public_key: paymentForm.payment_public_key || null,
        payment_secret_key: paymentForm.payment_secret_key || null,
      });
      
      if (response.success) {
        if (response.data) {
          setSettings(response.data);
        }
        toast.success('Configurações de pagamento salvas com sucesso!');
      } else {
        toast.error(response.error || 'Erro ao salvar configurações');
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  };
  
  const handleSaveModules = async () => {
    setSaving(true);
    try {
      const response = await updateSystemSettings({
        enabled_modules: modulesForm,
      });
      
      if (response.success) {
        if (response.data) {
          setSettings(response.data);
        }
        toast.success('Configurações de módulos salvas com sucesso!');
        // Dispatch event to update sidebar
        window.dispatchEvent(new CustomEvent('admin-settings-updated'));
      } else {
        toast.error(response.error || 'Erro ao salvar configurações');
      }
    } catch (error) {
      toast.error('Erro ao salvar configurações');
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
                <Label htmlFor="platform_name">Nome da Plataforma</Label>
                <Input 
                  id="platform_name"
                  value={generalForm.platform_name}
                  onChange={(e) => setGeneralForm({ ...generalForm, platform_name: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="contact_email">E-mail de Contato</Label>
                <Input 
                  id="contact_email"
                  type="email" 
                  value={generalForm.contact_email}
                  onChange={(e) => setGeneralForm({ ...generalForm, contact_email: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="contact_phone">Telefone</Label>
                <Input 
                  id="contact_phone"
                  value={generalForm.contact_phone}
                  onChange={(e) => setGeneralForm({ ...generalForm, contact_phone: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="company_address">Endereço</Label>
                <Input 
                  id="company_address"
                  value={generalForm.company_address}
                  onChange={(e) => setGeneralForm({ ...generalForm, company_address: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company_city">Cidade</Label>
                  <Input 
                    id="company_city"
                    value={generalForm.company_city}
                    onChange={(e) => setGeneralForm({ ...generalForm, company_city: e.target.value })}
                    className="mt-2" 
                  />
                </div>
                <div>
                  <Label htmlFor="company_state">Estado</Label>
                  <Input 
                    id="company_state"
                    value={generalForm.company_state}
                    onChange={(e) => setGeneralForm({ ...generalForm, company_state: e.target.value })}
                    className="mt-2" 
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="company_zip">CEP</Label>
                <Input 
                  id="company_zip"
                  value={generalForm.company_zip}
                  onChange={(e) => setGeneralForm({ ...generalForm, company_zip: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="company_country">País</Label>
                <Input 
                  id="company_country"
                  value={generalForm.company_country}
                  onChange={(e) => setGeneralForm({ ...generalForm, company_country: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <Button onClick={handleSaveGeneral} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Alterações
              </Button>
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
                <Label htmlFor="smtp_host">Servidor SMTP</Label>
                <Input 
                  id="smtp_host"
                  value={emailForm.smtp_host}
                  onChange={(e) => setEmailForm({ ...emailForm, smtp_host: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="smtp_port">Porta</Label>
                <Input 
                  id="smtp_port"
                  type="number"
                  value={emailForm.smtp_port}
                  onChange={(e) => setEmailForm({ ...emailForm, smtp_port: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="smtp_user">Usuário</Label>
                <Input 
                  id="smtp_user"
                  value={emailForm.smtp_user}
                  onChange={(e) => setEmailForm({ ...emailForm, smtp_user: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="smtp_password">Senha</Label>
                <Input 
                  id="smtp_password"
                  type="password" 
                  value={emailForm.smtp_password}
                  onChange={(e) => setEmailForm({ ...emailForm, smtp_password: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="smtp_from_email">E-mail Remetente</Label>
                <Input 
                  id="smtp_from_email"
                  type="email"
                  value={emailForm.smtp_from_email}
                  onChange={(e) => setEmailForm({ ...emailForm, smtp_from_email: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="smtp_from_name">Nome Remetente</Label>
                <Input 
                  id="smtp_from_name"
                  value={emailForm.smtp_from_name}
                  onChange={(e) => setEmailForm({ ...emailForm, smtp_from_name: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="smtp_secure">Conexão Segura (TLS/SSL)</Label>
                  <p className="text-sm text-muted-foreground">Habilitar conexão segura</p>
                </div>
                <Switch 
                  id="smtp_secure"
                  checked={emailForm.smtp_secure}
                  onCheckedChange={(checked) => setEmailForm({ ...emailForm, smtp_secure: checked })}
                />
              </div>
              <Button onClick={handleSaveEmail} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Configurações
              </Button>
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
                <Label htmlFor="payment_gateway">Gateway Ativo</Label>
                <Select 
                  value={paymentForm.payment_gateway}
                  onValueChange={(value) => setPaymentForm({ ...paymentForm, payment_gateway: value })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stripe">Stripe</SelectItem>
                    <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                    <SelectItem value="pagseguro">PagSeguro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="payment_test_mode">Modo de Teste</Label>
                  <p className="text-sm text-muted-foreground">Usar credenciais de teste</p>
                </div>
                <Switch 
                  id="payment_test_mode"
                  checked={paymentForm.payment_test_mode}
                  onCheckedChange={(checked) => setPaymentForm({ ...paymentForm, payment_test_mode: checked })}
                />
              </div>
              <div>
                <Label htmlFor="payment_public_key">API Key Pública</Label>
                <Input 
                  id="payment_public_key"
                  value={paymentForm.payment_public_key}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_public_key: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <div>
                <Label htmlFor="payment_secret_key">API Key Privada</Label>
                <Input 
                  id="payment_secret_key"
                  type="password" 
                  value={paymentForm.payment_secret_key}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_secret_key: e.target.value })}
                  className="mt-2" 
                />
              </div>
              <Button onClick={handleSavePayment} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Configurações
              </Button>
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
                <Switch 
                  checked={modulesForm.coupons || false}
                  onCheckedChange={(checked) => setModulesForm({ ...modulesForm, coupons: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Reembolsos</p>
                  <p className="text-sm text-muted-foreground">Processar cancelamentos e devoluções</p>
                </div>
                <Switch 
                  checked={modulesForm.refunds || false}
                  onCheckedChange={(checked) => setModulesForm({ ...modulesForm, refunds: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Sistema de Suporte</p>
                  <p className="text-sm text-muted-foreground">Chamados e atendimento ao cliente</p>
                </div>
                <Switch 
                  checked={modulesForm.support || false}
                  onCheckedChange={(checked) => setModulesForm({ ...modulesForm, support: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Notificações Push</p>
                  <p className="text-sm text-muted-foreground">Alertas em tempo real</p>
                </div>
                <Switch 
                  checked={modulesForm.notifications || false}
                  onCheckedChange={(checked) => setModulesForm({ ...modulesForm, notifications: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Análise de Dados</p>
                  <p className="text-sm text-muted-foreground">Dashboard e relatórios avançados</p>
                </div>
                <Switch 
                  checked={modulesForm.analytics || false}
                  onCheckedChange={(checked) => setModulesForm({ ...modulesForm, analytics: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Transferência de Inscrições</p>
                  <p className="text-sm text-muted-foreground">Permitir transferência de inscrições entre corredores</p>
                </div>
                <Switch 
                  checked={modulesForm.transfers || false}
                  onCheckedChange={(checked) => setModulesForm({ ...modulesForm, transfers: checked })}
                />
              </div>
              <Button onClick={handleSaveModules} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar Alterações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SystemSettings;

