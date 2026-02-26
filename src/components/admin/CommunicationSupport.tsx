import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Edit, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type Announcement,
} from "@/lib/api/support";
import { getArticles, type KnowledgeArticle } from "@/lib/api/knowledge";
import { DocumentsManagement } from "./DocumentsManagement";
import ContactMessagesManagement from "./ContactMessagesManagement";
import { getPendingDocuments } from "@/lib/api/documents";
import { getNewContactMessagesCount } from "@/lib/api/contactMessages";

const CommunicationSupport = () => {
  const [activeTab, setActiveTab] = useState("contacts");
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [faqs, setFaqs] = useState<KnowledgeArticle[]>([]);
  const [pendingDocumentsCount, setPendingDocumentsCount] = useState(0);
  const [newContactMessagesCount, setNewContactMessagesCount] = useState(0);
  
  // Dialog states
  const [announcementDialogOpen, setAnnouncementDialogOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  
  // Form states
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    content: "",
    target_audience: "all" as "all" | "runners" | "organizers" | "admins",
    status: "draft" as "draft" | "scheduled" | "published" | "archived",
    scheduled_at: "",
  });

  useEffect(() => {
    loadData();
    loadNotificationCounts();
    
    // Listen for updates
    const handleDocumentsUpdate = () => {
      loadPendingDocumentsCount();
    };
    const handleContactMessagesUpdate = () => {
      loadNewContactMessagesCount();
    };
    
    window.addEventListener('documents-updated', handleDocumentsUpdate);
    window.addEventListener('contact-messages-updated', handleContactMessagesUpdate);
    
    // Refresh counts every 30 seconds
    const interval = setInterval(() => {
      loadNotificationCounts();
    }, 30000);
    
    return () => {
      window.removeEventListener('documents-updated', handleDocumentsUpdate);
      window.removeEventListener('contact-messages-updated', handleContactMessagesUpdate);
      clearInterval(interval);
    };
  }, [activeTab]);

  const loadNotificationCounts = async () => {
    await Promise.all([
      loadPendingDocumentsCount(),
      loadNewContactMessagesCount(),
    ]);
  };

  const loadPendingDocumentsCount = async () => {
    try {
      const response = await getPendingDocuments();
      if (response.success && response.data) {
        setPendingDocumentsCount(response.data.length);
      }
    } catch (error) {
      console.error("Erro ao carregar contagem de documentos pendentes:", error);
    }
  };

  const loadNewContactMessagesCount = async () => {
    try {
      const response = await getNewContactMessagesCount();
      if (response.success && response.data) {
        setNewContactMessagesCount(response.data.count);
      }
    } catch (error) {
      console.error("Erro ao carregar contagem de mensagens de contato:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "announcements") {
        const response = await getAnnouncements();
        if (response.success && response.data) {
          setAnnouncements(response.data);
        } else {
          toast.error("Erro ao carregar comunicados");
        }
      } else if (activeTab === "faq") {
        const response = await getArticles();
        if (response.success && response.data) {
          setFaqs(response.data);
        } else {
          toast.error("Erro ao carregar FAQ");
        }
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };


  const handleOpenAnnouncementDialog = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      setAnnouncementForm({
        title: announcement.title,
        content: announcement.content,
        target_audience: announcement.target_audience as any,
        status: announcement.status as any,
        scheduled_at: announcement.scheduled_at || "",
      });
    } else {
      setEditingAnnouncement(null);
      setAnnouncementForm({
        title: "",
        content: "",
        target_audience: "all",
        status: "draft",
        scheduled_at: "",
      });
    }
    setAnnouncementDialogOpen(true);
  };

  const handleSaveAnnouncement = async () => {
    try {
      if (editingAnnouncement) {
        const response = await updateAnnouncement(editingAnnouncement.id, announcementForm);
        if (response.success) {
          toast.success("Comunicado atualizado com sucesso!");
          setAnnouncementDialogOpen(false);
          loadData();
        } else {
          toast.error(response.error || "Erro ao atualizar comunicado");
        }
      } else {
        const response = await createAnnouncement(announcementForm);
        if (response.success) {
          toast.success("Comunicado criado com sucesso!");
          setAnnouncementDialogOpen(false);
          loadData();
        } else {
          toast.error(response.error || "Erro ao criar comunicado");
        }
      }
    } catch (error) {
      toast.error("Erro ao salvar comunicado");
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este comunicado?")) {
      return;
    }

    try {
      const response = await deleteAnnouncement(id);
      if (response.success) {
        toast.success("Comunicado excluído com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao excluir comunicado");
      }
    } catch (error) {
      toast.error("Erro ao excluir comunicado");
    }
  };


  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Comunicação e Suporte</h2>
        <p className="text-muted-foreground">Gerenciar contatos, comunicados, FAQ e documentos</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="contacts" className="relative">
            Contatos
            {newContactMessagesCount > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {newContactMessagesCount > 9 ? '9+' : newContactMessagesCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="announcements">Comunicados</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
          <TabsTrigger value="documents" className="relative">
            Documentos
            {pendingDocumentsCount > 0 && (
              <span className="ml-2 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                {pendingDocumentsCount > 9 ? '9+' : pendingDocumentsCount}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Contatos */}
        <TabsContent value="contacts">
          <ContactMessagesManagement />
        </TabsContent>

        {/* Comunicados */}
        <TabsContent value="announcements">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Comunicados</CardTitle>
                  <CardDescription>Gerenciar comunicados e anúncios</CardDescription>
                </div>
                <Button onClick={() => handleOpenAnnouncementDialog()}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Comunicado
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : announcements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhum comunicado encontrado
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead>Destinatários</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Leituras</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {announcements.map((announcement) => (
                      <TableRow key={announcement.id}>
                        <TableCell className="font-medium">{announcement.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {announcement.target_audience === "all" ? "Todos" :
                             announcement.target_audience === "runners" ? "Atletas" :
                             announcement.target_audience === "organizers" ? "Organizadores" :
                             "Administradores"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={announcement.status === "published" ? "default" : "secondary"}>
                            {announcement.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {announcement.published_at 
                            ? new Date(announcement.published_at).toLocaleDateString('pt-BR')
                            : announcement.scheduled_at
                            ? new Date(announcement.scheduled_at).toLocaleDateString('pt-BR')
                            : "-"}
                        </TableCell>
                        <TableCell>{announcement.reads_count || 0}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Editar"
                              onClick={() => handleOpenAnnouncementDialog(announcement)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Excluir"
                              onClick={() => handleDeleteAnnouncement(announcement.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ */}
        <TabsContent value="faq">
          <Card>
            <CardHeader>
              <CardTitle>Perguntas Frequentes</CardTitle>
              <CardDescription>Gerenciar FAQ pública da plataforma</CardDescription>
              <div className="pt-4">
                <p className="text-sm text-muted-foreground mb-4">
                  O FAQ é gerenciado na seção "Base de Conhecimento". 
                  Os artigos publicados aparecem automaticamente aqui.
                </p>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pergunta</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : faqs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhuma pergunta encontrada
                      </TableCell>
                    </TableRow>
                  ) : (
                    faqs.map((faq) => (
                      <TableRow key={faq.id}>
                        <TableCell className="font-medium">{faq.title}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{faq.category_name || "Sem categoria"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={faq.status === "publicado" ? "default" : "secondary"}>
                            {faq.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" title="Editar">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documentos */}
        <TabsContent value="documents">
          <DocumentsManagement />
        </TabsContent>
      </Tabs>

      {/* Announcement Dialog */}
      <Dialog open={announcementDialogOpen} onOpenChange={setAnnouncementDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAnnouncement ? "Editar Comunicado" : "Novo Comunicado"}
            </DialogTitle>
            <DialogDescription>
              Crie ou edite um comunicado para os usuários
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="ann-title">Título</Label>
              <Input
                id="ann-title"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="ann-content">Conteúdo</Label>
              <Textarea
                id="ann-content"
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                className="mt-2 min-h-[150px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ann-audience">Destinatários</Label>
                <Select
                  value={announcementForm.target_audience}
                  onValueChange={(value) => setAnnouncementForm({ ...announcementForm, target_audience: value as any })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="runners">Atletas</SelectItem>
                    <SelectItem value="organizers">Organizadores</SelectItem>
                    <SelectItem value="admins">Administradores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="ann-status">Status</Label>
                <Select
                  value={announcementForm.status}
                  onValueChange={(value) => setAnnouncementForm({ ...announcementForm, status: value as any })}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho</SelectItem>
                    <SelectItem value="scheduled">Agendado</SelectItem>
                    <SelectItem value="published">Publicado</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {announcementForm.status === "scheduled" && (
              <div>
                <Label htmlFor="ann-scheduled">Data Agendada</Label>
                <Input
                  id="ann-scheduled"
                  type="datetime-local"
                  value={announcementForm.scheduled_at}
                  onChange={(e) => setAnnouncementForm({ ...announcementForm, scheduled_at: e.target.value })}
                  className="mt-2"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnnouncementDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAnnouncement}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CommunicationSupport;
