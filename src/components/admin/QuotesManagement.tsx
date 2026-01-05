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
import { Search, Eye, Calendar, Mail, Phone, MapPin, Users, Loader2 } from "lucide-react";
import { getQuotes, getQuoteById, updateQuote, type Quote } from "@/lib/api/quotes";
import { useToast } from "@/hooks/use-toast";

const QuotesManagement = () => {
  const [loading, setLoading] = useState(true);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadQuotes();
  }, [statusFilter, searchTerm]);

  const loadQuotes = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter) filters.status = statusFilter;
      if (searchTerm) filters.search = searchTerm;

      const response = await getQuotes(filters);
      if (response.success && response.data) {
        setQuotes(response.data);
      } else {
        setQuotes([]);
      }
    } catch (error: any) {
      console.error("Error loading quotes:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar orçamentos",
        variant: "destructive",
      });
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewQuote = async (id: string) => {
    try {
      const response = await getQuoteById(id);
      if (response.success && response.data) {
        setSelectedQuote(response.data);
        setDialogOpen(true);
        
        // Mark as viewed if it's new
        if (response.data.status === 'new') {
          await updateQuoteStatus(id, 'viewed');
        }
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Erro ao carregar orçamento",
        variant: "destructive",
      });
    }
  };

  const updateQuoteStatus = async (id: string, status: 'new' | 'viewed' | 'contacted' | 'closed') => {
    setUpdating(true);
    try {
      const response = await updateQuote(id, { status });
      if (response.success) {
        toast({
          title: "Sucesso",
          description: "Status do orçamento atualizado",
        });
        loadQuotes();
        if (selectedQuote?.id === id) {
          setSelectedQuote({ ...selectedQuote, status });
        }
        // Trigger event to update quotes count in admin sidebar
        window.dispatchEvent(new Event('quotes-updated'));
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
      contacted: "outline",
      closed: "secondary",
    };
    const labels: Record<string, string> = {
      new: "Novo",
      viewed: "Visualizado",
      contacted: "Contatado",
      closed: "Fechado",
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
        <h2 className="text-3xl font-bold mb-2">Gestão de Orçamentos</h2>
        <p className="text-muted-foreground">Visualize e gerencie os orçamentos de provas solicitados</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orçamentos</CardTitle>
          <CardDescription>
            Lista de todos os orçamentos recebidos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nome, email, local..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="viewed">Visualizado</SelectItem>
                <SelectItem value="contacted">Contatado</SelectItem>
                <SelectItem value="closed">Fechado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : quotes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum orçamento encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Local</TableHead>
                  <TableHead>Data do Evento</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data de Recebimento</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((quote) => (
                  <TableRow key={quote.id}>
                    <TableCell className="font-medium">{quote.full_name}</TableCell>
                    <TableCell>{quote.email}</TableCell>
                    <TableCell>{quote.event_location}</TableCell>
                    <TableCell>{quote.event_date}</TableCell>
                    <TableCell>{getStatusBadge(quote.status)}</TableCell>
                    <TableCell>{formatDate(quote.created_at)}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewQuote(quote.id)}
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

      {/* Quote Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Orçamento</DialogTitle>
            <DialogDescription>
              Informações completas do orçamento solicitado
            </DialogDescription>
          </DialogHeader>
          {selectedQuote && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nome Completo</Label>
                  <p className="text-sm font-medium">{selectedQuote.full_name}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedQuote.status)}</div>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <p className="text-sm">{selectedQuote.email}</p>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Telefone
                  </Label>
                  <p className="text-sm">{selectedQuote.phone}</p>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Local da Prova
                  </Label>
                  <p className="text-sm">{selectedQuote.event_location}</p>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Data do Evento
                  </Label>
                  <p className="text-sm">{selectedQuote.event_date}</p>
                </div>
                <div>
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Quantidade de Atletas
                  </Label>
                  <p className="text-sm">{selectedQuote.athletes_count}</p>
                </div>
                <div>
                  <Label>Mesmo Local de Largada e Chegada</Label>
                  <p className="text-sm">{selectedQuote.same_start_finish}</p>
                </div>
                <div>
                  <Label>Energia Elétrica</Label>
                  <p className="text-sm">{selectedQuote.electric_power}</p>
                </div>
                <div>
                  <Label>Pontos Adicionais</Label>
                  <p className="text-sm">{selectedQuote.additional_points || "Não informado"}</p>
                </div>
                <div>
                  <Label>Números de Peito</Label>
                  <p className="text-sm">{selectedQuote.chest_numbers}</p>
                </div>
                <div>
                  <Label>Distâncias</Label>
                  <p className="text-sm">{selectedQuote.distances}</p>
                </div>
                <div>
                  <Label>Portão de Cronometragem</Label>
                  <p className="text-sm">{selectedQuote.timing_gate}</p>
                </div>
                <div>
                  <Label>Inscrição Cronoteam</Label>
                  <p className="text-sm">{selectedQuote.cronoteam_registration}</p>
                </div>
              </div>
              <div>
                <Label>Descrição</Label>
                <p className="text-sm mt-1 p-3 bg-muted rounded-md">{selectedQuote.description}</p>
              </div>
              <div>
                <Label>Alterar Status</Label>
                <Select
                  value={selectedQuote.status}
                  onValueChange={(value: 'new' | 'viewed' | 'contacted' | 'closed') =>
                    updateQuoteStatus(selectedQuote.id, value)
                  }
                  disabled={updating}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Novo</SelectItem>
                    <SelectItem value="viewed">Visualizado</SelectItem>
                    <SelectItem value="contacted">Contatado</SelectItem>
                    <SelectItem value="closed">Fechado</SelectItem>
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

export default QuotesManagement;

