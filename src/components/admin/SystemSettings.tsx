import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SystemSettings = () => {
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

        <TabsContent value="general">
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
