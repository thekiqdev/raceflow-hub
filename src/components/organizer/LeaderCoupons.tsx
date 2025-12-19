import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  getLeaderCoupons,
  createLeaderCoupon,
  updateLeaderCoupon,
  deleteLeaderCoupon,
  type Coupon,
  type CreateCouponData,
} from "@/lib/api/coupons";
import { LeaderCouponDialog } from "./LeaderCouponDialog";

interface LeaderCouponsProps {
  leaderId: string;
  isAdmin?: boolean;
}

export function LeaderCoupons({ leaderId, isAdmin = false }: LeaderCouponsProps) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  useEffect(() => {
    if (leaderId) {
      loadCoupons();
    }
  }, [leaderId]);

  const loadCoupons = async () => {
    setLoading(true);
    try {
      const response = await getLeaderCoupons(leaderId, isAdmin);
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
        const response = await updateLeaderCoupon(leaderId, editingCoupon.id, data, isAdmin);
        if (response.success) {
          toast.success("Cupom atualizado com sucesso!");
          loadCoupons();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao atualizar cupom");
        }
      } else {
        const response = await createLeaderCoupon(leaderId, data, isAdmin);
        if (response.success) {
          toast.success("Cupom criado com sucesso!");
          loadCoupons();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao criar cupom");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar cupom");
    }
  };

  const handleDeleteCoupon = async (couponId: string) => {
    if (!confirm("Tem certeza que deseja remover este cupom?")) {
      return;
    }

    try {
      const response = await deleteLeaderCoupon(leaderId, couponId, isAdmin);
      if (response.success) {
        toast.success("Cupom removido com sucesso!");
        loadCoupons();
      } else {
        toast.error(response.error || "Erro ao remover cupom");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover cupom");
    }
  };

  const formatDiscount = (coupon: Coupon) => {
    if (coupon.type === "percentage") {
      return `${coupon.discount_value}%`;
    }
    const value = typeof coupon.discount_value === 'string' 
      ? parseFloat(coupon.discount_value) 
      : coupon.discount_value;
    return `R$ ${value.toFixed(2).replace(".", ",")}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Sem expiração";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Cupons Exclusivos</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie cupons de desconto exclusivos para este líder
          </p>
        </div>
        <Button onClick={handleCreateCoupon}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cupom
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : coupons.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhum cupom exclusivo criado para este líder.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Desconto</TableHead>
                  <TableHead>Eventos</TableHead>
                  <TableHead>Usos</TableHead>
                  <TableHead>Expiração</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coupons.map((coupon) => (
                  <TableRow key={coupon.id}>
                    <TableCell>
                      <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                        {coupon.code}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium">{coupon.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {coupon.type === "percentage" ? "Percentual" : "Fixo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatDiscount(coupon)}
                    </TableCell>
                    <TableCell>
                      {coupon.event_ids && coupon.event_ids.length > 0
                        ? `${coupon.event_ids.length} evento(s)`
                        : "Todos os eventos"}
                    </TableCell>
                    <TableCell>
                      {coupon.max_uses
                        ? `${coupon.current_uses}/${coupon.max_uses}`
                        : `${coupon.current_uses} (ilimitado)`}
                    </TableCell>
                    <TableCell>{formatDate(coupon.expiration_date)}</TableCell>
                    <TableCell>
                      <Badge variant={coupon.is_active ? "default" : "secondary"}>
                        {coupon.is_active ? (
                          <>
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Ativo
                          </>
                        ) : (
                          <>
                            <XCircle className="mr-1 h-3 w-3" />
                            Inativo
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditCoupon(coupon)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCoupon(coupon.id)}
                          title="Remover"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <LeaderCouponDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        coupon={editingCoupon}
        leaderId={leaderId}
        onSave={handleSaveCoupon}
      />
    </div>
  );
}



