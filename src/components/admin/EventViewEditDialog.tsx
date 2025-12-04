import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getEventById, updateEvent } from "@/lib/api/events";
import { getRegistrations } from "@/lib/api/registrations";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MapPin, Calendar, Users, DollarSign } from "lucide-react";

interface EventViewEditDialogProps {
  eventId: string | null;
  mode: "view" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EventViewEditDialog({
  eventId,
  mode: initialMode,
  open,
  onOpenChange,
  onSuccess,
}: EventViewEditDialogProps) {
  const [mode, setMode] = useState(initialMode);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const [event, setEvent] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [kits, setKits] = useState<any[]>([]);
  const [registrations, setRegistrations] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    event_date: "",
    location: "",
    city: "",
    state: "",
    status: "draft" as "draft" | "published" | "ongoing" | "finished" | "cancelled",
    banner_url: "",
    regulation_url: "",
  });

  useEffect(() => {
    if (open && eventId) {
      loadEventData();
    }
  }, [open, eventId]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const loadEventData = async () => {
    if (!eventId) return;

    setLoading(true);
    try {
      // Get event data
      const eventResponse = await getEventById(eventId);
      
      if (!eventResponse.success || !eventResponse.data) {
        throw new Error("Erro ao carregar evento");
      }

      const eventData = eventResponse.data;
      setEvent(eventData);
      setFormData({
        title: eventData.title || "",
        description: eventData.description || "",
        event_date: eventData.event_date || "",
        location: eventData.location || "",
        city: eventData.city || "",
        state: eventData.state || "",
        status: eventData.status || "draft",
        banner_url: eventData.banner_url || "",
        regulation_url: eventData.regulation_url || "",
      });

      // Get registrations
      const registrationsResponse = await getRegistrations({ event_id: eventId });
      
      if (registrationsResponse.success && registrationsResponse.data) {
        // Transform API response to match expected format
        const regs = registrationsResponse.data.map((reg: any) => ({
          id: reg.id,
          event_id: reg.event_id,
          runner_id: reg.runner_id,
          total_amount: reg.total_amount,
          payment_status: reg.payment_status,
          created_at: reg.created_at,
          profiles: reg.runner_name ? {
            full_name: reg.runner_name,
          } : undefined,
        }));
        setRegistrations(regs);
      } else {
        setRegistrations([]);
      }

      // TODO: Implement API endpoints for event categories and kits
      // For now, set empty arrays
      setCategories([]);
      setKits([]);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar evento",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!eventId) return;

    setSaving(true);
    try {
      const response = await updateEvent(eventId, formData);

      if (!response.success) {
        throw new Error(response.error || "Erro ao atualizar evento");
      }

      toast({
        title: "Evento atualizado",
        description: "As alterações foram salvas com sucesso.",
      });

      setMode("view");
      onSuccess?.();
      loadEventData();
    } catch (error: any) {
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: any = {
      draft: "secondary",
      published: "default",
      ongoing: "default",
      finished: "outline",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "secondary"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>
              {mode === "view" ? "Visualizar Evento" : "Editar Evento"}
            </DialogTitle>
            <div className="flex gap-2">
              {mode === "view" ? (
                <Button onClick={() => setMode("edit")}>Editar</Button>
              ) : (
                <>
                  <Button variant="outline" onClick={() => setMode("view")}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSave} disabled={saving}>
                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Salvar
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="categories">Modalidades</TabsTrigger>
            <TabsTrigger value="kits">Kits</TabsTrigger>
            <TabsTrigger value="registrations">Inscrições</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="title">Título</Label>
                {mode === "view" ? (
                  <p className="text-sm">{formData.title}</p>
                ) : (
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                )}
              </div>

              <div className="grid gap-2">
                <Label htmlFor="description">Descrição</Label>
                {mode === "view" ? (
                  <p className="text-sm">{formData.description || "Sem descrição"}</p>
                ) : (
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="event_date">Data</Label>
                  {mode === "view" ? (
                    <p className="text-sm flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {new Date(formData.event_date).toLocaleDateString("pt-BR")}
                    </p>
                  ) : (
                    <Input
                      id="event_date"
                      type="date"
                      value={formData.event_date}
                      onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="status">Status</Label>
                  {mode === "view" ? (
                    <div>{getStatusBadge(formData.status)}</div>
                  ) : (
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Rascunho</SelectItem>
                        <SelectItem value="published">Publicado</SelectItem>
                        <SelectItem value="ongoing">Em andamento</SelectItem>
                        <SelectItem value="finished">Finalizado</SelectItem>
                        <SelectItem value="cancelled">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">Local</Label>
                {mode === "view" ? (
                  <p className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    {formData.location}
                  </p>
                ) : (
                  <Input
                    id="location"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="city">Cidade</Label>
                  {mode === "view" ? (
                    <p className="text-sm">{formData.city}</p>
                  ) : (
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="state">Estado</Label>
                  {mode === "view" ? (
                    <p className="text-sm">{formData.state}</p>
                  ) : (
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    />
                  )}
                </div>
              </div>

              {event?.organizer_name && (
                <div className="grid gap-2">
                  <Label>Organizador</Label>
                  <p className="text-sm">{event.organizer_name}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <div className="grid gap-4">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma modalidade cadastrada</p>
              ) : (
                categories.map((category) => (
                  <Card key={category.id}>
                    <CardHeader>
                      <CardTitle className="text-base">{category.name}</CardTitle>
                      <CardDescription>Distância: {category.distance}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4" />
                          <span className="text-sm">R$ {Number(category.price).toFixed(2)}</span>
                        </div>
                        {category.max_participants && (
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            <span className="text-sm">Máx: {category.max_participants}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="kits" className="space-y-4">
            <div className="grid gap-4">
              {kits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum kit cadastrado</p>
              ) : (
                kits.map((kit) => (
                  <Card key={kit.id}>
                    <CardHeader>
                      <CardTitle className="text-base">{kit.name}</CardTitle>
                      {kit.description && (
                        <CardDescription>{kit.description}</CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-sm">R$ {Number(kit.price).toFixed(2)}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="registrations" className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Total: {registrations.length} inscrições
                </h3>
              </div>
              {registrations.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma inscrição</p>
              ) : (
                <div className="space-y-2">
                  {registrations.map((reg) => (
                    <Card key={reg.id}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{reg.profiles?.full_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(reg.created_at).toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">R$ {Number(reg.total_amount).toFixed(2)}</p>
                            <Badge variant={reg.payment_status === "paid" ? "default" : "secondary"}>
                              {reg.payment_status}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
