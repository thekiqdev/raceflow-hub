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
import { Search, Eye, Calendar, Mail, Phone, MessageSquare, Trophy, Loader2 } from "lucide-react";
import { getContactMessages, getContactMessageById, updateContactMessage, type ContactMessage } from "@/lib/api/contactMessages";
import { getFormConfigurations, type FormFieldConfiguration } from "@/lib/api/formConfigurations";
import { useToast } from "@/hooks/use-toast";

const OrganizerContactMessages = () => {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [formFields, setFormFields] = useState<FormFieldConfiguration[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    loadMessages();
    loadFormFields();
  }, [statusFilter, searchTerm]);

  const loadFormFields = async () => {
    try {
      const response = await getFormConfigurations("contact");
      if (response.success && response.data) {
        setFormFields(response.data);
      }
    } catch (error) {
      console.error("Error loading form fields:", error);
    }
  };

  const loadMessages = async () => {
    setLoading(true);
    try {
      const filters: any = { type: 'event' }; // Organizer sees event messages
      if (statusFilter && statusFilter !== 'all') {
        filters.status = statusFilter;
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }

      const response = await getContactMessages(filters);
      if (response.success && response.data) {
        setMessages(response.data);
      } else {
        setMessages([]);
      }
    } catch (error: any) {
      console.error("Error loading contact messages:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar mensagens de contato",
        variant: "destructive",
      });
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewMessage = async (id: string) => {
    try {
      const response = await getContactMessageById(id);
      if (response.success && response.data) {
        setSelectedMessage(response.data);
        setDialogOpen(true);
        
        // Mark as viewed if it's new
        if (response.data.status === 'new') {
          await updateMessageStatus(id, 'viewed');
        }
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao carregar mensagem",
        variant: "destructive",
      });
    }
  };

  const updateMessageStatus = async (id: string, status: 'new' | 'viewed' | 'replied' | 'closed') => {
    setUpdating(true);
    try {
      const response = await updateContactMessage(id, { status });
      if (response.success) {
        toast({
          title: "Sucesso",
          description: "Status da mensagem atualizado",
        });
        loadMessages();
        if (selectedMessage?.id === id) {
          setSelectedMessage({ ...selectedMessage, status });
        }
        // Trigger event to update messages count in sidebar
        window.dispatchEvent(new Event('contact-messages-updated'));
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar status",
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      new: "default",
      viewed: "secondary",
      replied: "outline",
      closed: "secondary",
    };
    const labels: Record<string, string> = {
      new: "Nova",
      viewed: "Visualizada",
      replied: "Respondida",
      closed: "Fechada",
    };
    return (
      <Badge variant={variants[status] || "secondary"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold mb-2">Mensagens de Contato</h2>
        <p className="text-muted-foreground">Visualize e gerencie as mensagens de contato sobre seus eventos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensagens</CardTitle>
          <CardDescription>
            Lista de todas as mensagens recebidas sobre seus eventos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email, assunto, evento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="new">Nova</SelectItem>
                <SelectItem value="viewed">Visualizada</SelectItem>
                <SelectItem value="replied">Respondida</SelectItem>
                <SelectItem value="closed">Fechada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhuma mensagem encontrada
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Assunto</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Recebimento</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {messages.map((message) => (
                  <TableRow key={message.id}>
                    <TableCell className="font-medium">{message.name}</TableCell>
                    <TableCell>{message.email}</TableCell>
                    <TableCell>{message.event_title || 'N/A'}</TableCell>
                    <TableCell className="max-w-[300px] truncate">{message.subject}</TableCell>
                    <TableCell>{getStatusBadge(message.status)}</TableCell>
                    <TableCell>{formatDate(message.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewMessage(message.id)}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Message Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da Mensagem</DialogTitle>
            <DialogDescription>
              Informações completas da mensagem de contato
            </DialogDescription>
          </DialogHeader>
          {selectedMessage && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome</Label>
                  <p className="text-sm font-medium">{selectedMessage.name}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedMessage.status)}</div>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <p className="text-sm">{selectedMessage.email}</p>
                </div>
                {selectedMessage.phone && (
                  <div>
                    <Label className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Telefone
                    </Label>
                    <p className="text-sm">{selectedMessage.phone}</p>
                  </div>
                )}
                {selectedMessage.event_title && (
                  <div>
                    <Label className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Evento
                    </Label>
                    <p className="text-sm">{selectedMessage.event_title}</p>
                  </div>
                )}
                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Data de Recebimento
                  </Label>
                  <p className="text-sm">{formatDate(selectedMessage.created_at)}</p>
                </div>
              </div>
              <div>
                <Label>Assunto</Label>
                <p className="text-sm font-medium mt-1">{selectedMessage.subject}</p>
              </div>
              <div>
                <Label>Mensagem</Label>
                <p className="text-sm mt-1 p-3 bg-muted rounded-md whitespace-pre-wrap">{selectedMessage.message}</p>
              </div>
              
              {/* Campos dinâmicos adicionais */}
              {selectedMessage.additional_fields && Object.keys(selectedMessage.additional_fields).length > 0 && (
                <div className="border-t pt-4">
                  <Label className="text-base font-semibold mb-3 block">Campos Adicionais</Label>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries(selectedMessage.additional_fields).map(([key, value]) => {
                      // Buscar o label do campo nas configurações
                      const fieldConfig = formFields.find(f => f.field_key === key);
                      const fieldLabel = fieldConfig?.field_label || key;
                      
                      return (
                        <div key={key}>
                          <Label>{fieldLabel}</Label>
                          <p className="text-sm">{String(value) || "Não informado"}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <div>
                <Label>Alterar Status</Label>
                <Select
                  value={selectedMessage.status}
                  onValueChange={(value: 'new' | 'viewed' | 'replied' | 'closed') =>
                    updateMessageStatus(selectedMessage.id, value)
                  }
                  disabled={updating}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Nova</SelectItem>
                    <SelectItem value="viewed">Visualizada</SelectItem>
                    <SelectItem value="replied">Respondida</SelectItem>
                    <SelectItem value="closed">Fechada</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizerContactMessages;

