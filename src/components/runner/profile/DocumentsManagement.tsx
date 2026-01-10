import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Calendar, CheckCircle, Clock, XCircle, Trash2, Download, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getRunnerDocuments,
  uploadDocument,
  deleteDocument,
  type RunnerDocument,
  type DocumentType,
} from "@/lib/api/documents";

interface DocumentsManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

export function DocumentsManagement({ open, onOpenChange }: DocumentsManagementProps) {
  const [documents, setDocuments] = useState<RunnerDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadType, setUploadType] = useState<DocumentType | "">("");
  const [expiryDate, setExpiryDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load documents when dialog opens
  useEffect(() => {
    if (open) {
      loadDocuments();
    }
  }, [open]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await getRunnerDocuments();
      if (response.success && response.data) {
        setDocuments(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar documentos");
      }
    } catch (error) {
      console.error("Erro ao carregar documentos:", error);
      toast.error("Erro ao carregar documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Tipo de arquivo não permitido. Use PDF, JPG ou PNG.");
      return;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Tamanho máximo: 10MB.");
      return;
    }

    setSelectedFile(file);

    // Create preview for images
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFilePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleUpload = async () => {
    if (!uploadType) {
      toast.error("Selecione o tipo de documento");
      return;
    }

    if (!selectedFile) {
      toast.error("Selecione um arquivo");
      return;
    }

    setUploading(true);
    try {
      const response = await uploadDocument({
        document_type: uploadType,
        expiry_date: expiryDate || null,
        file: selectedFile,
      });

      if (response.success) {
        toast.success("Documento enviado com sucesso!");
        setShowUploadForm(false);
        setUploadType("");
        setExpiryDate("");
        setSelectedFile(null);
        setFilePreview(null);
        // Reset file input
        const fileInput = document.getElementById("file-input") as HTMLInputElement;
        if (fileInput) fileInput.value = "";
        await loadDocuments();
      } else {
        toast.error(response.error || "Erro ao enviar documento");
      }
    } catch (error) {
      console.error("Erro ao enviar documento:", error);
      toast.error("Erro ao enviar documento");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Tem certeza que deseja deletar este documento?")) {
      return;
    }

    setDeletingId(documentId);
    try {
      const response = await deleteDocument(documentId);
      if (response.success) {
        toast.success("Documento deletado com sucesso!");
        await loadDocuments();
      } else {
        toast.error(response.error || "Erro ao deletar documento");
      }
    } catch (error) {
      console.error("Erro ao deletar documento:", error);
      toast.error("Erro ao deletar documento");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownload = (document: RunnerDocument) => {
    window.open(document.file_url, "_blank");
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      approved: { icon: CheckCircle, label: "Aprovado", variant: "default" as const, className: "bg-green-500" },
      pending: { icon: Clock, label: "Pendente", variant: "secondary" as const, className: "" },
      rejected: { icon: XCircle, label: "Rejeitado", variant: "destructive" as const, className: "" },
    };
    const config = variants[status as keyof typeof variants];
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gerenciar Documentos</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {!showUploadForm && (
            <Button onClick={() => setShowUploadForm(true)} className="w-full">
              <Upload className="w-4 h-4 mr-2" />
              Enviar Novo Documento
            </Button>
          )}

          {showUploadForm && (
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de Documento *</Label>
                  <Select value={uploadType} onValueChange={(value) => setUploadType(value as DocumentType)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data de Validade (opcional)</Label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Arquivo * (PDF, JPG ou PNG - máximo 10MB)</Label>
                  <Input
                    id="file-input"
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileSelect}
                  />
                  {filePreview && (
                    <div className="mt-2">
                      <img src={filePreview} alt="Preview" className="max-w-full max-h-48 rounded border" />
                    </div>
                  )}
                  {selectedFile && (
                    <p className="text-sm text-muted-foreground">
                      Arquivo selecionado: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowUploadForm(false);
                      setUploadType("");
                      setExpiryDate("");
                      setSelectedFile(null);
                      setFilePreview(null);
                      const fileInput = document.getElementById("file-input") as HTMLInputElement;
                      if (fileInput) fileInput.value = "";
                    }}
                    disabled={uploading}
                  >
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={handleUpload} disabled={uploading || !uploadType || !selectedFile}>
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      "Enviar"
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold">Documentos Enviados</h3>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>Nenhum documento enviado ainda.</p>
                </CardContent>
              </Card>
            ) : (
              documents.map((doc) => (
                <Card key={doc.id}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-3 flex-1">
                          <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                          <div className="space-y-1 flex-1">
                            <div className="font-medium">{DOCUMENT_TYPE_LABELS[doc.document_type] || doc.document_type}</div>
                            <div className="text-sm text-muted-foreground">{doc.file_name}</div>
                            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Enviado: {formatDate(doc.created_at)}
                              </span>
                              {doc.expiry_date && (
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  Válido até: {formatDate(doc.expiry_date)}
                                </span>
                              )}
                            </div>
                            {doc.status === "rejected" && doc.rejection_reason && (
                              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                                  <div>
                                    <strong className="text-destructive">Motivo da rejeição:</strong>
                                    <p className="text-destructive/80">{doc.rejection_reason}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(doc.status)}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2 border-t">
                        {doc.status === "approved" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(doc)}
                            className="flex-1"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                        )}
                        {(doc.status === "pending" || doc.status === "rejected") && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                            className="flex-1"
                          >
                            {deletingId === doc.id ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Deletando...
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Deletar
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
