import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { KitProduct } from "@/lib/api/eventKits";

const DEFAULT_EMPTY_MESSAGE =
  "Nenhum produto com variações encontrado neste kit.";

export interface KitVariableProductSelectorsProps {
  kitProducts: KitProduct[];
  value: Record<string, Record<string, string>>;
  onChange: (productId: string, attrName: string, attrValue: string) => void;
  disabled?: boolean;
  /** Produtos variáveis que ainda não têm todos os atributos obrigatórios preenchidos. */
  highlightIncompleteProductIds?: string[];
  /** Central de inscrições: limpa atributos de um produto (comportamento existente). */
  onRemoveProductAttributes?: (productId: string) => void;
  /** Texto quando o kit não tem produtos variáveis. */
  emptyMessage?: string;
  className?: string;
}

export function KitVariableProductSelectors({
  kitProducts,
  value,
  onChange,
  disabled,
  highlightIncompleteProductIds,
  onRemoveProductAttributes,
  emptyMessage = DEFAULT_EMPTY_MESSAGE,
  className,
}: KitVariableProductSelectorsProps) {
  const variableProducts = kitProducts.filter((p) => {
    if (p.type !== "variable") return false;
    const attrs = p.variant_attributes;
    return Array.isArray(attrs) && attrs.length > 0;
  });

  if (variableProducts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-3 rounded-md border border-dashed bg-muted/20">
        {emptyMessage}
      </p>
    );
  }

  const incompleteSet = new Set(highlightIncompleteProductIds ?? []);

  return (
    <div className={cn("space-y-4", className)}>
      {variableProducts.map((product) => {
        const currentAttributes = value[product.id] || {};
        const attributeNames = product.variant_attributes || [];
        const allFilled = attributeNames.every((a) => currentAttributes[a]?.trim());
        const needsAttention = incompleteSet.has(product.id) || !allFilled;
        const hasSelectedAttributes =
          Object.keys(currentAttributes).length > 0 &&
          attributeNames.some((attr) => currentAttributes[attr]);

        return (
          <div
            key={product.id}
            className={cn(
              "rounded-lg border p-3 space-y-3 bg-card/50",
              needsAttention && "border-amber-500/60 ring-1 ring-amber-500/30"
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <h4 className="font-semibold text-sm leading-tight">{product.name}</h4>
              {onRemoveProductAttributes && hasSelectedAttributes ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRemoveProductAttributes(product.id)}
                  disabled={disabled}
                  className="shrink-0 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remover atributos
                </Button>
              ) : null}
            </div>
            <div className="space-y-2.5">
              {attributeNames.map((attrName) => {
                const availableValues = new Set<string>();
                if (product.variants) {
                  for (const variant of product.variants) {
                    const variantValues = variant.name.split(" - ").map((v) => v.trim());
                    const attrIndex = attributeNames.indexOf(attrName);
                    if (attrIndex >= 0 && attrIndex < variantValues.length) {
                      availableValues.add(variantValues[attrIndex]);
                    }
                  }
                }

                return (
                  <div key={attrName} className="space-y-1">
                    <Label className="text-xs font-normal text-muted-foreground">{attrName}</Label>
                    <Select
                      value={currentAttributes[attrName] || ""}
                      onValueChange={(v) => onChange(product.id, attrName, v)}
                      disabled={disabled}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={`Selecione ${attrName}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(availableValues).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
