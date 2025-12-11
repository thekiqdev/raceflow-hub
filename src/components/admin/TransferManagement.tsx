import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, CheckCircle, XCircle, Clock, DollarSign, User, Mail, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getTransferRequests, updateTransferRequest, type TransferRequest } from "@/lib/api/transferRequests";
import { getSystemSettings, updateSystemSettings } from "@/lib/api/systemSettings";

const TransferManagement = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transferRequests, setTransferRequests] = useState<TransferRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<TransferRequest | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isFeeDialogOpen, setIsFeeDialogOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [transferFee, setTransferFee] = useState<number>(0);
  const [savingFee, setSavingFee] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [requestsResponse, settingsResponse] = await Promise.all([
        getTransferRequests(),
        getSystemSettings(),
      ]);

      if (requestsResponse.success && requestsResponse.data) {
        setTransferRequests(requestsResponse.data);
      }

      if (settingsResponse.success && settingsResponse.data) {
        setTransferFee(settingsResponse.data.transfer_fee || 0);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
      toast.error("Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFee = async () => {
    setSavingFee(true);
    try {
      const response = await updateSystemSettings({
        transfer_fee: transferFee,
      });

      if (response.success) {
        toast.success("Taxa de transferência atualizada com sucesso!");
        setIsFeeDialogOpen(false);
      } else {
        toast.error(response.error || "Erro ao atualizar taxa");
      }
    } catch (error) {
      console.error("Erro ao salvar taxa:", error);
      toast.error("Erro ao salvar taxa");
    } finally {
      setSavingFee(false);
    }
  };

  const handleOpenDialog = (request: TransferRequest) => {
    setSelectedRequest(request);
    setAdminNotes(request.admin_notes || "");
    setIsDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setSaving(true);
    try {
      const response = await updateTransferRequest(selectedRequest.id, {
        status: "approved",
        admin_notes: adminNotes,
      });

      if (response.success) {
        toast.success(response.message || "Solicitação aprovada com sucesso!");
        setIsDialogOpen(false);
        setSelectedRequest(null);
        loadData();
      } else {
        toast.error(response.error || "Erro ao aprovar solicitação");
      }
    } catch (error: any) {
      console.error("Erro ao aprovar solicitação:", error);
      toast.error(error.message || "Erro ao aprovar solicitação");
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    setSaving(true);
    try {
      const response = await updateTransferRequest(selectedRequest.id, {
        status: "rejected",
        admin_notes: adminNotes,
      });

      if (response.success) {
        toast.success("Solicitação rejeitada");
        setIsDialogOpen(false);
        setSelectedRequest(null);
        loadData();
      } else {
        toast.error(response.error || "Erro ao rejeitar solicitação");
      }
    } catch (error: any) {
      console.error("Erro ao rejeitar solicitação:", error);
      toast.error(error.message || "Erro ao rejeitar solicitação");
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Aprovada</Badge>;
      case "rejected":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Rejeitada</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-blue-600"><CheckCircle className="w-3 h-3 mr-1" /> Concluída</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatPrice = (price: number) => {
    return `R$ ${price.toFixed(2).replace('.', ',')}`;
  };

  const pendingRequests = transferRequests.filter((r) => r.status === "pending");
  const allRequests = transferRequests;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gerenciamento de Transferências</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie solicitações de transferência de inscrições
        </p>
      </div>

      {/* Lista de Solicitações */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Solicitações de Transferência</CardTitle>
              <CardDescription>
                Gerencie as solicitações de transferência de inscrições
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsFeeDialogOpen(true)}
              className="flex items-center gap-2"
            >
              <DollarSign className="h-4 w-4" />
              Configurar Taxa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="pending" className="w-full">
            <TabsList>
              <TabsTrigger value="pending">
                Pendentes ({pendingRequests.length})
              </TabsTrigger>
              <TabsTrigger value="all">
                Todas ({allRequests.length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pending" className="space-y-4 mt-4">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma solicitação pendente
                </div>
              ) : (
                pendingRequests.map((request) => (
                  <Card key={request.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{request.event_title || "Evento"}</h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>Solicitante: {request.requester_name || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span>Código: {request.confirmation_code || "N/A"}</span>
                          </div>
                          {request.new_runner_email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4" />
                              <span>Novo titular: {request.new_runner_email}</span>
                            </div>
                          )}
                          {request.new_runner_cpf && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>CPF: {request.new_runner_cpf}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span>Taxa: {formatPrice(request.transfer_fee)}</span>
                          </div>
                          <div>
                            <span>
                              Criada em: {format(new Date(request.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                        </div>
                        {request.reason && (
                          <div className="text-sm">
                            <span className="font-medium">Motivo: </span>
                            <span className="text-muted-foreground">{request.reason}</span>
                          </div>
                        )}
                      </div>
                      <Button onClick={() => handleOpenDialog(request)}>
                        Processar
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>
            <TabsContent value="all" className="space-y-4 mt-4">
              {allRequests.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma solicitação encontrada
                </div>
              ) : (
                allRequests.map((request) => (
                  <Card key={request.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-2 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{request.event_title || "Evento"}</h3>
                          {getStatusBadge(request.status)}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            <span>Solicitante: {request.requester_name || "N/A"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            <span>Código: {request.confirmation_code || "N/A"}</span>
                          </div>
                          {request.new_runner_name && (
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              <span>Novo titular: {request.new_runner_name}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            <span>Taxa: {formatPrice(request.transfer_fee)}</span>
                          </div>
                          <div>
                            <span>
                              Criada em: {format(new Date(request.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </span>
                          </div>
                          {request.processed_at && (
                            <div>
                              <span>
                                Processada em: {format(new Date(request.processed_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </span>
                            </div>
                          )}
                        </div>
                        {request.admin_notes && (
                          <div className="text-sm">
                            <span className="font-medium">Observações: </span>
                            <span className="text-muted-foreground">{request.admin_notes}</span>
                          </div>
                        )}
                      </div>
                      {request.status === "pending" && (
                        <Button onClick={() => handleOpenDialog(request)}>
                          Processar
                        </Button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Dialog de Configuração de Taxa */}
      <Dialog open={isFeeDialogOpen} onOpenChange={setIsFeeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Configuração de Taxa de Transferência
            </DialogTitle>
            <DialogDescription>
              Defina o valor da taxa cobrada para transferências de inscrições
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="transfer-fee-modal">Taxa de Transferência (R$)</Label>
              <Input
                id="transfer-fee-modal"
                type="number"
                step="0.01"
                min="0"
                value={transferFee}
                onChange={(e) => setTransferFee(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
              <p className="text-sm text-muted-foreground">
                Esta taxa será aplicada a todas as novas solicitações de transferência
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFeeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFee} disabled={savingFee}>
              {savingFee ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar Taxa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de Processamento */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Processar Solicitação de Transferência</DialogTitle>
            <DialogDescription>
              {selectedRequest?.event_title || "Evento"} - {selectedRequest?.confirmation_code || "N/A"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Solicitante:</span>
                <p className="text-muted-foreground">{selectedRequest?.requester_name || "N/A"}</p>
              </div>
              <div>
                <span className="font-medium">Taxa:</span>
                <p className="text-muted-foreground">{selectedRequest ? formatPrice(selectedRequest.transfer_fee) : "N/A"}</p>
              </div>
              {selectedRequest?.new_runner_email && (
                <div>
                  <span className="font-medium">Email do novo titular:</span>
                  <p className="text-muted-foreground">{selectedRequest.new_runner_email}</p>
                </div>
              )}
              {selectedRequest?.new_runner_cpf && (
                <div>
                  <span className="font-medium">CPF do novo titular:</span>
                  <p className="text-muted-foreground">{selectedRequest.new_runner_cpf}</p>
                </div>
              )}
              {selectedRequest?.reason && (
                <div className="col-span-2">
                  <span className="font-medium">Motivo:</span>
                  <p className="text-muted-foreground">{selectedRequest.reason}</p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-notes">Observações Administrativas</Label>
              <Textarea
                id="admin-notes"
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Adicione observações sobre esta solicitação..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Rejeitar
            </Button>
            <Button onClick={handleApprove} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Aprovar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransferManagement;

