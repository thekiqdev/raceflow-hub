import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Key, Copy, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getUserProfileById,
  updateUserProfile,
  resetUserPassword,
  generateRandomPassword,
  deleteUser,
} from "@/lib/api/userManagement";

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onSuccess?: () => void;
}

export function UserProfileDialog({
  open,
  onOpenChange,
  userId,
  onSuccess,
}: UserProfileDialogProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    cpf: "",
    phone: "",
    gender: "",
    birth_date: "",
    status: "",
    role: "",
  });
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open && userId) {
      loadUserProfile();
    } else {
      setIsEditing(false);
      setGeneratedPassword(null);
      setPasswordCopied(false);
    }
  }, [open, userId]);

  const loadUserProfile = async () => {
    if (!userId) return;

    setLoading(true);
    try {
      const response = await getUserProfileById(userId);
      if (response.success && response.data) {
        const data = response.data;
        console.log('📥 Dados recebidos do backend:', data);
        
        const profileData = {
          full_name: data.full_name || "",
          email: data.email || "",
          cpf: data.cpf || "",
          phone: data.phone || "",
          gender: data.gender || "",
          birth_date: data.birth_date
            ? new Date(data.birth_date).toISOString().split("T")[0]
            : "",
          status: data.status || "",
          role: data.role || "",
        };
        
        console.log('📋 Dados mapeados para formData:', profileData);
        setFormData(profileData);
      } else {
        toast.error(response.error || "Erro ao carregar perfil do usuário");
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Erro ao carregar perfil:", error);
      toast.error("Erro ao carregar perfil do usuário");
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    try {
      const updateData: any = {};
      
      // Only include fields that have values
      if (formData.full_name && formData.full_name.trim() !== '') {
        updateData.full_name = formData.full_name;
      }
      if (formData.phone && formData.phone.trim() !== '') {
        updateData.phone = formData.phone;
      }
      if (formData.gender) {
        updateData.gender = formData.gender;
      }
      if (formData.birth_date && formData.birth_date.trim() !== '') {
        updateData.birth_date = formData.birth_date;
      }
      if (formData.status) {
        updateData.status = formData.status;
      }
      if (formData.role) {
        updateData.role = formData.role;
      }

      const response = await updateUserProfile(userId, updateData);

      if (response.success) {
        toast.success("Perfil atualizado com sucesso!");
        setIsEditing(false);
        if (onSuccess) {
          onSuccess();
        }
        loadUserProfile();
      } else {
        toast.error(response.error || "Erro ao atualizar perfil");
      }
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      toast.error("Erro ao atualizar perfil");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!userId) return;

    if (!confirm(`Tem certeza que deseja excluir este usuário? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await deleteUser(userId);
      if (response.success) {
        toast.success("Usuário excluído com sucesso!");
        onOpenChange(false);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(response.error || "Erro ao excluir usuário");
      }
    } catch (error) {
      console.error("Erro ao excluir usuário:", error);
      toast.error("Erro ao excluir usuário");
    } finally {
      setDeleting(false);
    }
  };

  const handleGeneratePassword = async () => {
    if (!userId) return;

    const newPassword = generateRandomPassword(12);
    setResettingPassword(true);
    setPasswordCopied(false);

    try {
      const response = await resetUserPassword(userId, newPassword);
      if (response.success) {
        setGeneratedPassword(newPassword);
        toast.success("Nova senha gerada com sucesso!");
      } else {
        toast.error(response.error || "Erro ao gerar nova senha");
      }
    } catch (error) {
      console.error("Erro ao gerar senha:", error);
      toast.error("Erro ao gerar nova senha");
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setPasswordCopied(true);
      toast.success("Senha copiada para a área de transferência!");
      setTimeout(() => setPasswordCopied(false), 2000);
    }
  };

  const formatCPF = (cpf: string) => {
    if (!cpf) return "";
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil do Usuário</DialogTitle>
          <DialogDescription>
            Visualize e edite as informações do perfil
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Informações Básicas */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome Completo</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) =>
                    setFormData({ ...formData, full_name: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={formData.email}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formatCPF(formData.cpf)}
                  disabled
                  className="bg-muted"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gênero</Label>
                <Select
                  value={formData.gender || ""}
                  onValueChange={(value) =>
                    setFormData({ ...formData, gender: value })
                  }
                  disabled={!isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o gênero" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="O">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="birth_date">Data de Nascimento</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) =>
                    setFormData({ ...formData, birth_date: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                {isEditing ? (
                  <Select
                    value={formData.status || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, status: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativo</SelectItem>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="blocked">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="status"
                    value={
                      formData.status === "active"
                        ? "Ativo"
                        : formData.status === "blocked"
                        ? "Bloqueado"
                        : formData.status === "pending"
                        ? "Pendente"
                        : formData.status || ""
                    }
                    disabled
                    className="bg-muted"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Função</Label>
                {isEditing ? (
                  <Select
                    value={formData.role || ""}
                    onValueChange={(value) =>
                      setFormData({ ...formData, role: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a função" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Administrador</SelectItem>
                      <SelectItem value="organizer">Organizador</SelectItem>
                      <SelectItem value="runner">Atleta</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="role"
                    value={
                      formData.role === "admin"
                        ? "Administrador"
                        : formData.role === "organizer"
                        ? "Organizador"
                        : formData.role === "runner"
                        ? "Atleta"
                        : formData.role || ""
                    }
                    disabled
                    className="bg-muted"
                  />
                )}
              </div>
            </div>

            {/* Gerar Nova Senha */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold mb-1">Gerenciar Senha</h3>
                  <p className="text-sm text-muted-foreground">
                    Gere uma nova senha aleatória para o usuário
                  </p>
                </div>
                <Button
                  onClick={handleGeneratePassword}
                  disabled={resettingPassword}
                  variant="outline"
                >
                  {resettingPassword ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Key className="h-4 w-4 mr-2" />
                  )}
                  Gerar Nova Senha
                </Button>
              </div>

              {generatedPassword && (
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <Label className="text-sm text-muted-foreground">
                        Nova Senha Gerada:
                      </Label>
                      <p className="font-mono text-sm mt-1 break-all">
                        {generatedPassword}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={handleCopyPassword}
                      className="ml-2"
                    >
                      {passwordCopied ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    ⚠️ Copie esta senha agora. Ela não será exibida novamente.
                  </p>
                </div>
              )}
            </div>

            {/* Botões de Ação */}
            <div className="flex justify-between pt-4 border-t">
              <div>
                {isEditing && formData.status === "blocked" && (
                  <Button
                    variant="destructive"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Excluindo...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Excluir Usuário
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditing(false);
                        loadUserProfile();
                      }}
                      disabled={saving || deleting}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={saving || deleting}>
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        "Salvar Alterações"
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Fechar
                    </Button>
                    <Button onClick={() => setIsEditing(true)}>Editar Perfil</Button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

