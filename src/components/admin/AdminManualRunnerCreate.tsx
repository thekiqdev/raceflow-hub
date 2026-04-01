import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { createManualRunner } from "@/lib/api/userManagement";
import { getAdminPath } from "@/lib/utils/navigation";

const emptyForm = {
  full_name: "",
  cpf: "",
  email: "",
  phone: "",
  birth_date: "",
  gender: "O" as "M" | "F" | "O",
  password: "",
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
  lgpd_consent: true,
};

export default function AdminManualRunnerCreate() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const validateRequired = () => {
    if (!form.full_name.trim()) return "Nome completo é obrigatório";
    if (!form.cpf.trim()) return "CPF é obrigatório";
    if (!form.email.trim()) return "E-mail é obrigatório";
    if (!form.phone.trim()) return "Telefone é obrigatório";
    if (!form.birth_date) return "Data de nascimento é obrigatória";
    if (!form.password) return "Senha é obrigatória";
    return null;
  };

  const submit = async (addAnother: boolean) => {
    const validationMsg = validateRequired();
    if (validationMsg) {
      toast.error(validationMsg);
      return;
    }
    try {
      setSaving(true);
      const response = await createManualRunner({
        ...form,
        cpf: form.cpf.replace(/\D/g, ""),
      });
      if (!response.success) {
        toast.error(response.message || response.error || "Erro ao cadastrar corredor");
        return;
      }
      toast.success("Corredor cadastrado com sucesso");
      if (addAnother) {
        setForm(emptyForm);
        return;
      }
      navigate(getAdminPath("users"));
    } catch (error: any) {
      toast.error(error?.message || "Erro ao cadastrar corredor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold mb-2">Cadastro manual de corredor</h2>
          <p className="text-muted-foreground">
            Fluxo administrativo sem CPF Brasil externo. Mantém validação local e unicidade.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(getAdminPath("users"))}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do corredor</CardTitle>
          <CardDescription>Preencha os campos padrão de cadastro do sistema.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Nome completo *</Label><Input value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
          <div><Label>CPF *</Label><Input value={form.cpf} onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))} /></div>
          <div><Label>E-mail *</Label><Input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></div>
          <div><Label>Telefone *</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></div>
          <div><Label>Data de nascimento *</Label><Input type="date" value={form.birth_date} onChange={(e) => setForm((p) => ({ ...p, birth_date: e.target.value }))} /></div>
          <div>
            <Label>Sexo/Gênero</Label>
            <Select value={form.gender} onValueChange={(v) => setForm((p) => ({ ...p, gender: v as "M" | "F" | "O" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="M">Masculino</SelectItem>
                <SelectItem value="F">Feminino</SelectItem>
                <SelectItem value="O">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Senha *</Label><Input type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} /></div>
          <div><Label>Nome preferido</Label><Input value={form.preferred_name} onChange={(e) => setForm((p) => ({ ...p, preferred_name: e.target.value }))} /></div>
          <div><Label>Profissão</Label><Input value={form.profession} onChange={(e) => setForm((p) => ({ ...p, profession: e.target.value }))} /></div>
          <div><Label>CBAT</Label><Input value={form.cbat} onChange={(e) => setForm((p) => ({ ...p, cbat: e.target.value }))} /></div>
          <div><Label>Equipe</Label><Input value={form.team} onChange={(e) => setForm((p) => ({ ...p, team: e.target.value }))} /></div>
          <div><Label>CEP</Label><Input value={form.postal_code} onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))} /></div>
          <div><Label>Rua</Label><Input value={form.street} onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))} /></div>
          <div><Label>Número</Label><Input value={form.address_number} onChange={(e) => setForm((p) => ({ ...p, address_number: e.target.value }))} /></div>
          <div><Label>Complemento</Label><Input value={form.address_complement} onChange={(e) => setForm((p) => ({ ...p, address_complement: e.target.value }))} /></div>
          <div><Label>Bairro</Label><Input value={form.neighborhood} onChange={(e) => setForm((p) => ({ ...p, neighborhood: e.target.value }))} /></div>
          <div><Label>Cidade</Label><Input value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} /></div>
          <div><Label>UF</Label><Input value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} /></div>
          <div>
            <Label>Consentimento LGPD</Label>
            <Select value={form.lgpd_consent ? "yes" : "no"} onValueChange={(v) => setForm((p) => ({ ...p, lgpd_consent: v === "yes" }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Aceito</SelectItem>
                <SelectItem value="no">Não aceito</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate(getAdminPath("users"))} disabled={saving}>
          Voltar
        </Button>
        <Button onClick={() => void submit(false)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar
        </Button>
        <Button variant="secondary" onClick={() => void submit(true)} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar e adicionar outro
        </Button>
      </div>
    </div>
  );
}

