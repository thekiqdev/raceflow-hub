import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  type Coupon,
  type CreateCouponData,
} from "@/lib/api/coupons";
import { CouponDialog } from "./CouponDialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getEvents, type Event } from "@/lib/api/events";
import { useAuth } from "@/contexts/AuthContext";

export function CouponsManagement() {
  const { user } = useAuth();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  useEffect(() => {
    loadCoupons();
    if (user) {
      loadEvents();
    }
  }, [user]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const response = await getCoupons();
      if (response.success && response.data) {
        setCoupons(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar cupons");
      }
    } catch (error) {
      console.error("Erro ao carregar cupons:", error);
      toast.error("Erro ao carregar cupons");
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    if (!user) return;
    
    try {
      const response = await getEvents({ organizer_id: user.id });
      if (response.success && response.data) {
        setEvents(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
    }
  };

  const getEventNames = (eventIds: string[] | null | undefined) => {
    if (!eventIds || eventIds.length === 0) {
      return "Todos os eventos";
    }
    if (eventIds.length === 1) {
      const event = events.find((e) => e.id === eventIds[0]);
      return event ? event.title : "Evento não encontrado";
    }
    return `${eventIds.length} eventos`;
  };

  const handleCreateCoupon = () => {
    setEditingCoupon(null);
    setDialogOpen(true);
  };

  const handleEditCoupon = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setDialogOpen(true);
  };

  const handleSaveCoupon = async (data: CreateCouponData) => {
    try {
      if (editingCoupon) {
        const response = await updateCoupon(editingCoupon.id, data);
        if (response.success) {
          toast.success("Cupom atualizado com sucesso!");
          loadCoupons();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao atualizar cupom");
        }
      } else {
        const response = await createCoupon(data);
        if (response.success) {
          toast.success("Cupom criado com sucesso!");
          loadCoupons();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao criar cupom");
        }
      }
    } catch (error: any) {
      console.error("Erro ao salvar cupom:", error);
      toast.error(error.message || "Erro ao salvar cupom");
    }
  };

  const handleDeleteCoupon = async (coupon: Coupon) => {
    if (!confirm(`Tem certeza que deseja deletar o cupom "${coupon.name}"?`)) {
      return;
    }

    try {
      const response = await deleteCoupon(coupon.id);
      if (response.success) {
        toast.success("Cupom deletado com sucesso!");
        loadCoupons();
      } else {
        toast.error(response.error || "Erro ao deletar cupom");
      }
    } catch (error: any) {
      console.error("Erro ao deletar cupom:", error);
      toast.error(error.message || "Erro ao deletar cupom");
    }
  };

  const handleToggleActive = async (coupon: Coupon) => {
    try {
      const response = await updateCoupon(coupon.id, {
        is_active: !coupon.is_active,
      });
      if (response.success) {
        toast.success(`Cupom ${!coupon.is_active ? "ativado" : "desativado"} com sucesso!`);
        loadCoupons();
      } else {
        toast.error(response.error || "Erro ao atualizar cupom");
      }
    } catch (error: any) {
      console.error("Erro ao atualizar cupom:", error);
      toast.error(error.message || "Erro ao atualizar cupom");
    }
  };

  const getStatusBadge = (coupon: Coupon) => {
    if (!coupon.is_active) {
      return <Badge variant="outline">Inativo</Badge>;
    }

    const now = new Date();
    if (coupon.expiration_date) {
      const expiration = new Date(coupon.expiration_date);
      if (now > expiration) {
        return <Badge variant="destructive">Expirado</Badge>;
      }
    }

    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
      return <Badge variant="secondary">Limite Atingido</Badge>;
    }

    return <Badge variant="default" className="bg-green-500">Ativo</Badge>;
  };

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.type === "percentage") {
      return `${coupon.discount_value}%`;
    }
    return `R$ ${coupon.discount_value.toFixed(2).replace(".", ",")}`;
  };

  const formatUses = (coupon: Coupon) => {
    if (coupon.max_uses === null) {
      return `${coupon.current_uses} / ∞`;
    }
    return `${coupon.current_uses} / ${coupon.max_uses}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Cupons de Desconto</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie os cupons de desconto para seus eventos
          </p>
        </div>
        <Button onClick={handleCreateCoupon}>
          <Plus className="mr-2 h-4 w-4" />
          Criar Cupom
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cupons</CardTitle>
          <CardDescription>
            {loading ? "Carregando..." : `${coupons.length} ${coupons.length === 1 ? "cupom encontrado" : "cupons encontrados"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Uso</TableHead>
                    <TableHead>Expiração</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Nenhum cupom encontrado. Crie seu primeiro cupom!
                      </TableCell>
                    </TableRow>
                  ) : (
                    coupons.map((coupon) => (
                      <TableRow key={coupon.id}>
                        <TableCell className="font-mono font-semibold">{coupon.code}</TableCell>
                        <TableCell>{coupon.name}</TableCell>
                        <TableCell>
                          {coupon.event_ids && coupon.event_ids.length > 0 ? (
                            <div className="space-y-1">
                              <span className="text-sm font-medium">
                                {getEventNames(coupon.event_ids)}
                              </span>
                              {coupon.event_ids.length > 1 && (
                                <div className="text-xs text-muted-foreground">
                                  {coupon.event_ids
                                    .map((id) => {
                                      const event = events.find((e) => e.id === id);
                                      return event ? event.title : "Evento não encontrado";
                                    })
                                    .join(", ")}
                                </div>
                              )}
                            </div>
                          ) : (
                            <Badge variant="secondary">Todos os eventos</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {coupon.type === "percentage" ? "Porcentagem" : "Valor Fixo"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-semibold">{formatDiscount(coupon)}</TableCell>
                        <TableCell>{formatUses(coupon)}</TableCell>
                        <TableCell>
                          {coupon.expiration_date
                            ? format(new Date(coupon.expiration_date), "dd/MM/yyyy", { locale: ptBR })
                            : "Sem expiração"}
                        </TableCell>
                        <TableCell>{getStatusBadge(coupon)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={coupon.is_active}
                              onCheckedChange={() => handleToggleActive(coupon)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditCoupon(coupon)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCoupon(coupon)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CouponDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coupon={editingCoupon}
        onSave={handleSaveCoupon}
      />
    </div>
  );
}

