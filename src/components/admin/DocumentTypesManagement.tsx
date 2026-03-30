import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  getAllDocumentTypes,
  createDocumentType,
  updateDocumentType,
  deleteDocumentType,
  type DocumentType,
  type CreateDocumentTypeData,
  type UpdateDocumentTypeData,
} from "@/lib/api/documentTypes";

export function DocumentTypesManagement() {
  const [loading, setLoading] = useState(true);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<DocumentType | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    requires_expiry_date: false,
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    loadDocumentTypes();
  }, []);

  const loadDocumentTypes = async () => {
    setLoading(true);
    try {
      const response = await getAllDocumentTypes();
      if (response.success && response.data) {
        setDocumentTypes(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar tipos de documentos");
      }
    } catch (error) {
      console.error("Erro ao carregar tipos de documentos:", error);
      toast.error("Erro ao carregar tipos de documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (type?: DocumentType) => {
    if (type) {
      setEditingType(type);
      setFormData({
        code: type.code,
        name: type.name,
        description: type.description || "",
        requires_expiry_date: type.requires_expiry_date,
        is_active: type.is_active,
        display_order: type.display_order,
      });
    } else {
      setEditingType(null);
      setFormData({
        code: "",
        name: "",
        description: "",
        requires_expiry_date: false,
        is_active: true,
        display_order: 0,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingType(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      requires_expiry_date: false,
      is_active: true,
      display_order: 0,
    });
  };

  const handleSave = async () => {
    if (!formData.code.trim() || !formData.name.trim()) {
      toast.error("Código e nome são obrigatórios");
      return;
    }

    // Validate code format (only lowercase letters, numbers, and underscore)
    if (!/^[a-z0-9_]+$/.test(formData.code)) {
      toast.error("Código deve conter apenas letras minúsculas, números e underscore");
      return;
    }

    setSaving(true);
    try {
      if (editingType) {
        // Update
        const updateData: UpdateDocumentTypeData = {
          name: formData.name,
          description: formData.description || null,
          requires_expiry_date: formData.requires_expiry_date,
          is_active: formData.is_active,
          display_order: formData.display_order,
        };
        const response = await updateDocumentType(editingType.id, updateData);
        if (response.success) {
          toast.success("Tipo de documento atualizado com sucesso!");
          handleCloseDialog();
          await loadDocumentTypes();
        } else {
          toast.error(response.error || "Erro ao atualizar tipo de documento");
        }
      } else {
        // Create
        const createData: CreateDocumentTypeData = {
          code: formData.code.trim().toLowerCase(),
          name: formData.name.trim(),
          description: formData.description || null,
          requires_expiry_date: formData.requires_expiry_date,
          is_active: formData.is_active,
          display_order: formData.display_order,
        };
        const response = await createDocumentType(createData);
        if (response.success) {
          toast.success("Tipo de documento criado com sucesso!");
          handleCloseDialog();
          await loadDocumentTypes();
        } else {
          toast.error(response.error || "Erro ao criar tipo de documento");
        }
      }
    } catch (error) {
      console.error("Erro ao salvar tipo de documento:", error);
      toast.error("Erro ao salvar tipo de documento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este tipo de documento?")) {
      return;
    }

    setDeletingId(id);
    try {
      const response = await deleteDocumentType(id);
      if (response.success) {
        toast.success("Tipo de documento excluído com sucesso!");
        await loadDocumentTypes();
      } else {
        toast.error(response.error || "Erro ao excluir tipo de documento");
      }
    } catch (error) {
      console.error("Erro ao excluir tipo de documento:", error);
      toast.error("Erro ao excluir tipo de documento");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Tipos de Documentos
              </CardTitle>
              <CardDescription>
                Gerencie os tipos de documentos que os corredores podem enviar
              </CardDescription>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Tipo
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : documentTypes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum tipo de documento encontrado
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Requer Validade</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ordem</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documentTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-mono text-sm">{type.code}</TableCell>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {type.description || "-"}
                    </TableCell>
                    <TableCell>
                      {type.requires_expiry_date ? (
                        <Badge variant="default">Sim</Badge>
                      ) : (
                        <Badge variant="outline">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {type.is_active ? (
                        <Badge variant="default">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>{type.display_order}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleOpenDialog(type)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(type.id)}
                          disabled={deletingId === type.id}
                          title="Excluir"
                        >
                          {deletingId === type.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingType ? "Editar Tipo de Documento" : "Novo Tipo de Documento"}
            </DialogTitle>
            <DialogDescription>
              {editingType
                ? "Atualize as informações do tipo de documento"
                : "Crie um novo tipo de documento que os corredores podem enviar"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="code">Código *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase() })}
                disabled={!!editingType}
                placeholder="ex: carteira_estudante"
                className="mt-2 font-mono"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Código único (apenas letras minúsculas, números e underscore). Não pode ser alterado após criação.
              </p>
            </div>
            <div>
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ex: Carteira de Estudante"
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional do tipo de documento"
                className="mt-2"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="requires_expiry_date">Requer Data de Validade</Label>
                <p className="text-sm text-muted-foreground">
                  Se ativado, o corredor precisará informar a data de validade ao enviar este documento
                </p>
              </div>
              <Switch
                id="requires_expiry_date"
                checked={formData.requires_expiry_date}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, requires_expiry_date: checked })
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="is_active">Ativo</Label>
                <p className="text-sm text-muted-foreground">
                  Se inativo, este tipo não aparecerá para os corredores
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
            <div>
              <Label htmlFor="display_order">Ordem de Exibição</Label>
              <Input
                id="display_order"
                type="number"
                min="0"
                value={formData.display_order}
                onChange={(e) =>
                  setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })
                }
                className="mt-2"
              />
              <p className="text-sm text-muted-foreground mt-1">
                Tipos com menor número aparecem primeiro na lista
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleCloseDialog}>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
