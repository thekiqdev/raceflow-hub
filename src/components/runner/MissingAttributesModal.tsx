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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  getRegistrationsWithMissingAttributes,
  completeRegistrationAttributes,
  type MissingAttributesRegistration,
} from "@/lib/api/registrations";
import { toast } from "sonner";

interface MissingAttributesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MissingAttributesModal({
  open,
  onOpenChange,
  onSuccess,
}: MissingAttributesModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registrations, setRegistrations] = useState<MissingAttributesRegistration[]>([]);
  const [selections, setSelections] = useState<{
    [registrationId: string]: {
      [productId: string]: {
        [attributeName: string]: string;
      };
    };
  }>({});

  useEffect(() => {
    if (open) {
      loadRegistrations();
    } else {
      // Reset state when modal closes
      setSelections({});
    }
  }, [open]);

  const loadRegistrations = async () => {
    try {
      setLoading(true);
      const response = await getRegistrationsWithMissingAttributes();
      if (response.success && response.data) {
        setRegistrations(response.data);
        // Initialize selections state
        const initialSelections: typeof selections = {};
        response.data.forEach((reg) => {
          initialSelections[reg.registration_id] = {};
          reg.products_with_missing_attributes.forEach((product) => {
            initialSelections[reg.registration_id][product.product_id] = {};
            product.variant_attributes.forEach((attrName) => {
              initialSelections[reg.registration_id][product.product_id][attrName] = "";
            });
          });
        });
        setSelections(initialSelections);
      }
    } catch (error: any) {
      console.error("Erro ao carregar inscrições:", error);
      toast.error("Erro ao carregar inscrições com atributos pendentes");
    } finally {
      setLoading(false);
    }
  };

  const handleAttributeChange = (
    registrationId: string,
    productId: string,
    attributeName: string,
    value: string
  ) => {
    setSelections((prev) => ({
      ...prev,
      [registrationId]: {
        ...prev[registrationId],
        [productId]: {
          ...prev[registrationId]?.[productId],
          [attributeName]: value,
        },
      },
    }));
  };

  const isRegistrationComplete = (registration: MissingAttributesRegistration): boolean => {
    const regSelections = selections[registration.registration_id] || {};
    return registration.products_with_missing_attributes.every((product) => {
      const productSelections = regSelections[product.product_id] || {};
      return product.variant_attributes.every(
        (attrName) => productSelections[attrName] && productSelections[attrName] !== ""
      );
    });
  };

  const isAllComplete = (): boolean => {
    return registrations.every((reg) => isRegistrationComplete(reg));
  };

  const handleSave = async () => {
    if (!isAllComplete()) {
      toast.error("Por favor, preencha todos os atributos obrigatórios");
      return;
    }

    try {
      setSaving(true);

      // Save selections for each registration
      for (const registration of registrations) {
        const regSelections = selections[registration.registration_id] || {};
        const productSelections = registration.products_with_missing_attributes.map((product) => {
          const productSelections = regSelections[product.product_id] || {};
          return {
            product_id: product.product_id,
            attribute_selections: productSelections,
          };
        });

        await completeRegistrationAttributes(registration.registration_id, {
          product_selections: productSelections,
        });
      }

      toast.success("Atributos salvos com sucesso!");
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      console.error("Erro ao salvar atributos:", error);
      toast.error(error.message || "Erro ao salvar seleções de atributos");
    } finally {
      setSaving(false);
    }
  };

  const getAvailableValues = (
    registration: MissingAttributesRegistration,
    productId: string,
    attributeName: string
  ): string[] => {
    const product = registration.products_with_missing_attributes.find(
      (p) => p.product_id === productId
    );
    if (!product) return [];

    const values = new Set<string>();
    product.available_variants.forEach((variant) => {
      if (variant.attribute_values[attributeName]) {
        values.add(variant.attribute_values[attributeName]);
      }
    });

    return Array.from(values).sort();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Selecionar Atributos Pendentes</DialogTitle>
          <DialogDescription>
            Complete a seleção de atributos para suas inscrições. Essas informações são necessárias
            para preparar seu kit corretamente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : registrations.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-600" />
            <p className="text-muted-foreground">
              Todas as suas inscrições já têm atributos selecionados!
            </p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {registrations.map((registration) => (
              <Card key={registration.registration_id}>
                <CardHeader>
                  <CardTitle className="text-lg">{registration.event_title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {registration.event_date &&
                      format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy", {
                        locale: ptBR,
                      })}
                  </p>
                  <p className="text-sm text-muted-foreground">Kit: {registration.kit_name}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {registration.products_with_missing_attributes.map((product) => (
                    <div key={product.product_id} className="space-y-3">
                      <div className="font-semibold text-base">{product.product_name}</div>
                      <div className="space-y-3 pl-4 border-l-2 border-muted">
                        {product.variant_attributes.map((attributeName) => {
                          const availableValues = getAvailableValues(
                            registration,
                            product.product_id,
                            attributeName
                          );
                          const currentValue =
                            selections[registration.registration_id]?.[product.product_id]?.[
                              attributeName
                            ] || "";

                          return (
                            <div key={attributeName} className="space-y-2">
                              <Label htmlFor={`${registration.registration_id}-${product.product_id}-${attributeName}`}>
                                {attributeName}
                              </Label>
                              <Select
                                value={currentValue}
                                onValueChange={(value) =>
                                  handleAttributeChange(
                                    registration.registration_id,
                                    product.product_id,
                                    attributeName,
                                    value
                                  )
                                }
                              >
                                <SelectTrigger
                                  id={`${registration.registration_id}-${product.product_id}-${attributeName}`}
                                >
                                  <SelectValue placeholder={`Selecione ${attributeName}`} />
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
                    </div>
                  ))}
                  {!isRegistrationComplete(registration) && (
                    <div className="flex items-center gap-2 text-sm text-yellow-600 mt-2">
                      <AlertCircle className="h-4 w-4" />
                      <span>Preencha todos os atributos para esta inscrição</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={loading || saving || registrations.length === 0 || !isAllComplete()}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Seleções"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
