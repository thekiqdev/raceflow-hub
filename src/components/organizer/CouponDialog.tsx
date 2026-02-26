import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { type Coupon, type CreateCouponData, type CouponType } from "@/lib/api/coupons";
import { getEvents, type Event } from "@/lib/api/events";
import { useAuth } from "@/contexts/AuthContext";

interface CouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: Coupon | null;
  onSave: (data: CreateCouponData) => void;
}

export function CouponDialog({
  open,
  onOpenChange,
  coupon,
  onSave,
}: CouponDialogProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<CouponType>("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadEvents();
      if (coupon) {
        // Use event_ids if available, otherwise fallback to event_id for backward compatibility
        setSelectedEventIds(coupon.event_ids || (coupon.event_id ? [coupon.event_id] : []));
        setCode(coupon.code);
        setName(coupon.name);
        setType(coupon.type);
        setDiscountValue(coupon.discount_value.toString());
        setExpirationDate(
          coupon.expiration_date
            ? new Date(coupon.expiration_date).toISOString().split("T")[0]
            : ""
        );
        setMaxUses(coupon.max_uses !== null ? coupon.max_uses.toString() : "");
        setIsActive(coupon.is_active);
      } else {
        setSelectedEventIds([]);
        setCode("");
        setName("");
        setType("percentage");
        setDiscountValue("");
        setExpirationDate("");
        setMaxUses("");
        setIsActive(true);
      }
    }
  }, [open, coupon, user]);

  const loadEvents = async () => {
    if (!user) return;
    
    setLoadingEvents(true);
    try {
      const response = await getEvents({ organizer_id: user.id });
      if (response.success && response.data) {
        setEvents(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
    } finally {
      setLoadingEvents(false);
    }
  };

  const handleSave = async () => {
    if (!code.trim() || !name.trim() || !discountValue) {
      return;
    }

    const discount = parseFloat(discountValue);
    if (isNaN(discount) || discount <= 0) {
      return;
    }

    if (type === "percentage" && discount > 100) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        event_ids: selectedEventIds.length > 0 ? selectedEventIds : null,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        discount_value: discount,
        expiration_date: expirationDate ? new Date(expirationDate).toISOString() : null,
        max_uses: maxUses ? parseInt(maxUses) : null,
        is_active: isActive,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEventToggle = (eventId: string) => {
    setSelectedEventIds((prev) => {
      if (prev.includes(eventId)) {
        return prev.filter((id) => id !== eventId);
      } else {
        return [...prev, eventId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedEventIds.length === events.length) {
      setSelectedEventIds([]);
    } else {
      setSelectedEventIds(events.map((e) => e.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{coupon ? "Editar Cupom" : "Criar Novo Cupom"}</DialogTitle>
          <DialogDescription>
            {coupon
              ? "Atualize as informações do cupom"
              : "Preencha os dados para criar um novo cupom de desconto"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="event_ids">Eventos</Label>
              {events.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  className="h-auto py-1 text-xs"
                >
                  {selectedEventIds.length === events.length ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              )}
            </div>
            {loadingEvents ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando eventos...
              </div>
            ) : events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum evento disponível. Crie eventos primeiro.
              </p>
            ) : (
              <div className="border rounded-md p-4 max-h-48 overflow-y-auto space-y-2">
                {events.map((event) => (
                  <div key={event.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`event-${event.id}`}
                      checked={selectedEventIds.includes(event.id)}
                      onCheckedChange={() => handleEventToggle(event.id)}
                    />
                    <Label
                      htmlFor={`event-${event.id}`}
                      className="text-sm font-normal cursor-pointer flex-1"
                    >
                      {event.title}
                    </Label>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Selecione os eventos aos quais o cupom se aplica. Deixe desmarcado para aplicar a todos os eventos.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Código do Cupom *</Label>
            <Input
              id="code"
              placeholder="Ex: DESCONTO10"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              disabled={!!coupon} // Não permite alterar código ao editar
            />
            {coupon && (
              <p className="text-xs text-muted-foreground">
                O código do cupom não pode ser alterado após a criação
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Nome do Cupom *</Label>
            <Input
              id="name"
              placeholder="Ex: Desconto de 10%"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Tipo *</Label>
            <Select value={type} onValueChange={(value) => setType(value as CouponType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="percentage">Porcentagem</SelectItem>
                <SelectItem value="fixed">Valor Fixo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="discount_value">
              Valor do Desconto * {type === "percentage" && "(0-100%)"}
            </Label>
            <Input
              id="discount_value"
              type="number"
              placeholder={type === "percentage" ? "Ex: 10" : "Ex: 50.00"}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              min="0"
              max={type === "percentage" ? "100" : undefined}
              step={type === "percentage" ? "1" : "0.01"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="expiration_date">Data de Expiração</Label>
            <Input
              id="expiration_date"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para cupom sem expiração
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_uses">Quantidade de Uso</Label>
            <Input
              id="max_uses"
              type="number"
              placeholder="Ex: 100"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              min="1"
            />
            <p className="text-xs text-muted-foreground">
              Deixe em branco para uso infinito
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Ativo</Label>
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !code.trim() || !name.trim() || !discountValue}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

