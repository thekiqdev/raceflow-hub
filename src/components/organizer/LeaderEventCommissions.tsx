import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Loader2, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  getLeaderEventCommissions,
  createLeaderEventCommission,
  updateLeaderEventCommission,
  deleteLeaderEventCommission,
  type LeaderEventCommission,
} from "@/lib/api/leaderEventCommissions";
import { EventCommissionDialog } from "./EventCommissionDialog";
import { getEvents, type Event } from "@/lib/api/events";
import { useAuth } from "@/contexts/AuthContext";
import { getOrganizerGroupLeaderById, getGroupLeaderById, type GroupLeader } from "@/lib/api/groupLeaders";
import { formatDateOnlyBrasilia } from "@/lib/utils";

interface LeaderEventCommissionsProps {
  leaderId: string;
  isAdmin?: boolean;
}

export function LeaderEventCommissions({ leaderId, isAdmin = false }: LeaderEventCommissionsProps) {
  const { user } = useAuth();
  const [commissions, setCommissions] = useState<LeaderEventCommission[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [leader, setLeader] = useState<GroupLeader | null>(null);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCommission, setEditingCommission] = useState<LeaderEventCommission | null>(null);

  useEffect(() => {
    if (leaderId) {
      loadCommissions();
      loadEvents();
      loadLeader();
    }
  }, [leaderId, isAdmin]);

  const loadLeader = async () => {
    try {
      const { getGroupLeaderById, getOrganizerGroupLeaderById } = await import("@/lib/api/groupLeaders");
      const response = isAdmin 
        ? await getGroupLeaderById(leaderId)
        : await getOrganizerGroupLeaderById(leaderId);
      if (response.success && response.data) {
        setLeader(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar líder:", error);
    }
  };

  const loadCommissions = async () => {
    setLoading(true);
    try {
      const response = await getLeaderEventCommissions(leaderId, isAdmin);
      if (response.success && response.data) {
        setCommissions(response.data);
      } else {
        toast.error(response.error || "Erro ao carregar comissões");
      }
    } catch (error) {
      console.error("Erro ao carregar comissões:", error);
      toast.error("Erro ao carregar comissões");
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      // Se for admin, carregar todos os eventos. Se for organizador, filtrar por organizer_id
      const filters = isAdmin ? {} : (user ? { organizer_id: user.id } : {});
      const response = await getEvents(filters);
      if (response.success && response.data) {
        setEvents(response.data);
      }
    } catch (error) {
      console.error("Erro ao carregar eventos:", error);
    }
  };

  const handleCreateCommission = () => {
    setEditingCommission(null);
    setDialogOpen(true);
  };

  const handleEditCommission = (commission: LeaderEventCommission) => {
    setEditingCommission(commission);
    setDialogOpen(true);
  };

  const handleSaveCommission = async (data: { 
    event_id: string; 
    commission_percentage?: number;
    bonus_type: 'commission' | 'invitation' | 'both';
    required_purchases?: number | null;
    name?: string | null;
    coupon_discount?: number;
  }) => {
    try {
      if (editingCommission) {
        const response = await updateLeaderEventCommission(
          leaderId,
          editingCommission.id,
          {
            commission_percentage: data.commission_percentage,
            bonus_type: data.bonus_type,
            required_purchases: data.required_purchases,
            name: data.name,
            coupon_discount: data.coupon_discount, // Include coupon discount
          },
          isAdmin
        );
        if (response.success) {
          toast.success("Comissão atualizada com sucesso!");
          loadCommissions();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao atualizar comissão");
        }
      } else {
        const response = await createLeaderEventCommission(leaderId, data, isAdmin);
        if (response.success) {
          toast.success("Comissão criada com sucesso!");
          loadCommissions();
          setDialogOpen(false);
        } else {
          toast.error(response.error || "Erro ao criar comissão");
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao salvar comissão");
    }
  };

  const handleDeleteCommission = async (commissionId: string) => {
    if (!confirm("Tem certeza que deseja remover esta comissão?")) {
      return;
    }

    try {
      const response = await deleteLeaderEventCommission(leaderId, commissionId, isAdmin);
      if (response.success) {
        toast.success("Comissão removida com sucesso!");
        loadCommissions();
      } else {
        toast.error(response.error || "Erro ao remover comissão");
      }
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover comissão");
    }
  };

  // Permitir todos os eventos - múltiplas comissões por evento são permitidas
  // (pode ter uma comissão percentual e uma comissão de convite, ou múltiplas de cada tipo)
  const availableEvents = events;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Comissões por Evento</h3>
          <p className="text-sm text-muted-foreground">
            Defina comissões personalizadas para eventos específicos
          </p>
        </div>
        <Button onClick={handleCreateCommission} disabled={availableEvents.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Comissão
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : commissions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma comissão por evento configurada. Configure uma comissão para este evento para que o líder receba comissões.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Valor/Meta</TableHead>
                  <TableHead>Link de Referência</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.map((commission) => {
                  const event = events.find((e) => e.id === commission.event_id);
                  return (
                    <TableRow key={commission.id}>
                      <TableCell className="font-medium">
                        <div>
                          <div>{commission.event_title || event?.title || "N/A"}</div>
                          {commission.name && (
                            <div className="text-xs text-muted-foreground">{commission.name}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {commission.event_date
                          ? formatDateOnlyBrasilia(commission.event_date)
                          : event?.event_date
                          ? formatDateOnlyBrasilia(event.event_date)
                          : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          commission.bonus_type === 'commission' ? 'default' : 
                          commission.bonus_type === 'both' ? 'default' : 
                          'secondary'
                        }>
                          {commission.bonus_type === 'commission' ? 'Comissão' : 
                           commission.bonus_type === 'both' ? 'Ambos' : 
                           'Convite'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {commission.bonus_type === 'commission' ? (
                          `${commission.commission_percentage}%`
                        ) : commission.bonus_type === 'both' ? (
                          <div className="text-sm">
                            <div>{commission.commission_percentage}% comissão</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {commission.required_purchases} compras = 1 grátis
                            </div>
                            {commission.bonus_earned_at ? (
                              <div className="text-xs text-green-600 mt-1">✓ Convite concedido</div>
                            ) : (
                              <div className="text-xs text-muted-foreground mt-1">Convite pendente</div>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm">
                            <div>{commission.required_purchases} compras</div>
                            {commission.bonus_earned_at ? (
                              <div className="text-xs text-green-600">✓ Concedido</div>
                            ) : (
                              <div className="text-xs text-muted-foreground">Pendente</div>
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {commission.coupon?.link ? (
                          <div className="flex items-center gap-2">
                            <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate max-w-[200px]">
                              {commission.coupon.link}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                navigator.clipboard.writeText(commission.coupon!.link);
                                toast.success("Link copiado!");
                              }}
                              title="Copiar link"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => window.open(commission.coupon!.link, '_blank')}
                              title="Abrir link"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sem link</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditCommission(commission)}
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteCommission(commission.id)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <EventCommissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        commission={editingCommission}
        leaderId={leaderId}
        availableEvents={availableEvents}
        onSave={handleSaveCommission}
      />
    </div>
  );
}

