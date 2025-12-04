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
import { MessageSquare, Send, Eye, CheckCircle, Edit, Trash2, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  getSupportTickets,
  updateTicketStatus,
  addTicketMessage,
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  type SupportTicket,
  type Announcement,
} from "@/lib/api/support";
import { getArticles, type KnowledgeArticle } from "@/lib/api/knowledge";

const CommunicationSupport = () => {
  const [activeTab, setActiveTab] = useState("tickets");
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [faqs, setFaqs] = useState<KnowledgeArticle[]>([]);
  
  // Dialog states
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [ticketMessage, setTicketMessage] = useState("");
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
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "tickets") {
      const timer = setTimeout(() => {
        loadData();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [searchTerm]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "tickets") {
        const response = await getSupportTickets(searchTerm ? { search: searchTerm } : undefined);
        if (response.success && response.data) {
          setTickets(response.data);
        } else {
          toast.error("Erro ao carregar chamados");
        }
      } else if (activeTab === "announcements") {
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

  const handleViewTicket = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setTicketDialogOpen(true);
  };

  const handleRespondTicket = async () => {
    if (!selectedTicket || !ticketMessage.trim()) {
      toast.error("Por favor, digite uma mensagem");
      return;
    }

    try {
      const response = await addTicketMessage(selectedTicket.id, {
        message: ticketMessage,
        is_internal: false,
      });

      if (response.success) {
        toast.success("Resposta enviada com sucesso!");
        setTicketMessage("");
        setTicketDialogOpen(false);
        loadData();
      } else {
        toast.error(response.error || "Erro ao enviar resposta");
      }
    } catch (error) {
      toast.error("Erro ao enviar resposta");
    }
  };

  const handleCloseTicket = async (ticketId: string) => {
    try {
      const response = await updateTicketStatus(ticketId, { status: "fechado" });
      if (response.success) {
        toast.success("Chamado encerrado com sucesso!");
        loadData();
      } else {
        toast.error(response.error || "Erro ao encerrar chamado");
      }
    } catch (error) {
      toast.error("Erro ao encerrar chamado");
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "aberto":
        return "destructive";
      case "respondido":
        return "default";
      case "resolvido":
        return "default";
      case "fechado":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const getStatusLabel = (status: string) => {
    return status.replace("_", " ");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Comunicação e Suporte</h2>
        <p className="text-muted-foreground">Gerenciar chamados, comunicados e FAQ</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="tickets">Chamados</TabsTrigger>
          <TabsTrigger value="announcements">Comunicados</TabsTrigger>
          <TabsTrigger value="faq">FAQ</TabsTrigger>
        </TabsList>

        {/* Chamados */}
        <TabsContent value="tickets">
          <Card>
            <CardHeader>
              <CardTitle>Chamados de Suporte</CardTitle>
              <CardDescription>Gerenciar solicitações de atletas e organizadores</CardDescription>
              <div className="relative pt-4">
                <MessageSquare className="absolute left-3 top-7 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar chamados..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : tickets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum chamado encontrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    tickets.map((ticket) => (
                      <TableRow key={ticket.id}>
                        <TableCell>#{ticket.id.slice(0, 8)}</TableCell>
                        <TableCell className="font-medium">{ticket.user_name || "Desconhecido"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{ticket.user_type || "N/A"}</Badge>
                        </TableCell>
                        <TableCell>{ticket.subject}</TableCell>
                        <TableCell>{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusColor(ticket.status)}>
                            {getStatusLabel(ticket.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Visualizar"
                              onClick={() => handleViewTicket(ticket)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              title="Responder"
                              onClick={() => handleViewTicket(ticket)}
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            {ticket.status !== "fechado" && (
                              <Button 
                                size="icon" 
                                variant="ghost" 
                                title="Encerrar"
                                onClick={() => handleCloseTicket(ticket.id)}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
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
      </Tabs>

      {/* Ticket Dialog */}
      <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chamado #{selectedTicket?.id.slice(0, 8)}</DialogTitle>
            <DialogDescription>
              {selectedTicket?.subject}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Mensagem Original</Label>
              <p className="text-sm text-muted-foreground mt-2 p-3 bg-muted rounded-md">
                {selectedTicket?.message}
              </p>
            </div>
            <div>
              <Label htmlFor="response">Resposta</Label>
              <Textarea
                id="response"
                placeholder="Digite sua resposta..."
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                className="mt-2 min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTicketDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRespondTicket}>
              <Send className="mr-2 h-4 w-4" />
              Enviar Resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
