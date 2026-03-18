import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Search, Plus, Edit, Trash2, Loader2, Mail, MessageSquare, Bell, Smartphone, Shield } from "lucide-react";
import { toast } from "sonner";
import {
  getNotificationTemplates,
  getNotificationTemplateById,
  createNotificationTemplate,
  updateNotificationTemplate,
  deleteNotificationTemplate,
  initializeDefaultTemplates,
  type NotificationTemplate,
  type CreateNotificationTemplateData,
  type UpdateNotificationTemplateData,
} from "@/lib/api/notificationTemplates";

const NotificationTemplatesManagement = () => {
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [audienceFilter, setAudienceFilter] = useState<string>("all");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CreateNotificationTemplateData | UpdateNotificationTemplateData>({
    template_key: "",
    template_name: "",
    template_type: "email",
    target_audience: "runner",
    subject: "",
    body_html: "",
    body_text: "",
    variables: {},
    is_active: true,
  });

  useEffect(() => {
    loadTemplates();
  }, [typeFilter, audienceFilter, activeFilter]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (typeFilter !== "all") {
        filters.template_type = typeFilter;
      }
      if (audienceFilter !== "all") {
        filters.target_audience = audienceFilter;
      }
      if (activeFilter !== "all") {
        filters.is_active = activeFilter === "active";
      }

      const response = await getNotificationTemplates(filters);
      if (response.success && response.data) {
        let filtered = response.data;
        
        // Apply search filter
        if (searchTerm) {
          filtered = filtered.filter(
            (t) =>
              t.template_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              t.template_key.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (t.subject && t.subject.toLowerCase().includes(searchTerm.toLowerCase()))
          );
        }
        
        setTemplates(filtered);
      } else {
        setTemplates([]);
      }
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast.error("Erro ao carregar templates de notificação");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, [searchTerm]);

  const handleCreate = () => {
    setIsCreating(true);
    setIsEditing(false);
    setSelectedTemplate(null);
    setFormData({
      template_key: "",
      template_name: "",
      template_type: "email",
      target_audience: "runner",
      subject: "",
      body_html: "",
      body_text: "",
      variables: {},
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleEdit = async (id: string) => {
    try {
      const response = await getNotificationTemplateById(id);
      if (response.success && response.data) {
        setSelectedTemplate(response.data);
        setIsEditing(true);
        setIsCreating(false);
        setFormData({
          template_name: response.data.template_name,
          template_type: response.data.template_type,
          target_audience: response.data.target_audience,
          subject: response.data.subject || "",
          body_html: response.data.body_html || "",
          body_text: response.data.body_text || "",
          variables: response.data.variables || {},
          is_active: response.data.is_active,
        });
        setDialogOpen(true);
      }
    } catch (error: any) {
      toast.error("Erro ao carregar template");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este template?")) {
      return;
    }

    try {
      const response = await deleteNotificationTemplate(id);
      if (response.success) {
        toast.success("Template deletado com sucesso");
        loadTemplates();
      } else {
        toast.error(response.error || "Erro ao deletar template");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar template");
    }
  };

  const handleSave = async () => {
    if (!formData.template_name || !formData.template_type || !formData.target_audience) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    setSaving(true);
    try {
      if (isCreating) {
        if (!(formData as CreateNotificationTemplateData).template_key) {
          toast.error("Chave do template é obrigatória");
          setSaving(false);
          return;
        }

        const response = await createNotificationTemplate(formData as CreateNotificationTemplateData);
        if (response.success) {
          toast.success("Template criado com sucesso");
          setDialogOpen(false);
          loadTemplates();
        } else {
          toast.error(response.error || "Erro ao criar template");
        }
      } else if (isEditing && selectedTemplate) {
        const response = await updateNotificationTemplate(selectedTemplate.id, formData as UpdateNotificationTemplateData);
        if (response.success) {
          toast.success("Template atualizado com sucesso");
          setDialogOpen(false);
          loadTemplates();
        } else {
          toast.error(response.error || "Erro ao atualizar template");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  const handleInitializeDefaults = async () => {
    if (!confirm("Isso irá criar os templates padrão do sistema. Continuar?")) {
      return;
    }

    try {
      const response = await initializeDefaultTemplates();
      if (response.success) {
        toast.success("Templates padrão inicializados com sucesso");
        loadTemplates();
      } else {
        toast.error(response.error || "Erro ao inicializar templates");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao inicializar templates");
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "sms":
        return <Smartphone className="h-4 w-4" />;
      case "push":
        return <Bell className="h-4 w-4" />;
      case "in_app":
        return <MessageSquare className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "email":
        return "Email";
      case "sms":
        return "SMS";
      case "push":
        return "Push";
      case "in_app":
        return "In-App";
      default:
        return type;
    }
  };

  const getAudienceLabel = (audience: string) => {
    switch (audience) {
      case "admin":
        return "Admin";
      case "organizer":
        return "Organizador";
      case "runner":
        return "Corredor";
      case "all":
        return "Todos";
      default:
        return audience;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold mb-2">Templates de Notificação</h2>
          <p className="text-muted-foreground">Gerencie os modelos de notificações (email, SMS, push, in-app)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleInitializeDefaults}>
            Inicializar Padrões
          </Button>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Template
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Templates</CardTitle>
          <CardDescription>Lista de todos os templates de notificação</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, chave, assunto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="in_app">In-App</SelectItem>
              </SelectContent>
            </Select>
            <Select value={audienceFilter} onValueChange={setAudienceFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Público" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os públicos</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="organizer">Organizador</SelectItem>
                <SelectItem value="runner">Corredor</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum template encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Público</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sistema</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.template_name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">{template.template_key}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getTypeIcon(template.template_type)}
                        {getTypeLabel(template.template_type)}
                      </div>
                    </TableCell>
                    <TableCell>{getAudienceLabel(template.target_audience)}</TableCell>
                    <TableCell>
                      <Badge variant={template.is_active ? "default" : "secondary"}>
                        {template.is_active ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {template.is_system && (
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Shield className="h-3 w-3" />
                          Sistema
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(template.id)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!template.is_system && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? "Criar Template" : "Editar Template"}
            </DialogTitle>
            <DialogDescription>
              {isCreating
                ? "Crie um novo template de notificação"
                : "Edite o template de notificação"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {isCreating && (
              <div>
                <Label htmlFor="template_key">Chave do Template *</Label>
                <Input
                  id="template_key"
                  value={(formData as CreateNotificationTemplateData).template_key || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      template_key: e.target.value,
                    } as CreateNotificationTemplateData)
                  }
                  placeholder="ex: registration_confirmed"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Chave única para identificar o template (sem espaços, use underscore)
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="template_name">Nome do Template *</Label>
              <Input
                id="template_name"
                value={formData.template_name || ""}
                onChange={(e) =>
                  setFormData({ ...formData, template_name: e.target.value })
                }
                placeholder="ex: Inscrição Confirmada"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="template_type">Tipo *</Label>
                <Select
                  value={formData.template_type}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, template_type: value })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="sms">SMS</SelectItem>
                    <SelectItem value="push">Push</SelectItem>
                    <SelectItem value="in_app">In-App</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="target_audience">Público-Alvo *</Label>
                <Select
                  value={formData.target_audience}
                  onValueChange={(value: any) =>
                    setFormData({ ...formData, target_audience: value })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="organizer">Organizador</SelectItem>
                    <SelectItem value="runner">Corredor</SelectItem>
                    <SelectItem value="all">Todos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.template_type === "email" && (
              <div>
                <Label htmlFor="subject">Assunto do Email</Label>
                <Input
                  id="subject"
                  value={formData.subject || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  placeholder="ex: Inscrição Confirmada - {{eventTitle}}"
                  className="mt-1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"{{variável}}"} para variáveis dinâmicas
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="body_html">Corpo HTML</Label>
              <Textarea
                id="body_html"
                value={formData.body_html || ""}
                onChange={(e) =>
                  setFormData({ ...formData, body_html: e.target.value })
                }
                placeholder="<h1>Título</h1><p>Conteúdo com {{variável}}</p>"
                className="mt-1 min-h-[200px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use {"{{variável}}"} para variáveis dinâmicas
              </p>
            </div>

            <div>
              <Label htmlFor="body_text">Corpo Texto (Fallback)</Label>
              <Textarea
                id="body_text"
                value={formData.body_text || ""}
                onChange={(e) =>
                  setFormData({ ...formData, body_text: e.target.value })
                }
                placeholder="Versão texto simples do conteúdo"
                className="mt-1 min-h-[150px] font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
              <Label htmlFor="is_active">Template Ativo</Label>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  "Salvar"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default NotificationTemplatesManagement;

