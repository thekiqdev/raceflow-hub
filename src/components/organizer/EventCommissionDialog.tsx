import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { type LeaderEventCommission } from "@/lib/api/leaderEventCommissions";
import { type Event } from "@/lib/api/events";

interface EventCommissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commission: LeaderEventCommission | null;
  leaderId: string;
  availableEvents: Event[];
  onSave: (data: { 
    event_id: string; 
    commission_percentage?: number;
    bonus_type: 'commission' | 'invitation' | 'both';
    required_purchases?: number | null;
    name?: string | null;
    coupon_discount?: number;
  }) => void;
}

export function EventCommissionDialog({
  open,
  onOpenChange,
  commission,
  leaderId,
  availableEvents,
  onSave,
}: EventCommissionDialogProps) {
  const [eventId, setEventId] = useState("");
  const [bonusType, setBonusType] = useState<'commission' | 'invitation' | 'both'>('commission');
  const [commissionPercentage, setCommissionPercentage] = useState<string>("");
  const [requiredPurchases, setRequiredPurchases] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [couponDiscount, setCouponDiscount] = useState<string>("10");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (commission) {
        setEventId(commission.event_id);
        setBonusType(commission.bonus_type);
        setCommissionPercentage(commission.commission_percentage.toString());
        setRequiredPurchases(commission.required_purchases?.toString() || "");
        setName(commission.name || "");
        // Load coupon discount from existing coupon if available
        // Try to get from commission.coupon first, then from commission.stats or default to 10
        const discountValue = commission.coupon?.discount_value 
          ? commission.coupon.discount_value.toString()
          : "10"; // Default fallback
        setCouponDiscount(discountValue);
      } else {
        setEventId("");
        setBonusType('commission');
        setCommissionPercentage("");
        setRequiredPurchases("");
        setName("");
        setCouponDiscount("10"); // Default 10%
      }
    }
  }, [open, commission]);

  const handleSave = async () => {
    if (!eventId) {
      return;
    }

    // Validate based on bonus type
    if (bonusType === 'commission' || bonusType === 'both') {
      if (!commissionPercentage) {
        return;
      }
      const percentage = parseFloat(commissionPercentage);
      if (isNaN(percentage) || percentage < 0 || percentage > 100) {
        return;
      }
    }
    
    if (bonusType === 'invitation' || bonusType === 'both') {
      if (!requiredPurchases) {
        return;
      }
      const purchases = parseInt(requiredPurchases);
      if (isNaN(purchases) || purchases <= 0) {
        return;
      }
    }

    // Validate coupon discount
    const discount = parseFloat(couponDiscount);
    if (isNaN(discount) || discount < 0 || discount > 100) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        event_id: eventId,
        commission_percentage: (bonusType === 'commission' || bonusType === 'both') ? parseFloat(commissionPercentage) : undefined,
        bonus_type: bonusType,
        required_purchases: (bonusType === 'invitation' || bonusType === 'both') ? parseInt(requiredPurchases) : null,
        name: name || null,
        coupon_discount: discount,
      });
    } finally {
      setSaving(false);
    }
  };

  const selectedEvent = availableEvents.find((e) => e.id === eventId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>{commission ? "Editar Comissão" : "Criar Comissão por Evento"}</DialogTitle>
          <DialogDescription>
            {commission
              ? "Atualize a comissão específica para este evento"
              : "Defina uma comissão personalizada para este líder em um evento específico"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Comissão/Bônus</Label>
            <Input
              id="name"
              type="text"
              placeholder="Ex: Comissão Padrão, Bônus 10 Compradores"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
            />
            <p className="text-xs text-muted-foreground">
              Nome descritivo para identificar esta comissão ou bônus
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="event_id">Evento *</Label>
            <Select
              value={eventId}
              onValueChange={setEventId}
              disabled={!!commission} // Não permite alterar evento ao editar (mas pode criar múltiplas comissões para o mesmo evento)
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um evento" />
              </SelectTrigger>
              <SelectContent>
                {availableEvents.length === 0 ? (
                  <SelectItem value="no-events" disabled>
                    Nenhum evento disponível
                  </SelectItem>
                ) : (
                  availableEvents.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} - {new Date(event.event_date).toLocaleDateString("pt-BR")}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {selectedEvent && (
              <p className="text-xs text-muted-foreground">
                {selectedEvent.location}, {selectedEvent.city} - {selectedEvent.state}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bonus_type">Tipo de Bônus *</Label>
            <Select
              value={bonusType}
              onValueChange={(value) => setBonusType(value as 'commission' | 'invitation' | 'both')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="commission">Comissão (Percentual sobre vendas)</SelectItem>
                <SelectItem value="invitation">Convite (Inscrição grátis ao atingir meta)</SelectItem>
                <SelectItem value="both">Ambos (Comissão + Convites)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Escolha entre comissão percentual, bônus de inscrição grátis, ou ambos
            </p>
          </div>

          {(bonusType === 'commission' || bonusType === 'both') && (
            <div className="space-y-2">
              <Label htmlFor="commission_percentage">
                Percentual de Comissão (%) *
              </Label>
              <Input
                id="commission_percentage"
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Ex: 10.5"
                value={commissionPercentage}
                onChange={(e) => setCommissionPercentage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Percentual de comissão que o líder receberá para este evento específico (0-100%)
              </p>
            </div>
          )}

          {(bonusType === 'invitation' || bonusType === 'both') && (
            <div className="space-y-2">
              <Label htmlFor="required_purchases">
                Número de Compras Necessárias *
              </Label>
              <Input
                id="required_purchases"
                type="number"
                min="1"
                step="1"
                placeholder="Ex: 10"
                value={requiredPurchases}
                onChange={(e) => setRequiredPurchases(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Ao atingir este número de pessoas que compraram, o líder ganhará 1 inscrição grátis neste evento
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="coupon_discount">
              Desconto do Cupom (%) *
            </Label>
            <Input
              id="coupon_discount"
              type="number"
              min="0"
              max="100"
              step="0.01"
              placeholder="Ex: 10"
              value={couponDiscount}
              onChange={(e) => setCouponDiscount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Percentual de desconto que será aplicado no cupom gerado automaticamente para este líder e evento
            </p>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !eventId || !couponDiscount || ((bonusType === 'commission' || bonusType === 'both') && !commissionPercentage) || ((bonusType === 'invitation' || bonusType === 'both') && !requiredPurchases)}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              commission ? "Salvar" : "Criar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


