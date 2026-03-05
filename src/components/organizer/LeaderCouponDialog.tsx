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
import { formatDateOnlyBrasilia } from "@/lib/utils";

interface LeaderCouponDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coupon: Coupon | null;
  leaderId: string;
  onSave: (data: CreateCouponData) => void;
  /** Quando true (visão admin), carrega todos os eventos do sistema para aplicar o cupom */
  isAdmin?: boolean;
}

export function LeaderCouponDialog({
  open,
  onOpenChange,
  coupon,
  leaderId,
  onSave,
  isAdmin = false,
}: LeaderCouponDialogProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
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
      setEventSearch("");
      if (coupon) {
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
  }, [open, coupon, user, isAdmin]);

  const loadEvents = async () => {
    if (!user) return;

    setLoadingEvents(true);
    try {
      // Admin: todos os eventos do sistema; organizador: apenas seus eventos
      const response = await getEvents(
        isAdmin ? undefined : { organizer_id: user.id }
      );
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
      const couponData: CreateCouponData = {
        event_ids: selectedEventIds.length > 0 ? selectedEventIds : null,
        code: code.toUpperCase().trim(),
        name: name.trim(),
        type,
        discount_value: discount,
        expiration_date: expirationDate ? new Date(expirationDate).toISOString() : null,
        max_uses: maxUses ? parseInt(maxUses) : null,
        is_active: isActive,
      };

      await onSave(couponData);
    } finally {
      setSaving(false);
    }
  };

  const toggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  };

  const searchLower = eventSearch.trim().toLowerCase();
  const filteredEvents =
    searchLower === ""
      ? events
      : events.filter(
          (e) =>
            e.title?.toLowerCase().includes(searchLower) ||
            e.city?.toLowerCase().includes(searchLower) ||
            (e.event_date &&
              new Date(e.event_date).toLocaleDateString("pt-BR").includes(searchLower))
        );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{coupon ? "Editar Cupom" : "Criar Cupom Exclusivo para Líder"}</DialogTitle>
          <DialogDescription>
            {coupon
              ? "Atualize as informações do cupom exclusivo"
              : "Crie um cupom de desconto exclusivo para este líder divulgar"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Código do Cupom *</Label>
              <Input
                id="code"
                placeholder="EXEMPLO123"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={!!coupon}
              />
              <p className="text-xs text-muted-foreground">
                Código único que será usado para aplicar o desconto
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome do Cupom *</Label>
              <Input
                id="name"
                placeholder="Desconto Especial"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Tipo de Desconto *</Label>
              <Select value={type} onValueChange={(value) => setType(value as CouponType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual (%)</SelectItem>
                  <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount_value">
                Valor do Desconto * {type === "percentage" ? "(%)" : "(R$)"}
              </Label>
              <Input
                id="discount_value"
                type="number"
                min="0"
                max={type === "percentage" ? "100" : undefined}
                step={type === "percentage" ? "0.01" : "0.01"}
                placeholder={type === "percentage" ? "10" : "50.00"}
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expiration_date">Data de Expiração</Label>
              <Input
                id="expiration_date"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="max_uses">Limite de Usos</Label>
              <Input
                id="max_uses"
                type="number"
                min="1"
                placeholder="Ilimitado"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Eventos Aplicáveis</Label>
            {events.length > 0 && (
              <Input
                placeholder="Buscar por título, cidade ou data..."
                value={eventSearch}
                onChange={(e) => setEventSearch(e.target.value)}
                className="max-w-sm"
              />
            )}
            {loadingEvents ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <div className="border rounded-md p-4 max-h-48 overflow-y-auto">
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento disponível</p>
                ) : filteredEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum evento encontrado com &quot;{eventSearch}&quot;</p>
                ) : (
                  <div className="space-y-2">
                    {filteredEvents.map((event) => (
                      <div key={event.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`event-${event.id}`}
                          checked={selectedEventIds.includes(event.id)}
                          onCheckedChange={() => toggleEvent(event.id)}
                        />
                        <label
                          htmlFor={`event-${event.id}`}
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                        >
                          {event.title} - {formatDateOnlyBrasilia(event.event_date)}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {isAdmin
                ? "Selecione os eventos onde este cupom poderá ser usado (qualquer evento do sistema)."
                : "Selecione os eventos onde este cupom poderá ser usado. Deixe vazio para aplicar a todos os eventos."}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="is_active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
            <Label htmlFor="is_active" className="cursor-pointer">
              Cupom ativo
            </Label>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Nota:</strong> Este cupom é exclusivo para o líder. O líder pode compartilhar o código com qualquer pessoa que desejar. Não há restrição de referência.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !code || !name || !discountValue}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              coupon ? "Salvar" : "Criar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

