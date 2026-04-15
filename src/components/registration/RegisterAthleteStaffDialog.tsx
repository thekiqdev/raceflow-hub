import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Search, Loader2, Mail, ChevronDown, ChevronUp, Info } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  createRegistrationByOrganizer,
  createRegistrationBySuperAdmin,
} from "@/lib/api/registrations";
import { getRunnerProfileByCpfForOrganizer, type Profile } from "@/lib/api/profiles";
import { maskCpf, maskPhone, unmask } from "@/lib/utils/masks";
import { validateCpf } from "@/lib/utils/validators";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getCategories, type Category } from "@/lib/api/categories";
import { getEventKits, type EventKit, type KitProduct, type ProductVariant } from "@/lib/api/eventKits";
import type { Event } from "@/lib/api/events";
import { toast } from "sonner";

export type RegisterAthleteStaffMode = "organizer" | "super_admin";

export interface RegisterAthleteStaffDialogProps {
  mode: RegisterAthleteStaffMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: Event[];
  lockedEventId?: string | null;
  onSuccess?: () => void;
}

function formatCPF(cpf: string) {
  if (!cpf) return "";
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
}

export function RegisterAthleteStaffDialog({
  mode,
  open,
  onOpenChange,
  events,
  lockedEventId = null,
  onSuccess,
}: RegisterAthleteStaffDialogProps) {
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
  const [registerCpf, setRegisterCpf] = useState("");
  const [registerCpfLookupLoading, setRegisterCpfLookupLoading] = useState(false);
  const [athleteFound, setAthleteFound] = useState<boolean | null>(null);
  const [athleteData, setAthleteData] = useState<Profile | null>(null);
  const [runnerData, setRunnerData] = useState<{
    full_name: string;
    birth_date: string;
    city: string;
    gender: string;
    team?: string;
    email?: string;
    phone?: string;
  } | null>(null);
  const [athleteFormData, setAthleteFormData] = useState({
    full_name: "",
    birth_date: "",
    city: "",
    gender: "",
    team: "",
    email: "",
    phone: "",
  });
  const [athleteFormErrors, setAthleteFormErrors] = useState<Record<string, string>>({});
  const [registerCpfError, setRegisterCpfError] = useState<string>("");
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [selectedModalityId, setSelectedModalityId] = useState<string>("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedKitId, setSelectedKitId] = useState<string>("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kits, setKits] = useState<EventKit[]>([]);
  const [loadingModalities, setLoadingModalities] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingKits, setLoadingKits] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedKits, setExpandedKits] = useState<Set<string>>(new Set());
  const [selectedProducts, setSelectedProducts] = useState<Map<string, { productId: string; variantId?: string }>>(
    new Map()
  );
  const [variantSelections, setVariantSelections] = useState<Map<string, Record<string, string>>>(new Map());

  const eventChoices =
    mode === "organizer"
      ? events.filter((e) => e.status === "published" || e.status === "ongoing")
      : events;

  const resetForm = () => {
    setRegisterStep(1);
    setRegisterCpf("");
    setRegisterCpfLookupLoading(false);
    setAthleteFound(null);
    setAthleteData(null);
    setRunnerData(null);
    setAthleteFormData({ full_name: "", birth_date: "", city: "", gender: "", team: "", email: "", phone: "" });
    setAthleteFormErrors({});
    setRegisterCpfError("");
    setSelectedEventId(lockedEventId || "");
    setSelectedModalityId("");
    setSelectedCategoryId("");
    setSelectedKitId("");
    setCustomFieldValues({});
    setExpandedKits(new Set());
    setSelectedProducts(new Map());
    setVariantSelections(new Map());
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, lockedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      loadModalities();
      loadCategories();
      loadKits();
    } else {
      setModalities([]);
      setCategories([]);
      setKits([]);
      setSelectedModalityId("");
      setSelectedCategoryId("");
      setSelectedKitId("");
    }
  }, [selectedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      loadKits();
    }
  }, [selectedCategoryId]);

  useEffect(() => {
    if (selectedModalityId) {
      loadCategoriesByModality();
    } else if (selectedEventId) {
      loadCategories();
    }
    setSelectedCategoryId("");
  }, [selectedModalityId]);

  const loadModalities = async () => {
    if (!selectedEventId) return;
    try {
      setLoadingModalities(true);
      const response = await getModalities(selectedEventId);
      if (response.success && response.data) {
        setModalities(response.data);
        if (response.data.length === 1) {
          setSelectedModalityId(response.data[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading modalities:", error);
      toast.error("Erro ao carregar modalidades");
    } finally {
      setLoadingModalities(false);
    }
  };

  const loadCategories = async () => {
    if (!selectedEventId) return;
    try {
      setLoadingCategories(true);
      const response = await getCategories(selectedEventId);
      if (response.success && response.data) {
        setCategories(response.data);
        if (response.data.length === 1) {
          setSelectedCategoryId(response.data[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading categories:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadCategoriesByModality = async () => {
    if (!selectedModalityId) return;
    try {
      setLoadingCategories(true);
      const { getCategoriesByModality } = await import("@/lib/api/categories");
      const response = await getCategoriesByModality(selectedModalityId);
      if (response.success && response.data) {
        setCategories(response.data);
        if (response.data.length === 1) {
          setSelectedCategoryId(response.data[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading categories by modality:", error);
      toast.error("Erro ao carregar categorias");
    } finally {
      setLoadingCategories(false);
    }
  };

  const loadKits = async () => {
    if (!selectedEventId) return;
    try {
      setLoadingKits(true);
      const response = await getEventKits(selectedEventId, selectedCategoryId || undefined);
      if (response.success && response.data) {
        setKits(response.data);
        if (response.data.length === 1) {
          setSelectedKitId(response.data[0].id);
          setExpandedKits((prev) => new Set(prev).add(response.data![0].id));
        }
      } else {
        setKits([]);
      }
    } catch (error) {
      console.error("Error loading kits:", error);
      toast.error("Erro ao carregar kits");
      setKits([]);
    } finally {
      setLoadingKits(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleAthleteFormNext = () => {
    const err: Record<string, string> = {};
    if (!athleteFormData.full_name?.trim()) err.full_name = "Nome é obrigatório";
    if (athleteFormData.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(athleteFormData.email))
      err.email = "Email inválido";
    setAthleteFormErrors(err);
    if (Object.keys(err).length > 0) return;
    setRunnerData({
      full_name: athleteFormData.full_name.trim(),
      birth_date: athleteFormData.birth_date?.trim() || undefined,
      city: athleteFormData.city?.trim() || undefined,
      gender: athleteFormData.gender || undefined,
      team: athleteFormData.team?.trim() || undefined,
      email: athleteFormData.email?.trim() || undefined,
      phone: athleteFormData.phone?.trim() ? unmask(athleteFormData.phone) : undefined,
    });
    setRegisterStep(3);
  };

  const handleCpfLookup = async () => {
    const cleanCpf = unmask(registerCpf);
    setRegisterCpfError("");
    if (cleanCpf.length !== 11) {
      toast.error("Informe um CPF com 11 dígitos");
      setRegisterCpfError("O CPF deve conter 11 dígitos.");
      return;
    }
    if (!validateCpf(registerCpf)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      setRegisterCpfError("CPF inválido. Verifique os dígitos verificadores.");
      return;
    }
    setRegisterCpfLookupLoading(true);
    setAthleteFound(null);
    setAthleteData(null);
    try {
      const response = await getRunnerProfileByCpfForOrganizer(registerCpf);
      if (response.success && response.data) {
        setAthleteFound(true);
        setAthleteData(response.data);
      } else {
        setAthleteFound(false);
        setAthleteData(null);
      }
    } catch {
      setAthleteFound(false);
      setAthleteData(null);
    } finally {
      setRegisterCpfLookupLoading(false);
    }
  };

  const handleRegisterAthlete = async () => {
    const cleanCpf = unmask(registerCpf);
    if (cleanCpf.length !== 11) {
      toast.error("CPF é obrigatório e deve ter 11 dígitos.");
      return;
    }
    if (!validateCpf(registerCpf)) {
      toast.error("CPF inválido. Verifique os dígitos.");
      return;
    }
    if (!selectedEventId || !selectedCategoryId) {
      toast.error("Selecione o evento e a categoria");
      return;
    }
    if (athleteFound === false && !runnerData) {
      toast.error(
        "Preencha os dados do atleta no passo anterior (Nome completo, Sexo e Data de nascimento são obrigatórios)."
      );
      return;
    }
    if (athleteFound === false && runnerData) {
      if (!runnerData.full_name?.trim()) {
        toast.error("Nome completo do atleta é obrigatório.");
        return;
      }
      if (!runnerData.birth_date) {
        toast.error("Data de nascimento do atleta é obrigatória.");
        return;
      }
      if (!runnerData.gender) {
        toast.error("Sexo do atleta é obrigatório.");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const productSelections: Array<{
        product_id: string;
        variant_id?: string;
        attribute_selections?: Record<string, string>;
      }> = [];
      if (selectedKitId && selectedProducts.has(selectedKitId)) {
        const selection = selectedProducts.get(selectedKitId);
        if (selection) {
          const kitKey = `${selectedKitId}-${selection.productId}`;
          const variantSelection = variantSelections.get(kitKey);
          productSelections.push({
            product_id: selection.productId,
            variant_id: selection.variantId,
            attribute_selections: variantSelection || undefined,
          });
        }
      }

      const payload = {
        cpf: cleanCpf,
        runner_data: runnerData || undefined,
        event_id: selectedEventId,
        category_id: selectedCategoryId,
        kit_id: selectedKitId || undefined,
        modality_id: selectedModalityId || undefined,
        product_selections: productSelections.length > 0 ? productSelections : undefined,
        custom_field_values: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      };

      const response =
        mode === "organizer"
          ? await createRegistrationByOrganizer(payload)
          : await createRegistrationBySuperAdmin(payload);

      if (response.success) {
        toast.success(
          mode === "super_admin"
            ? "Atleta inscrito com sucesso. Taxa da plataforma não aplicada."
            : "Atleta inscrito com sucesso!"
        );
        handleClose();
        onSuccess?.();
      } else {
        toast.error(response.message || response.error || "Erro ao inscrever atleta");
      }
    } catch (error: unknown) {
      console.error("Error registering athlete:", error);
      const err = error as { message?: string; response?: { data?: { message?: string } } };
      toast.error(err?.message || err?.response?.data?.message || "Erro ao inscrever atleta");
    } finally {
      setIsSubmitting(false);
    }
  };

  const lockedEventTitle = lockedEventId ? events.find((e) => e.id === lockedEventId)?.title : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Inscrever atleta</DialogTitle>
          <DialogDescription>
            {registerStep === 1 && "Informe o CPF do atleta. Se já tiver cadastro, os dados serão preenchidos automaticamente."}
            {registerStep === 2 && "Preencha os dados do atleta para criar o cadastro."}
            {registerStep === 3 && "Selecione evento, modalidade, categoria e kit para concluir a inscrição."}
          </DialogDescription>
        </DialogHeader>

        {mode === "super_admin" && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              A inscrição será criada como inscrição normal (confirmada e paga no sistema). A taxa da plataforma não será
              aplicada. Você pode inscrever mesmo com inscrições encerradas no evento.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          {registerStep === 1 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="register-cpf">CPF do Atleta * (obrigatório)</Label>
                <div className="flex gap-2">
                  <Input
                    id="register-cpf"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="000.000.000-00"
                    value={registerCpf}
                    onChange={(e) => {
                      setRegisterCpf(maskCpf(e.target.value));
                      setAthleteFound(null);
                      setRegisterCpfError("");
                    }}
                    onKeyDown={(e) => e.key === "Enter" && handleCpfLookup()}
                    aria-invalid={!!registerCpfError}
                    aria-describedby={registerCpfError ? "register-cpf-error" : undefined}
                  />
                  <Button
                    type="button"
                    onClick={handleCpfLookup}
                    disabled={registerCpfLookupLoading || unmask(registerCpf).length !== 11}
                    aria-label="Buscar atleta por CPF"
                  >
                    {registerCpfLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    <span className="ml-1">{registerCpfLookupLoading ? "Buscando..." : "Buscar"}</span>
                  </Button>
                </div>
                {registerCpfError && (
                  <p id="register-cpf-error" className="text-sm text-destructive" role="alert">
                    {registerCpfError}
                  </p>
                )}
              </div>
              {athleteFound === true && athleteData && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  Atleta encontrado. Dados preenchidos abaixo. Clique em &quot;Próximo: Inscrição&quot; para continuar.
                </p>
              )}
              {athleteFound === false && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  CPF não cadastrado. Preencha os dados do atleta no próximo passo.
                </p>
              )}
            </>
          )}

          {registerStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Os dados serão utilizados para inscrição no evento e criação de cadastro na plataforma.
              </p>
              <div className="space-y-2">
                <Label htmlFor="athlete-full_name">Nome completo * (obrigatório)</Label>
                <Input
                  id="athlete-full_name"
                  placeholder="Nome do atleta"
                  value={athleteFormData.full_name}
                  onChange={(e) => {
                    setAthleteFormData((prev) => ({ ...prev, full_name: e.target.value }));
                    if (athleteFormErrors.full_name) setAthleteFormErrors((prev) => ({ ...prev, full_name: "" }));
                  }}
                />
                {athleteFormErrors.full_name && <p className="text-sm text-destructive">{athleteFormErrors.full_name}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="athlete-birth_date">Data de nascimento * (obrigatório)</Label>
                <Input
                  id="athlete-birth_date"
                  type="date"
                  value={athleteFormData.birth_date}
                  onChange={(e) => {
                    setAthleteFormData((prev) => ({ ...prev, birth_date: e.target.value }));
                    if (athleteFormErrors.birth_date) setAthleteFormErrors((prev) => ({ ...prev, birth_date: "" }));
                  }}
                />
                {athleteFormErrors.birth_date && <p className="text-sm text-destructive">{athleteFormErrors.birth_date}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="athlete-city">Cidade *</Label>
                <Input
                  id="athlete-city"
                  placeholder="Cidade"
                  value={athleteFormData.city}
                  onChange={(e) => {
                    setAthleteFormData((prev) => ({ ...prev, city: e.target.value }));
                    if (athleteFormErrors.city) setAthleteFormErrors((prev) => ({ ...prev, city: "" }));
                  }}
                />
                {athleteFormErrors.city && <p className="text-sm text-destructive">{athleteFormErrors.city}</p>}
              </div>
              <div className="space-y-2" role="group" aria-labelledby="athlete-gender-label">
                <Label id="athlete-gender-label">Sexo * (obrigatório)</Label>
                <RadioGroup
                  value={athleteFormData.gender}
                  onValueChange={(value) => {
                    setAthleteFormData((prev) => ({ ...prev, gender: value }));
                    if (athleteFormErrors.gender) setAthleteFormErrors((prev) => ({ ...prev, gender: "" }));
                  }}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="M" id="athlete-gender-m" />
                    <Label htmlFor="athlete-gender-m" className="cursor-pointer font-normal">
                      Masculino
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="F" id="athlete-gender-f" />
                    <Label htmlFor="athlete-gender-f" className="cursor-pointer font-normal">
                      Feminino
                    </Label>
                  </div>
                </RadioGroup>
                {athleteFormErrors.gender && <p className="text-sm text-destructive">{athleteFormErrors.gender}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="athlete-team">Equipe (opcional)</Label>
                <Input
                  id="athlete-team"
                  placeholder="Nome da equipe"
                  value={athleteFormData.team}
                  onChange={(e) => setAthleteFormData((prev) => ({ ...prev, team: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="athlete-email">Email (opcional)</Label>
                  <Input
                    id="athlete-email"
                    type="email"
                    placeholder="email@exemplo.com"
                    value={athleteFormData.email}
                    onChange={(e) => {
                      setAthleteFormData((prev) => ({ ...prev, email: e.target.value }));
                      if (athleteFormErrors.email) setAthleteFormErrors((prev) => ({ ...prev, email: "" }));
                    }}
                  />
                  {athleteFormErrors.email && <p className="text-sm text-destructive">{athleteFormErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="athlete-phone">Telefone (opcional)</Label>
                  <Input
                    id="athlete-phone"
                    placeholder="(00) 00000-0000"
                    value={athleteFormData.phone}
                    onChange={(e) => setAthleteFormData((prev) => ({ ...prev, phone: maskPhone(e.target.value) }))}
                  />
                </div>
              </div>
            </div>
          )}

          {registerStep === 3 && (
            <>
              {(athleteData || runnerData) && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <p className="font-medium text-muted-foreground mb-1">Inscrição para:</p>
                  <p className="font-medium">
                    {(athleteData?.full_name ?? runnerData?.full_name) || "—"}
                    {registerCpf && (
                      <span className="text-muted-foreground font-normal"> · CPF {formatCPF(unmask(registerCpf))}</span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    {(() => {
                      const birth = athleteData?.birth_date || runnerData?.birth_date;
                      return birth ? <span>Nasc. {format(new Date(birth), "dd/MM/yyyy", { locale: ptBR })}</span> : null;
                    })()}
                    {(athleteData?.city ?? runnerData?.city) && (
                      <span> · {athleteData?.city ?? runnerData?.city}</span>
                    )}
                    {(athleteData?.gender || runnerData?.gender) && (
                      <span>
                        {" "}
                        ·{" "}
                        {athleteData?.gender === "M" || runnerData?.gender === "M"
                          ? "Masculino"
                          : athleteData?.gender === "F" || runnerData?.gender === "F"
                            ? "Feminino"
                            : athleteData?.gender || runnerData?.gender}
                      </span>
                    )}
                    {(athleteData?.team ?? runnerData?.team) && (
                      <span> · Equipe: {athleteData?.team ?? runnerData?.team}</span>
                    )}
                  </p>
                </div>
              )}

              {lockedEventId && lockedEventTitle ? (
                <div className="rounded-md border bg-muted/50 p-3 text-sm">
                  <span className="text-muted-foreground">Evento: </span>
                  <span className="font-medium">{lockedEventTitle}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="event">Evento *</Label>
                  <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                    <SelectTrigger id="event">
                      <SelectValue placeholder="Selecione o evento" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventChoices.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedEventId && (
                <div className="space-y-2">
                  <Label htmlFor="modality">Modalidade</Label>
                  <Select
                    value={selectedModalityId || undefined}
                    onValueChange={(value) => setSelectedModalityId(value || "")}
                    disabled={loadingModalities}
                  >
                    <SelectTrigger id="modality">
                      <SelectValue placeholder={loadingModalities ? "Carregando..." : "Selecione a modalidade (opcional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      {modalities.map((modality) => (
                        <SelectItem key={modality.id} value={modality.id}>
                          {modality.name} {modality.distance && `- ${modality.distance}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedModalityId && (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedModalityId("")}>
                      Limpar seleção
                    </Button>
                  )}
                </div>
              )}

              {selectedEventId && (
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria *</Label>
                  <Select
                    value={selectedCategoryId}
                    onValueChange={(v) => {
                      setSelectedCategoryId(v);
                      setCustomFieldValues({});
                    }}
                    disabled={loadingCategories}
                  >
                    <SelectTrigger id="category">
                      <SelectValue placeholder={loadingCategories ? "Carregando..." : "Selecione a categoria"} />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name} - R$ {category.price.toFixed(2).replace(".", ",")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedCategoryId &&
                (() => {
                  const selectedCat = categories.find((c) => c.id === selectedCategoryId);
                  const customFields = selectedCat?.custom_fields ?? [];
                  if (customFields.length === 0) return null;
                  return (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Campos extras</Label>
                      <div className="grid gap-2">
                        {customFields.map((f) => (
                          <div key={f.id} className="space-y-1.5">
                            <Label htmlFor={`staff-custom-${f.id}`} className="text-xs text-muted-foreground">
                              {f.label}
                            </Label>
                            <Input
                              id={`staff-custom-${f.id}`}
                              type={f.field_type === "number" ? "number" : "text"}
                              value={customFieldValues[f.id] ?? ""}
                              onChange={(e) => setCustomFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))}
                              placeholder={f.field_type === "number" ? "0" : ""}
                              className="max-w-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

              {selectedEventId && (
                <div className="space-y-4">
                  <Label htmlFor="kit">Kit (opcional)</Label>
                  {loadingKits ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="ml-2 text-sm text-muted-foreground">Carregando kits...</span>
                    </div>
                  ) : kits.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum kit disponível para este evento</p>
                  ) : (
                    <div className="space-y-2">
                      <Select
                        value={selectedKitId || undefined}
                        onValueChange={(value) => {
                          setSelectedKitId(value || "");
                          if (!value) {
                            setExpandedKits(new Set());
                            setSelectedProducts(new Map());
                            setVariantSelections(new Map());
                          } else {
                            setExpandedKits((prev) => new Set(prev).add(value));
                          }
                        }}
                        disabled={loadingKits}
                      >
                        <SelectTrigger id="kit">
                          <SelectValue placeholder="Selecione o kit (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {kits.map((kit) => (
                            <SelectItem key={kit.id} value={kit.id}>
                              {kit.name} - R$ {kit.price.toFixed(2).replace(".", ",")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedKitId &&
                        (() => {
                          const selectedKit = kits.find((k) => k.id === selectedKitId);
                          if (!selectedKit) return null;
                          const kitProducts = selectedKit.products || [];
                          const isExpanded = expandedKits.has(selectedKitId);
                          return (
                            <div className="mt-4">
                              <Collapsible
                                open={isExpanded}
                                onOpenChange={(isOpen) => {
                                  if (isOpen) {
                                    setExpandedKits((prev) => new Set(prev).add(selectedKitId));
                                  } else {
                                    setExpandedKits((prev) => {
                                      const next = new Set(prev);
                                      next.delete(selectedKitId);
                                      return next;
                                    });
                                  }
                                }}
                              >
                                <CollapsibleTrigger asChild>
                                  <Button type="button" variant="outline" className="w-full justify-between">
                                    <span>Ver produtos do kit</span>
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="mt-4 space-y-4 border-t pt-4">
                                    {kitProducts.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">Este kit não possui produtos cadastrados</p>
                                    ) : (
                                      kitProducts.map((product: KitProduct) => {
                                        const productKey = `${selectedKitId}-${product.id}`;
                                        const selections = variantSelections.get(productKey) || {};
                                        const selectedProduct = selectedProducts.get(selectedKitId);
                                        const isProductSelected = selectedProduct?.productId === product.id;
                                        return (
                                          <Card key={product.id} className={isProductSelected ? "ring-2 ring-primary" : ""}>
                                            <CardHeader>
                                              <CardTitle className="text-base">{product.name}</CardTitle>
                                              {product.description && <CardDescription>{product.description}</CardDescription>}
                                            </CardHeader>
                                            <CardContent className="space-y-4">
                                              {product.type === "variable" && product.variants && product.variants.length > 0 ? (
                                                <div className="space-y-3">
                                                  <Label className="text-sm font-medium">Selecione a variação:</Label>
                                                  {(() => {
                                                    const savedAttributeNames = product.variant_attributes as string[] | undefined;
                                                    let attributeOrder: string[] = [];
                                                    if (savedAttributeNames && savedAttributeNames.length > 0) {
                                                      attributeOrder = savedAttributeNames;
                                                    } else {
                                                      const firstAttributes = new Set<string>();
                                                      product.variants.forEach((variant) => {
                                                        if (variant.variant_group_name) {
                                                          firstAttributes.add(variant.variant_group_name);
                                                        }
                                                      });
                                                      if (firstAttributes.size > 0) {
                                                        attributeOrder.push(Array.from(firstAttributes)[0]);
                                                      }
                                                      let maxValues = 0;
                                                      product.variants.forEach((variant) => {
                                                        const values = variant.name.split(" - ").map((v) => v.trim());
                                                        maxValues = Math.max(maxValues, values.length);
                                                      });
                                                      for (let i = 1; i < maxValues; i++) {
                                                        attributeOrder.push(`Atributo ${i + 1}`);
                                                      }
                                                    }
                                                    const getAvailableVariants = (attributeIndex: number): ProductVariant[] => {
                                                      return product.variants!.filter((variant) => {
                                                        const variantValues = variant.name.split(" - ").map((v) => v.trim());
                                                        for (let i = 0; i < attributeIndex; i++) {
                                                          const attrName = attributeOrder[i];
                                                          const selectedValue = selections[attrName];
                                                          if (selectedValue && variantValues[i]?.trim() !== selectedValue) {
                                                            return false;
                                                          }
                                                        }
                                                        return variant.available_quantity === null || variant.available_quantity > 0;
                                                      });
                                                    };
                                                    const getAvailableValues = (attributeIndex: number): string[] => {
                                                      const availableVariants = getAvailableVariants(attributeIndex);
                                                      const orderedValues: string[] = [];
                                                      const seen = new Set<string>();
                                                      availableVariants.forEach((variant) => {
                                                        const variantValues = variant.name.split(" - ").map((v) => v.trim());
                                                        const value = variantValues[attributeIndex]?.trim();
                                                        if (value && !seen.has(value)) {
                                                          seen.add(value);
                                                          orderedValues.push(value);
                                                        }
                                                      });
                                                      return orderedValues;
                                                    };
                                                    return (
                                                      <div className="space-y-3">
                                                        {attributeOrder.map((attrName, attrIndex) => {
                                                          const availableValues = getAvailableValues(attrIndex);
                                                          const selectedValue = selections[attrName];
                                                          return (
                                                            <div key={attrIndex} className="space-y-2">
                                                              <Label className="text-sm">{attrName}</Label>
                                                              <Select
                                                                value={selectedValue || ""}
                                                                onValueChange={(value) => {
                                                                  const newSelections = { ...selections, [attrName]: value };
                                                                  setVariantSelections((prev) => {
                                                                    const next = new Map(prev);
                                                                    next.set(productKey, newSelections);
                                                                    return next;
                                                                  });
                                                                  const matchingVariant = product.variants!.find((variant) => {
                                                                    const variantValues = variant.name.split(" - ").map((v) => v.trim());
                                                                    return variantValues.every((val, idx) => {
                                                                      const attrNameAtIdx = attributeOrder[idx];
                                                                      return (
                                                                        !newSelections[attrNameAtIdx] ||
                                                                        val === newSelections[attrNameAtIdx]
                                                                      );
                                                                    });
                                                                  });
                                                                  if (matchingVariant) {
                                                                    setSelectedProducts((prev) => {
                                                                      const next = new Map(prev);
                                                                      next.set(selectedKitId, {
                                                                        productId: product.id,
                                                                        variantId: matchingVariant.id,
                                                                      });
                                                                      return next;
                                                                    });
                                                                  }
                                                                }}
                                                              >
                                                                <SelectTrigger>
                                                                  <SelectValue placeholder={`Selecione ${attrName.toLowerCase()}`} />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                  {availableValues.map((value) => (
                                                                    <SelectItem key={value} value={value}>
                                                                      {value}
                                                                    </SelectItem>
                                                                  ))}
                                                                </SelectContent>
                                                              </Select>
                                                            </div>
                                                          );
                                                        })}
                                                      </div>
                                                    );
                                                  })()}
                                                </div>
                                              ) : (
                                                <div className="flex items-center justify-between">
                                                  <span className="text-sm text-muted-foreground">Produto único</span>
                                                  <Button
                                                    type="button"
                                                    variant={isProductSelected ? "default" : "outline"}
                                                    size="sm"
                                                    onClick={() => {
                                                      if (isProductSelected) {
                                                        setSelectedProducts((prev) => {
                                                          const next = new Map(prev);
                                                          next.delete(selectedKitId);
                                                          return next;
                                                        });
                                                      } else {
                                                        setSelectedProducts((prev) => {
                                                          const next = new Map(prev);
                                                          next.set(selectedKitId, { productId: product.id });
                                                          return next;
                                                        });
                                                      }
                                                    }}
                                                  >
                                                    {isProductSelected ? "Selecionado" : "Selecionar"}
                                                  </Button>
                                                </div>
                                              )}
                                            </CardContent>
                                          </Card>
                                        );
                                      })
                                    )}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs mt-2"
                                onClick={() => {
                                  setSelectedKitId("");
                                  setExpandedKits(new Set());
                                  setSelectedProducts(new Map());
                                  setVariantSelections(new Map());
                                }}
                              >
                                Remover kit
                              </Button>
                            </div>
                          );
                        })()}
                    </div>
                  )}
                </div>
              )}

              {selectedCategoryId && (
                <div className="p-4 bg-muted rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total:</span>
                    <span className="text-lg font-bold">
                      R${" "}
                      {(
                        (categories.find((c) => c.id === selectedCategoryId)?.price || 0) +
                        (selectedKitId ? kits.find((k) => k.id === selectedKitId)?.price || 0 : 0)
                      )
                        .toFixed(2)
                        .replace(".", ",")}
                    </span>
                  </div>
                  {mode === "super_admin" && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Valor da inscrição (categoria + kit). Taxa da plataforma não entra neste total.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          {registerStep === 1 && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              {athleteFound === true && <Button onClick={() => setRegisterStep(3)}>Próximo: Inscrição</Button>}
              {athleteFound === false && <Button onClick={() => setRegisterStep(2)}>Próximo: Dados do atleta</Button>}
            </>
          )}
          {registerStep === 2 && (
            <>
              <Button variant="outline" onClick={() => setRegisterStep(1)}>
                Voltar
              </Button>
              <Button onClick={handleAthleteFormNext}>Próximo: Inscrição</Button>
            </>
          )}
          {registerStep === 3 && (
            <>
              <Button variant="outline" onClick={() => setRegisterStep(athleteFound === false ? 2 : 1)} disabled={isSubmitting}>
                Voltar
              </Button>
              <Button
                onClick={handleRegisterAthlete}
                disabled={isSubmitting || !selectedEventId || !selectedCategoryId || (athleteFound === false && !runnerData)}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inscrevendo...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Confirmar inscrição
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
