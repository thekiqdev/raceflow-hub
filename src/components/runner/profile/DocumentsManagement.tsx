import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Calendar, CheckCircle, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Document {
  id: number;
  type: string;
  fileName: string;
  uploadDate: string;
  expiryDate: string;
  status: "approved" | "pending" | "rejected";
}

interface DocumentsManagementProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentsManagement({ open, onOpenChange }: DocumentsManagementProps) {
  const [documents, setDocuments] = useState<Document[]>([
    {
      id: 1,
      type: "Militar",
      fileName: "carteira_militar.pdf",
      uploadDate: "2024-01-15",
      expiryDate: "2025-01-15",
      status: "approved",
    },
    {
      id: 2,
      type: "Estudante",
      fileName: "carteirinha_estudante.pdf",
      uploadDate: "2024-02-10",
      expiryDate: "2024-12-31",
      status: "pending",
    },
  ]);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadType, setUploadType] = useState("");

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

  const handleUpload = () => {
    toast.success("Documento enviado para análise!");
    setShowUploadForm(false);
    setUploadType("");
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
                  <Label>Tipo de Documento</Label>
                  <Select value={uploadType} onValueChange={setUploadType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="militar">Militar</SelectItem>
                      <SelectItem value="estudante">Estudante</SelectItem>
                      <SelectItem value="pcd">PCD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data de Validade</Label>
                  <Input type="date" />
                </div>
                <div className="space-y-2">
                  <Label>Arquivo</Label>
                  <Input type="file" accept=".pdf,.jpg,.jpeg,.png" />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setShowUploadForm(false)}>
                    Cancelar
                  </Button>
                  <Button className="flex-1" onClick={handleUpload}>
                    Enviar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            <h3 className="font-semibold">Documentos Enviados</h3>
            {documents.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex gap-3">
                      <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                      <div className="space-y-1">
                        <div className="font-medium">{doc.type}</div>
                        <div className="text-sm text-muted-foreground">{doc.fileName}</div>
                        <div className="flex gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Enviado: {new Date(doc.uploadDate).toLocaleDateString("pt-BR")}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Válido até: {new Date(doc.expiryDate).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(doc.status)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
