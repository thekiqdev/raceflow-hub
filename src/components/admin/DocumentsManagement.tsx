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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Eye, CheckCircle, XCircle, Clock, Download, Loader2, FileText, User, Calendar } from "lucide-react";
import {
  getAllDocuments,
  getPendingDocuments,
  approveDocument,
  rejectDocument,
  type RunnerDocument,
  type DocumentType,
  type DocumentStatus,
} from "@/lib/api/documents";
import { useToast } from "@/hooks/use-toast";

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  militar: "Militar",
  estudante: "Estudante",
  pcd: "PCD",
  rg: "RG",
  cpf: "CPF",
  atestado_medico: "Atestado Médico",
  comprovante_residencia: "Comprovante de Residência",
  outro: "Outro",
};

export function DocumentsManagement() {
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<RunnerDocument[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [selectedDocument, setSelectedDocument] = useState<RunnerDocument | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadDocuments();
  }, [statusFilter, typeFilter, searchTerm]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const filters: any = {};
      if (statusFilter && statusFilter !== "all") {
        filters.status = statusFilter;
      }
      if (typeFilter && typeFilter !== "all") {
        filters.document_type = typeFilter;
      }
      if (searchTerm) {
        filters.search = searchTerm;
      }

      const response = await getAllDocuments(filters);
      if (response.success && response.data) {
        setDocuments(response.data);
      } else {
        setDocuments([]);
        if (response.error) {
          toast({
            title: "Erro",
            description: response.error,
            variant: "destructive",
          });
        }
      }
    } catch (error: any) {
      console.error("Error loading documents:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar documentos",
        variant: "destructive",
      });
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDocument = (document: RunnerDocument) => {
    setSelectedDocument(document);
    setDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedDocument) return;

    setProcessing(true);
    try {
      const response = await approveDocument(selectedDocument.id);
      if (response.success) {
        toast({
          title: "Sucesso",
          description: "Documento aprovado com sucesso",
        });
        setApproveDialogOpen(false);
        setDialogOpen(false);
        setSelectedDocument(null);
        loadDocuments();
        // Trigger event to update documents count in sidebar
        window.dispatchEvent(new Event('documents-updated'));
      } else {
        toast({
          title: "Erro",
          description: response.error || "Erro ao aprovar documento",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error approving document:", error);
      toast({
        title: "Erro",
        description: "Erro ao aprovar documento",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedDocument) return;

    if (!rejectionReason.trim()) {
      toast({
        title: "Erro",
        description: "Motivo da rejeição é obrigatório",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const response = await rejectDocument(selectedDocument.id, rejectionReason);
      if (response.success) {
        toast({
          title: "Sucesso",
          description: "Documento rejeitado com sucesso",
        });
        setRejectDialogOpen(false);
        setDialogOpen(false);
        setSelectedDocument(null);
        setRejectionReason("");
        loadDocuments();
        // Trigger event to update documents count in sidebar
        window.dispatchEvent(new Event('documents-updated'));
      } else {
        toast({
          title: "Erro",
          description: response.error || "Erro ao rejeitar documento",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Error rejecting document:", error);
      toast({
        title: "Erro",
        description: "Erro ao rejeitar documento",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: DocumentStatus) => {
    const variants = {
      approved: { icon: CheckCircle, label: "Aprovado", variant: "default" as const, className: "bg-green-500" },
      pending: { icon: Clock, label: "Pendente", variant: "secondary" as const, className: "" },
      rejected: { icon: XCircle, label: "Rejeitado", variant: "destructive" as const, className: "" },
    };
    const config = variants[status];
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className={config.className}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString("pt-BR");
  };

  // Calculate statistics
  const stats = {
    total: documents.length,
    pending: documents.filter((d) => d.status === "pending").length,
    approved: documents.filter((d) => d.status === "approved").length,
    rejected: documents.filter((d) => d.status === "rejected").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestão de Documentos</h1>
        <p className="text-muted-foreground">Aprove ou rejeite documentos enviados pelos runners</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprovados</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.approved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejeitados</CardTitle>
            <XCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.rejected}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou CPF..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="approved">Aprovado</SelectItem>
                <SelectItem value="rejected">Rejeitado</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
          <CardDescription>
            {documents.length} documento(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Nenhum documento encontrado</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Runner</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Data de Envio</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{(doc as any).runner_name || "N/A"}</div>
                            <div className="text-sm text-muted-foreground">
                              {(doc as any).runner_cpf || "N/A"}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{doc.file_name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{formatDate(doc.created_at)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {doc.expiry_date ? formatDate(doc.expiry_date) : "N/A"}
                      </TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDocument(doc)}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Ver
                          </Button>
                          {doc.status === "pending" && (
                            <>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setSelectedDocument(doc);
                                  setApproveDialogOpen(true);
                                }}
                                className="bg-green-600 hover:bg-green-700"
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />
                                Aprovar
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  setSelectedDocument(doc);
                                  setRejectDialogOpen(true);
                                }}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Rejeitar
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Document Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Documento</DialogTitle>
          </DialogHeader>
          {selectedDocument && (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground">Runner</Label>
                  <p className="font-medium">{(selectedDocument as any).runner_name || "N/A"}</p>
                  <p className="text-sm text-muted-foreground">
                    CPF: {(selectedDocument as any).runner_cpf || "N/A"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Email: {(selectedDocument as any).runner_email || "N/A"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tipo de Documento</Label>
                  <p className="font-medium">
                    {DOCUMENT_TYPE_LABELS[selectedDocument.document_type] || selectedDocument.document_type}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Arquivo</Label>
                  <p className="font-medium">{selectedDocument.file_name}</p>
                  <p className="text-sm text-muted-foreground">
                    Tamanho: {(selectedDocument.file_size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">{getStatusBadge(selectedDocument.status)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Data de Envio</Label>
                  <p className="font-medium">{formatDateTime(selectedDocument.created_at)}</p>
                </div>
                {selectedDocument.expiry_date && (
                  <div>
                    <Label className="text-muted-foreground">Data de Validade</Label>
                    <p className="font-medium">{formatDate(selectedDocument.expiry_date)}</p>
                  </div>
                )}
                {selectedDocument.reviewed_at && (
                  <div>
                    <Label className="text-muted-foreground">Revisado em</Label>
                    <p className="font-medium">{formatDateTime(selectedDocument.reviewed_at)}</p>
                  </div>
                )}
                {selectedDocument.rejection_reason && (
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground">Motivo da Rejeição</Label>
                    <p className="font-medium text-destructive">{selectedDocument.rejection_reason}</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => window.open(selectedDocument.file_url, "_blank")}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download/Visualizar
                </Button>
                {selectedDocument.status === "pending" && (
                  <>
                    <Button
                      variant="default"
                      onClick={() => {
                        setDialogOpen(false);
                        setApproveDialogOpen(true);
                      }}
                      className="flex-1 bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Aprovar
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDialogOpen(false);
                        setRejectDialogOpen(true);
                      }}
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Rejeitar
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Documento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja aprovar este documento?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)} disabled={processing}>
              Cancelar
            </Button>
            <Button
              onClick={handleApprove}
              disabled={processing}
              className="bg-green-600 hover:bg-green-700"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Aprovando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Aprovar
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Documento</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição. Este motivo será enviado ao runner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="rejection-reason">Motivo da Rejeição *</Label>
              <Textarea
                id="rejection-reason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Ex: Documento ilegível, documento expirado, documento não corresponde ao tipo selecionado..."
                rows={4}
                className="mt-1"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => {
                setRejectDialogOpen(false);
                setRejectionReason("");
              }} disabled={processing}>
                Cancelar
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={processing || !rejectionReason.trim()}>
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Rejeitando...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Rejeitar
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
