import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Loader2 } from "lucide-react";
import { getCategories, type Category } from "@/lib/api/categories";
import { getModalities, type Modality } from "@/lib/api/modalities";
import { getEventKits, type EventKit } from "@/lib/api/eventKits";
import { completeInvitation, type Registration } from "@/lib/api/registrations";
import { toast } from "sonner";

interface CompleteInvitationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  registration: Registration | null;
  onSuccess?: () => void;
}

export function CompleteInvitationModal({
  open,
  onOpenChange,
  registration,
  onSuccess,
}: CompleteInvitationModalProps) {
  const [categoryId, setCategoryId] = useState("");
  const [modalityId, setModalityId] = useState("");
  const [kitId, setKitId] = useState("");
  const [variantSelections, setVariantSelections] = useState<Record<string, string>>({});
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [modalities, setModalities] = useState<Modality[]>([]);
  const [kits, setKits] = useState<EventKit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const eventId = registration?.event_id;

  useEffect(() => {
    if (!open || !eventId) {
      setCategories([]);
      setModalities([]);
      setKits([]);
      setCategoryId("");
      setModalityId("");
      setKitId("");
      setVariantSelections({});
      setCustomFieldValues({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [catRes, modRes, kitsRes] = await Promise.all([
          getCategories(eventId),
          getModalities(eventId),
          getEventKits(eventId),
        ]);
        if (cancelled) return;
        if (catRes.success && catRes.data) setCategories(catRes.data);
        if (modRes.success && modRes.data) setModalities(modRes.data);
        if (kitsRes.success && kitsRes.data) setKits(kitsRes.data);
      } catch {
        if (!cancelled) toast.error("Erro ao carregar opções do evento.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, eventId]);

  useEffect(() => {
    if (!open || !eventId) return;
    let cancelled = false;
    const loadKits = async () => {
      try {
        const res = await getEventKits(eventId, categoryId || undefined);
        if (cancelled) return;
        if (res.success && res.data) setKits(res.data);
      } catch {
        if (!cancelled) setKits([]);
      }
    };
    loadKits();
    return () => { cancelled = true; };
  }, [open, eventId, categoryId]);

  const handleCategoryChange = (v: string) => {
    setCategoryId(v);
    setModalityId("");
    setKitId("");
    setVariantSelections({});
    setCustomFieldValues({});
  };

  const handleKitChange = (v: string) => {
    setKitId(v);
    setVariantSelections({});
  };

  const handleSubmit = async () => {
    if (!registration || !categoryId?.trim()) {
      toast.error("Selecione a categoria.");
      return;
    }
    const kit = kits.find((k) => k.id === kitId);
    const variableProducts = (kit?.products || []).filter(
      (p) => p.type === "variable" && (p.variants?.length ?? 0) > 0
    );
    for (const product of variableProducts) {
      if (!variantSelections[product.id]?.trim()) {
        toast.error(`Selecione o tamanho/variante para "${product.name}".`);
        return;
      }
    }
    setSaving(true);
    try {
      const productSelections =
        Object.keys(variantSelections).length > 0
          ? Object.entries(variantSelections)
              .filter(([, variantId]) => variantId?.trim())
              .map(([product_id, variant_id]) => ({ product_id, variant_id }))
          : undefined;
      const response = await completeInvitation(registration.id, {
        category_id: categoryId,
        modality_id: modalityId || undefined,
        kit_id: kitId || undefined,
        product_selections: productSelections,
        custom_field_values: Object.keys(customFieldValues).length > 0 ? customFieldValues : undefined,
      });
      if (response.success) {
        toast.success("Convite completado com sucesso!");
        onSuccess?.();
        onOpenChange(false);
      } else {
        toast.error(response.error || "Erro ao completar convite.");
      }
    } catch (error: any) {
      const msg = error?.response?.data?.error || error.message || "Erro ao completar convite.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const modalityOptions = categoryId
    ? modalities.filter((m) =>
        categories.find((c) => c.id === categoryId)?.modality_ids?.includes(m.id)
      )
    : modalities;
  const selectedKit = kits.find((k) => k.id === kitId);
  const variableProducts = (selectedKit?.products || []).filter(
    (p) => p.type === "variable" && (p.variants?.length ?? 0) > 0
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Completar convite</DialogTitle>
          <DialogDescription>
            Escolha a categoria, modalidade e kit da sua inscrição. Se o kit tiver tamanho ou variante, selecione também.
          </DialogDescription>
        </DialogHeader>
        {registration && (
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-muted-foreground">Evento</Label>
              <p className="font-medium">{registration.event_title || "Evento"}</p>
            </div>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Categoria *</Label>
                  <Select value={categoryId || undefined} onValueChange={handleCategoryChange} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} - R$ {c.price.toFixed(2).replace(".", ",")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {categoryId && (() => {
                  const selectedCat = categories.find((c) => c.id === categoryId);
                  const customFields = selectedCat?.custom_fields ?? [];
                  if (customFields.length === 0) return null;
                  return (
                    <div className="space-y-3">
                      <Label className="text-sm font-medium">Campos extras</Label>
                      <div className="grid gap-2">
                        {customFields.map((f) => (
                          <div key={f.id} className="space-y-1.5">
                            <Label htmlFor={`inv-custom-${f.id}`} className="text-xs text-muted-foreground">
                              {f.label}
                            </Label>
                            <Input
                              id={`inv-custom-${f.id}`}
                              type={f.field_type === "number" ? "number" : "text"}
                              value={customFieldValues[f.id] ?? ""}
                              onChange={(e) =>
                                setCustomFieldValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                              }
                              placeholder={f.field_type === "number" ? "0" : ""}
                              className="max-w-xs"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="space-y-2">
                  <Label>Modalidade</Label>
                  <Select
                    value={modalityId || undefined}
                    onValueChange={setModalityId}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a modalidade (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {modalityOptions.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} {m.distance ? `- ${m.distance}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Kit</Label>
                  <Select value={kitId || undefined} onValueChange={handleKitChange} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o kit (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {kits.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.name} - R$ {k.price.toFixed(2).replace(".", ",")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {variableProducts.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <Label>Tamanho / variante</Label>
                    {variableProducts.map((product) => (
                      <div key={product.id} className="space-y-1">
                        <span className="text-sm text-muted-foreground">{product.name}</span>
                        <Select
                          value={variantSelections[product.id] || ""}
                          onValueChange={(v) =>
                            setVariantSelections((prev) => ({ ...prev, [product.id]: v }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {(product.variants || []).map((v) => (
                              <SelectItem key={v.id} value={v.id}>
                                {v.name}
                                {v.available_quantity != null && v.available_quantity <= 0
                                  ? " (Esgotada)"
                                  : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || saving || !categoryId?.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Concluir"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
