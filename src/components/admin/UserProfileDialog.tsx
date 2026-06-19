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
import { getRegistrations } from "@/lib/api/registrations";
import { formatDateOnlyBrasilia } from "@/lib/utils";
import { validateFullName, FULL_NAME_VALIDATION_MESSAGE, validatePhone, PHONE_VALIDATION_MESSAGE, validatePostalCode, POSTAL_CODE_VALIDATION_MESSAGE, validateCity, CITY_VALIDATION_MESSAGE, validateNeighborhood, NEIGHBORHOOD_VALIDATION_MESSAGE, validateBirthDateRange, BIRTH_DATE_VALIDATION_MESSAGE, validateGender, GENDER_VALIDATION_MESSAGE, validateContactEmail, EMAIL_VALIDATION_MESSAGE, normalizeGender } from "@/lib/utils/profileValidation";
import { normalizePersonName, normalizePlaceName, normalizePhoneDigits, normalizePostalCode, normalizeEmail } from "@/lib/utils/profileNormalization";
import { maskPhone, maskCep } from "@/lib/utils/masks";

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
  const [initialFullName, setInitialFullName] = useState("");
  const [initialPhone, setInitialPhone] = useState("");
  const [initialPostalCode, setInitialPostalCode] = useState("");
  const [initialCity, setInitialCity] = useState("");
  const [initialNeighborhood, setInitialNeighborhood] = useState("");
  const [initialBirthDate, setInitialBirthDate] = useState("");
  const [initialGender, setInitialGender] = useState("");
  const [initialContactEmail, setInitialContactEmail] = useState("");

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    cpf: "",
    phone: "",
    gender: "",
    birth_date: "",
    status: "",
    role: "",
    preferred_name: "",
    profession: "",
    cbat: "",
    team: "",
    postal_code: "",
    street: "",
    address_number: "",
    address_complement: "",
    neighborhood: "",
    city: "",
    state: "",
    is_public: false,
    lgpd_consent: false,
    created_at: "",
    updated_at: "",
  });
  const [deleting, setDeleting] = useState(false);
  const [userRegistrations, setUserRegistrations] = useState<any[]>([]);
  const [loadingRegistrations, setLoadingRegistrations] = useState(false);

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
          phone: data.phone ? maskPhone(data.phone) : "",
          gender: data.gender || "",
          birth_date: data.birth_date
            ? new Date(data.birth_date).toISOString().split("T")[0]
            : "",
          status: data.status || "",
          role: data.role || "",
          preferred_name: data.preferred_name || "",
          profession: data.profession || "",
          cbat: data.cbat || "",
          team: data.team || "",
          postal_code: data.postal_code ? maskCep(data.postal_code) : "",
          street: data.street || "",
          address_number: data.address_number || "",
          address_complement: data.address_complement || "",
          neighborhood: data.neighborhood || "",
          city: data.city || "",
          state: data.state || "",
          is_public: data.is_public || false,
          lgpd_consent: data.lgpd_consent || false,
          created_at: data.created_at || "",
          updated_at: data.updated_at || "",
        };
        
        console.log('📋 Dados mapeados para formData:', profileData);
        setFormData(profileData);
        setInitialFullName(data.full_name || "");
        setInitialPhone(data.phone || "");
        setInitialPostalCode(data.postal_code || "");
        setInitialCity(data.city || "");
        setInitialNeighborhood(data.neighborhood || "");
        setInitialBirthDate(
          data.birth_date ? new Date(data.birth_date).toISOString().split("T")[0] : ""
        );
        setInitialGender(data.gender || "");
        setInitialContactEmail(data.contact_email || "");
        
        // Load user registrations if user is a runner
        if (data.role === 'runner' || !data.role) {
          loadUserRegistrations(userId);
        }
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

  const loadUserRegistrations = async (runnerId: string) => {
    setLoadingRegistrations(true);
    try {
      const response = await getRegistrations({ runner_id: runnerId });
      if (response.success && response.data) {
        // Sort by created_at descending (most recent first) and limit to 10
        const sortedRegistrations = response.data
          .sort((a: any, b: any) => {
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return dateB - dateA;
          })
          .slice(0, 10);
        setUserRegistrations(sortedRegistrations);
      }
    } catch (error) {
      console.error("Erro ao carregar inscrições:", error);
    } finally {
      setLoadingRegistrations(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    setSaving(true);
    try {
      const updateData: any = {};
      
      // Only include fields that have values
      if (formData.full_name && formData.full_name.trim() !== '') {
        const trimmedName = normalizePersonName(formData.full_name);
        const nameChanged =
          trimmedName.replace(/\s+/g, " ") !==
          initialFullName.trim().replace(/\s+/g, " ");
        if (nameChanged) {
          const fullNameCheck = validateFullName(trimmedName);
          if (!fullNameCheck.valid) {
            toast.error(fullNameCheck.message ?? FULL_NAME_VALIDATION_MESSAGE);
            setSaving(false);
            return;
          }
        }
        updateData.full_name = trimmedName;
      }
      if (formData.email && formData.email.trim() !== '') {
        updateData.email = formData.email.trim();
      }
      if (formData.cpf && formData.cpf.trim() !== '') {
        updateData.cpf = formData.cpf;
      }
      if (formData.phone && formData.phone.trim() !== '') {
        const normalizedPhone = normalizePhoneDigits(formData.phone);
        if (normalizedPhone !== normalizePhoneDigits(initialPhone)) {
          const phoneCheck = validatePhone(normalizedPhone);
          if (!phoneCheck.valid) {
            toast.error(phoneCheck.message ?? PHONE_VALIDATION_MESSAGE);
            setSaving(false);
            return;
          }
        }
        updateData.phone = normalizedPhone;
      }
      if (formData.gender) {
        const normalizedGender = normalizeGender(formData.gender);
        if (normalizedGender !== normalizeGender(initialGender)) {
          const genderCheck = validateGender(normalizedGender);
          if (!genderCheck.valid) {
            toast.error(genderCheck.message ?? GENDER_VALIDATION_MESSAGE);
            setSaving(false);
            return;
          }
        }
        updateData.gender = normalizedGender;
      }
      if (formData.birth_date && formData.birth_date.trim() !== '') {
        const birthChanged = formData.birth_date !== initialBirthDate;
        if (birthChanged) {
          const birthCheck = validateBirthDateRange(formData.birth_date);
          if (!birthCheck.valid) {
            toast.error(birthCheck.message ?? BIRTH_DATE_VALIDATION_MESSAGE);
            setSaving(false);
            return;
          }
        }
        updateData.birth_date = formData.birth_date;
      }
      if (formData.status) {
        updateData.status = formData.status;
      }
      if (formData.role) {
        updateData.role = formData.role;
      }
      if (formData.preferred_name !== undefined) {
        updateData.preferred_name = formData.preferred_name || null;
      }
      if (formData.profession !== undefined) {
        updateData.profession = formData.profession || null;
      }
      if (formData.cbat !== undefined) {
        updateData.cbat = formData.cbat || null;
      }
      if (formData.team !== undefined) {
        updateData.team = formData.team || null;
      }
      if (formData.postal_code !== undefined) {
        const normalizedPostalCode = normalizePostalCode(formData.postal_code);
        if (normalizedPostalCode !== normalizePostalCode(initialPostalCode)) {
          if (normalizedPostalCode) {
            const postalCheck = validatePostalCode(normalizedPostalCode);
            if (!postalCheck.valid) {
              toast.error(postalCheck.message ?? POSTAL_CODE_VALIDATION_MESSAGE);
              setSaving(false);
              return;
            }
          }
        }
        updateData.postal_code = normalizedPostalCode || null;
      }
      if (formData.street !== undefined) {
        updateData.street = formData.street || null;
      }
      if (formData.address_number !== undefined) {
        updateData.address_number = formData.address_number || null;
      }
      if (formData.address_complement !== undefined) {
        updateData.address_complement = formData.address_complement || null;
      }
      if (formData.neighborhood !== undefined) {
        const normalizedNeighborhood = normalizePlaceName(formData.neighborhood);
        if (normalizedNeighborhood !== normalizePlaceName(initialNeighborhood)) {
          if (normalizedNeighborhood) {
            const neighborhoodCheck = validateNeighborhood(normalizedNeighborhood);
            if (!neighborhoodCheck.valid) {
              toast.error(neighborhoodCheck.message ?? NEIGHBORHOOD_VALIDATION_MESSAGE);
              setSaving(false);
              return;
            }
          }
        }
        updateData.neighborhood = normalizedNeighborhood || null;
      }
      if (formData.city !== undefined) {
        const normalizedCity = normalizePlaceName(formData.city);
        if (normalizedCity !== normalizePlaceName(initialCity)) {
          if (normalizedCity) {
            const cityCheck = validateCity(normalizedCity);
            if (!cityCheck.valid) {
              toast.error(cityCheck.message ?? CITY_VALIDATION_MESSAGE);
              setSaving(false);
              return;
            }
          }
        }
        updateData.city = normalizedCity || null;
      }
      if (formData.state !== undefined) {
        updateData.state = formData.state || null;
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
                  type="email"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value.trim() })
                  }
                  disabled={!isEditing}
                  className={!isEditing ? "bg-muted" : ""}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={formData.cpf}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    if (value.length <= 11) {
                      setFormData({ ...formData, cpf: value });
                    }
                  }}
                  disabled={!isEditing}
                  placeholder="00000000000"
                  maxLength={11}
                />
                {isEditing && (
                  <p className="text-xs text-muted-foreground">
                    Digite apenas os números do CPF (11 dígitos)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: maskPhone(e.target.value) })
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

              {/* Campos adicionais */}
              <div className="space-y-2">
                <Label htmlFor="preferred_name">Nome Preferido</Label>
                <Input
                  id="preferred_name"
                  value={formData.preferred_name}
                  onChange={(e) =>
                    setFormData({ ...formData, preferred_name: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profession">Profissão</Label>
                <Input
                  id="profession"
                  value={formData.profession}
                  onChange={(e) =>
                    setFormData({ ...formData, profession: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cbat">CBAT</Label>
                <Input
                  id="cbat"
                  value={formData.cbat}
                  onChange={(e) =>
                    setFormData({ ...formData, cbat: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="team">Time/Equipe</Label>
                <Input
                  id="team"
                  value={formData.team}
                  onChange={(e) =>
                    setFormData({ ...formData, team: e.target.value })
                  }
                  disabled={!isEditing}
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Endereço</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postal_code">CEP</Label>
                  <Input
                    id="postal_code"
                    value={formData.postal_code}
                    onChange={(e) =>
                      setFormData({ ...formData, postal_code: maskCep(e.target.value) })
                    }
                    disabled={!isEditing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="street">Rua</Label>
                  <Input
                    id="street"
                    value={formData.street}
                    onChange={(e) =>
                      setFormData({ ...formData, street: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address_number">Número</Label>
                  <Input
                    id="address_number"
                    value={formData.address_number}
                    onChange={(e) =>
                      setFormData({ ...formData, address_number: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    value={formData.address_complement}
                    onChange={(e) =>
                      setFormData({ ...formData, address_complement: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="neighborhood">Bairro</Label>
                  <Input
                    id="neighborhood"
                    value={formData.neighborhood}
                    onChange={(e) =>
                      setFormData({ ...formData, neighborhood: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Cidade</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) =>
                      setFormData({ ...formData, city: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">Estado</Label>
                  <Input
                    id="state"
                    value={formData.state}
                    onChange={(e) =>
                      setFormData({ ...formData, state: e.target.value })
                    }
                    disabled={!isEditing}
                  />
                </div>
              </div>
            </div>

            {/* Informações adicionais */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Informações Adicionais</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="is_public">Perfil Público</Label>
                  <Input
                    id="is_public"
                    value={formData.is_public ? "Sim" : "Não"}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lgpd_consent">Consentimento LGPD</Label>
                  <Input
                    id="lgpd_consent"
                    value={formData.lgpd_consent ? "Sim" : "Não"}
                    disabled
                    className="bg-muted"
                  />
                </div>

                {formData.created_at && (
                  <div className="space-y-2">
                    <Label htmlFor="created_at">Data de Criação</Label>
                    <Input
                      id="created_at"
                      value={new Date(formData.created_at).toLocaleString('pt-BR')}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                )}

                {formData.updated_at && (
                  <div className="space-y-2">
                    <Label htmlFor="updated_at">Última Atualização</Label>
                    <Input
                      id="updated_at"
                      value={new Date(formData.updated_at).toLocaleString('pt-BR')}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Últimas Inscrições (apenas para corredores) */}
            {(formData.role === 'runner' || !formData.role) && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Últimas Inscrições</h3>
                {loadingRegistrations ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : userRegistrations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma inscrição encontrada</p>
                ) : (
                  <div className="space-y-2">
                    {userRegistrations.map((reg) => (
                      <div
                        key={reg.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium">{reg.event_title || 'Evento sem nome'}</p>
                            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                              {reg.category_name && (
                                <span>Categoria: {reg.category_name}</span>
                              )}
                              {reg.event_date && (
                                <span>
                                  Data: {formatDateOnlyBrasilia(reg.event_date)}
                                </span>
                              )}
                              {reg.created_at && (
                                <span>
                                  Inscrito em: {new Date(reg.created_at).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-xs px-2 py-1 rounded ${
                              reg.status === 'confirmed' ? 'bg-green-100 text-green-800' :
                              reg.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              reg.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {reg.status === 'confirmed' ? 'Confirmada' :
                               reg.status === 'pending' ? 'Pendente' :
                               reg.status === 'cancelled' ? 'Cancelada' :
                               reg.status || 'N/A'}
                            </span>
                            {reg.total_amount && parseFloat(reg.total_amount) > 0 && (
                              <span className="text-sm font-medium">
                                R$ {parseFloat(reg.total_amount).toFixed(2).replace('.', ',')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

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


