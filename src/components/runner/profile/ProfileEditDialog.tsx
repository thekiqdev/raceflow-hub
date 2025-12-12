import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { updateOwnProfile, type Profile } from "@/lib/api/profiles";
import { maskPhone, maskCep, unmask } from "@/lib/utils/masks";
import { fetchAddressByCep } from "@/lib/api/viacep";

interface ProfileEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
}

export function ProfileEditDialog({ open, onOpenChange, profile }: ProfileEditDialogProps) {
  const [formData, setFormData] = useState({
    full_name: profile.full_name || "",
    preferred_name: profile.preferred_name || "",
    phone: profile.phone || "",
    birth_date: profile.birth_date || "",
    gender: profile.gender || "",
    postal_code: profile.postal_code || "",
    street: profile.street || "",
    address_number: profile.address_number || "",
    address_complement: profile.address_complement || "",
    neighborhood: profile.neighborhood || "",
    city: profile.city || "",
    state: profile.state || "",
  });
  const [saving, setSaving] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    if (open && profile) {
      // Formatar telefone e CEP ao carregar
      const formattedPhone = profile.phone ? maskPhone(profile.phone) : "";
      const formattedCep = profile.postal_code ? maskCep(profile.postal_code) : "";
      
      setFormData({
        full_name: profile.full_name || "",
        preferred_name: profile.preferred_name || "",
        phone: formattedPhone,
        birth_date: profile.birth_date ? profile.birth_date.split('T')[0] : "",
        gender: profile.gender || "",
        postal_code: formattedCep,
        street: profile.street || "",
        address_number: profile.address_number || "",
        address_complement: profile.address_complement || "",
        neighborhood: profile.neighborhood || "",
        city: profile.city || "",
        state: profile.state || "",
      });
    }
  }, [open, profile]);

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
      setSaving(true);
      const response = await updateOwnProfile({
        full_name: formData.full_name,
        preferred_name: formData.preferred_name || undefined,
        phone: unmask(formData.phone),
        birth_date: formData.birth_date,
        gender: formData.gender || undefined,
        postal_code: unmask(formData.postal_code) || undefined,
        street: formData.street || undefined,
        address_number: formData.address_number || undefined,
        address_complement: formData.address_complement || undefined,
        neighborhood: formData.neighborhood || undefined,
        city: formData.city || undefined,
        state: formData.state || undefined,
      });

      if (response.success) {
        toast.success("Dados atualizados com sucesso!");
        onOpenChange(false);
        // Recarregar a página para atualizar os dados
        window.location.reload();
      } else {
        toast.error(response.error || "Erro ao atualizar dados");
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
            
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome Completo *</Label>
              <Input
                id="full_name"
                value={formData.full_name}
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
              <Label htmlFor="cpf">CPF</Label>
              <Input id="cpf" value={profile.cpf} disabled className="bg-muted" />
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
                  onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="gender">Gênero</Label>
              <Select value={formData.gender} onValueChange={(value) => setFormData({ ...formData, gender: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">Masculino</SelectItem>
                  <SelectItem value="F">Feminino</SelectItem>
                </SelectContent>
              </Select>
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
