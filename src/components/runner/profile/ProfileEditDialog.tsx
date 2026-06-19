import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateOwnProfile, type Profile, type UpdateProfileData } from "@/lib/api/profiles";
import { maskPhone, maskCep, maskCpf, unmask } from "@/lib/utils/masks";
import { fetchAddressByCep } from "@/lib/api/viacep";
import { useAuth } from "@/contexts/AuthContext";
import { validateFullName, FULL_NAME_VALIDATION_MESSAGE, validatePhone, PHONE_VALIDATION_MESSAGE, validatePostalCode, POSTAL_CODE_VALIDATION_MESSAGE, validateCity, CITY_VALIDATION_MESSAGE, validateNeighborhood, NEIGHBORHOOD_VALIDATION_MESSAGE, validateBirthDateRange, BIRTH_DATE_VALIDATION_MESSAGE, validateGender, GENDER_VALIDATION_MESSAGE, validateContactEmail, EMAIL_VALIDATION_MESSAGE, normalizeGender } from "@/lib/utils/profileValidation";
import { normalizePersonName, normalizePlaceName, normalizePhoneDigits, normalizePostalCode, normalizeEmail } from "@/lib/utils/profileNormalization";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}

export function ProfileEditDialog({ open, onOpenChange, profile }: ProfileEditDialogProps) {
  const { user, refreshUser } = useAuth();
  const isAdmin = user?.roles?.includes("admin") ?? false;
  /** Nome, CPF, nascimento e sexo só alteram pelo admin; atleta vê bloqueado. */
  const identityLocked = !isAdmin;
  const isRunner = user?.roles?.includes("runner");
  const [formData, setFormData] = useState({
    full_name: profile.full_name || "",
    preferred_name: profile.preferred_name || "",
    email: profile.email || user?.email || "",
    cpf: profile.cpf || "",
    phone: profile.phone || "",
    birth_date: profile.birth_date || "",
    gender: profile.gender || "",
    profession: profile.profession || "",
    cbat: profile.cbat || "",
    team: profile.team || "",
    postal_code: profile.postal_code || "",
    street: profile.street || "",
    address_number: profile.address_number || "",
    address_complement: profile.address_complement || "",
    neighborhood: profile.neighborhood || "",
    city: profile.city || "",
    state: profile.state || "",
  });
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [originalCpf, setOriginalCpf] = useState(profile.cpf || "");
  const [originalEmail, setOriginalEmail] = useState(profile.email || user?.email || "");
  
  useEffect(() => {
    if (open && profile) {
      setOriginalCpf(profile.cpf || "");
      setOriginalEmail(profile.email || user?.email || "");
    }
  }, [open, profile, user?.email]);
  
  const cpfChanged =
    !identityLocked && unmask(formData.cpf) !== unmask(originalCpf);

  useEffect(() => {
    if (open && profile) {
      // Formatar telefone e CEP ao carregar
      const formattedPhone = profile.phone ? maskPhone(profile.phone) : "";
      const formattedCep = profile.postal_code ? maskCep(profile.postal_code) : "";
      
      const formattedCpf = profile.cpf ? maskCpf(profile.cpf) : "";
      
      setFormData({
        full_name: profile.full_name || "",
        preferred_name: profile.preferred_name || "",
        email: profile.email || user?.email || "",
        cpf: formattedCpf,
        phone: formattedPhone,
        birth_date: profile.birth_date ? profile.birth_date.split('T')[0] : "",
        gender: profile.gender || "",
        profession: profile.profession || "",
        cbat: profile.cbat || "",
        team: profile.team || "",
        postal_code: formattedCep,
        street: profile.street || "",
        address_number: profile.address_number || "",
        address_complement: profile.address_complement || "",
        neighborhood: profile.neighborhood || "",
        city: profile.city || "",
        state: profile.state || "",
      });
      setPassword("");
    }
  }, [open, profile, user?.email]);

  const emailChanged = formData.email.trim().toLowerCase() !== originalEmail.trim().toLowerCase();

  // Buscar endereço por CEP
  const handleCepChange = async (cep: string) => {
    const maskedCep = maskCep(cep);
    setFormData(prev => ({ ...prev, postal_code: maskedCep }));
    
    const cleanCep = unmask(maskedCep);
    if (cleanCep.length === 8) {
      setLoadingCep(true);
      try {
        const address = await fetchAddressByCep(maskedCep);
        
        if (address) {
          setFormData(prev => ({
            ...prev,
            street: address.logradouro || prev.street,
            neighborhood: address.bairro || prev.neighborhood,
            city: address.localidade || prev.city,
            state: address.uf || prev.state,
          }));
        } else {
          toast.error('CEP não encontrado');
        }
      } catch (error) {
        console.error('Erro ao buscar CEP:', error);
        toast.error('Erro ao buscar endereço. Tente novamente.');
      } finally {
        setLoadingCep(false);
      }
    }
  };

  const handleSave = async () => {
    try {
      if (!identityLocked && isRunner && cpfChanged) {
        if (!password) {
          toast.error("É necessário confirmar sua senha para alterar o CPF");
          return;
        }
      }

      const normalizedEmail = formData.email.trim().toLowerCase();
      if (emailChanged) {
        if (!normalizedEmail) {
          toast.error("Informe um e-mail válido");
          return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
          toast.error("Informe um e-mail válido");
          return;
        }
      }

      const normalizedPhone = normalizePhoneDigits(formData.phone);
      const phoneCheck = validatePhone(normalizedPhone);
      if (!phoneCheck.valid) {
        toast.error(phoneCheck.message ?? PHONE_VALIDATION_MESSAGE);
        return;
      }

      const normalizedPostalCode = normalizePostalCode(formData.postal_code);
      if (normalizedPostalCode) {
        const postalCheck = validatePostalCode(normalizedPostalCode);
        if (!postalCheck.valid) {
          toast.error(postalCheck.message ?? POSTAL_CODE_VALIDATION_MESSAGE);
          return;
        }
      }

      const normalizedNeighborhood = normalizePlaceName(formData.neighborhood);
      if (normalizedNeighborhood) {
        const neighborhoodCheck = validateNeighborhood(normalizedNeighborhood);
        if (!neighborhoodCheck.valid) {
          toast.error(neighborhoodCheck.message ?? NEIGHBORHOOD_VALIDATION_MESSAGE);
          return;
        }
      }

      const normalizedCity = normalizePlaceName(formData.city);
      if (normalizedCity) {
        const cityCheck = validateCity(normalizedCity);
        if (!cityCheck.valid) {
          toast.error(cityCheck.message ?? CITY_VALIDATION_MESSAGE);
          return;
        }
      }

      setSaving(true);
      const updateData: Record<string, unknown> = {
        preferred_name: formData.preferred_name || undefined,
        phone: normalizedPhone,
        profession: formData.profession || undefined,
        cbat: formData.cbat || undefined,
        team: formData.team || undefined,
        postal_code: normalizedPostalCode || undefined,
        street: formData.street || undefined,
        address_number: formData.address_number || undefined,
        address_complement: formData.address_complement || undefined,
        neighborhood: normalizedNeighborhood || undefined,
        city: normalizedCity || undefined,
        state: formData.state || undefined,
      };

      if (emailChanged) {
        updateData.email = normalizedEmail;
      }

      if (!identityLocked) {
        const normalizedName = normalizePersonName(formData.full_name);
        const fullNameChanged =
          normalizedName.replace(/\s+/g, " ") !==
          normalizePersonName(profile.full_name || "");
        if (fullNameChanged) {
          const fullNameCheck = validateFullName(normalizedName);
          if (!fullNameCheck.valid) {
            toast.error(fullNameCheck.message ?? FULL_NAME_VALIDATION_MESSAGE);
            return;
          }
        }

        const birthChanged =
          (formData.birth_date || "").split("T")[0] !==
          (profile.birth_date || "").split("T")[0];
        if (birthChanged && formData.birth_date) {
          const birthCheck = validateBirthDateRange(formData.birth_date);
          if (!birthCheck.valid) {
            toast.error(birthCheck.message ?? BIRTH_DATE_VALIDATION_MESSAGE);
            return;
          }
        }

        const genderChanged = normalizeGender(formData.gender) !== normalizeGender(profile.gender);
        if (genderChanged && formData.gender) {
          const genderCheck = validateGender(formData.gender);
          if (!genderCheck.valid) {
            toast.error(genderCheck.message ?? GENDER_VALIDATION_MESSAGE);
            return;
          }
        }

        updateData.full_name = normalizedName;
        updateData.birth_date = formData.birth_date;
        updateData.gender = normalizeGender(formData.gender) || undefined;
        if (cpfChanged) {
          updateData.cpf = unmask(formData.cpf);
        }
        if (isRunner && cpfChanged && password) {
          updateData.password = password;
        }
      }

      const response = await updateOwnProfile(updateData as UpdateProfileData);

      if (response.success) {
        toast.success("Dados atualizados com sucesso!");
        if (emailChanged) {
          await refreshUser();
        }
        onOpenChange(false);
        setPassword("");
        // Disparar evento para recarregar dados do perfil
        window.dispatchEvent(new CustomEvent('profile:updated'));
      } else {
        toast.error(response.message || response.error || "Erro ao atualizar dados");
      }
    } catch (error: any) {
      console.error("Error updating profile:", error);
      toast.error(error.message || "Erro ao atualizar dados");
    } finally {
      setSaving(false);
    }
  };

  // Lista de estados brasileiros
  const estados = [
    { value: 'AC', label: 'Acre' },
    { value: 'AL', label: 'Alagoas' },
    { value: 'AP', label: 'Amapá' },
    { value: 'AM', label: 'Amazonas' },
    { value: 'BA', label: 'Bahia' },
    { value: 'CE', label: 'Ceará' },
    { value: 'DF', label: 'Distrito Federal' },
    { value: 'ES', label: 'Espírito Santo' },
    { value: 'GO', label: 'Goiás' },
    { value: 'MA', label: 'Maranhão' },
    { value: 'MT', label: 'Mato Grosso' },
    { value: 'MS', label: 'Mato Grosso do Sul' },
    { value: 'MG', label: 'Minas Gerais' },
    { value: 'PA', label: 'Pará' },
    { value: 'PB', label: 'Paraíba' },
    { value: 'PR', label: 'Paraná' },
    { value: 'PE', label: 'Pernambuco' },
    { value: 'PI', label: 'Piauí' },
    { value: 'RJ', label: 'Rio de Janeiro' },
    { value: 'RN', label: 'Rio Grande do Norte' },
    { value: 'RS', label: 'Rio Grande do Sul' },
    { value: 'RO', label: 'Rondônia' },
    { value: 'RR', label: 'Roraima' },
    { value: 'SC', label: 'Santa Catarina' },
    { value: 'SP', label: 'São Paulo' },
    { value: 'SE', label: 'Sergipe' },
    { value: 'TO', label: 'Tocantins' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Meus Dados</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Dados Pessoais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Dados Pessoais</h3>
            {identityLocked && (
              <p className="text-xs text-muted-foreground rounded-md border border-border bg-muted/40 px-3 py-2">
                Nome completo, CPF, data de nascimento e sexo só podem ser alterados pela equipe administrativa.
                Para correções, entre em contato com o suporte.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
                readOnly={identityLocked}
                className={identityLocked ? "bg-muted cursor-not-allowed" : undefined}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="preferred_name">Como você quer ser chamado(a)?</Label>
              <Input
                id="preferred_name"
                placeholder="João"
                value={formData.preferred_name}
                onChange={(e) => setFormData({ ...formData, preferred_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value.trim().toLowerCase() })}
                placeholder="seu@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cpf">CPF</Label>
              <Input
                id="cpf"
                value={formData.cpf}
                readOnly={identityLocked}
                className={identityLocked ? "bg-muted cursor-not-allowed" : undefined}
                onChange={(e) => {
                  const masked = maskCpf(e.target.value);
                  setFormData({ ...formData, cpf: masked });
                }}
                maxLength={14}
                placeholder="000.000.000-00"
              />
              {!identityLocked && isRunner && cpfChanged && (
                <div className="space-y-2 mt-2">
                  <Label htmlFor="password">Confirmar Senha *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha para confirmar a alteração"
                  />
                  <p className="text-xs text-muted-foreground">
                    É necessário confirmar sua senha para alterar o CPF
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                  maxLength={15}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birth_date">Data de Nascimento *</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={formData.birth_date}
                  readOnly={identityLocked}
                  className={identityLocked ? "bg-muted cursor-not-allowed" : undefined}
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gênero</Label>
              {identityLocked ? (
                <Input
                  id="gender"
                  readOnly
                  className="bg-muted cursor-not-allowed"
                  value={
                    formData.gender === "M"
                      ? "Masculino"
                      : formData.gender === "F"
                        ? "Feminino"
                        : ""
                  }
                />
              ) : (
                <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="O">Outro / Não informar</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="profession">Profissão</Label>
              <Input
                id="profession"
                placeholder="Ex: Médico, Engenheiro, Professor..."
                value={formData.profession}
                onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cbat">CBAT</Label>
              <Input
                id="cbat"
                placeholder="Número do CBAT"
                value={formData.cbat}
                onChange={(e) => setFormData({ ...formData, cbat: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team">Equipe</Label>
              <Input
                id="team"
                placeholder="Nome da equipe"
                value={formData.team}
                onChange={(e) => setFormData({ ...formData, team: e.target.value })}
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase">Endereço</h3>
            
            <div className="space-y-2">
              <Label htmlFor="postal_code">CEP</Label>
              <div className="relative">
                <Input
                  id="postal_code"
                  placeholder="00000-000"
                  value={formData.postal_code}
                  onChange={(e) => handleCepChange(e.target.value)}
                  maxLength={9}
                  disabled={loadingCep}
                />
                {loadingCep && (
                  <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">Digite o CEP para buscar o endereço automaticamente</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Logradouro</Label>
              <Input
                id="street"
                placeholder="Rua, Avenida, etc."
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                disabled={loadingCep}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-1">
                <Label htmlFor="address_number">Número</Label>
                <Input
                  id="address_number"
                  placeholder="123"
                  value={formData.address_number}
                  onChange={(e) => setFormData({ ...formData, address_number: e.target.value })}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="address_complement">Complemento</Label>
                <Input
                  id="address_complement"
                  placeholder="Apto, Bloco, etc."
                  value={formData.address_complement}
                  onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="neighborhood">Bairro</Label>
              <Input
                id="neighborhood"
                placeholder="Nome do bairro"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
                disabled={loadingCep}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="city">Cidade</Label>
                <Input
                  id="city"
                  placeholder="Nome da cidade"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  disabled={loadingCep}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="state">Estado</Label>
                <Select
                  value={formData.state}
                  onValueChange={(value) => setFormData({ ...formData, state: value })}
                  disabled={loadingCep}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {estados.map((estado) => (
                      <SelectItem key={estado.value} value={estado.value}>
                        {estado.label} ({estado.value})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button className="flex-1" onClick={handleSave} disabled={saving}>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
