import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, MapPin, QrCode, ChevronRight, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Registration {
  id: string;
  event_id: string;
  event_title: string;
  event_date: string;
  location: string;
  category: string;
  bib_number: string | null;
  status: "pending" | "confirmed" | "cancelled";
  payment_status: "pending" | "paid";
  total_amount: number;
}

export function MyRegistrations() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferCpf, setTransferCpf] = useState("");
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  useEffect(() => {
    loadRegistrations();
  }, []);

  const loadRegistrations = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("registrations")
        .select(`
          id,
          event_id,
          total_amount,
          status,
          payment_status,
          event:events(title, event_date, city, state),
          category:event_categories(name)
        `)
        .eq("runner_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedRegistrations: Registration[] = (data || []).map((reg: any) => ({
        id: reg.id,
        event_id: reg.event_id,
        event_title: reg.event.title,
        event_date: reg.event.event_date,
        location: `${reg.event.city} - ${reg.event.state}`,
        category: reg.category.name,
        bib_number: null,
        status: reg.status,
        payment_status: reg.payment_status,
        total_amount: reg.total_amount,
      }));

      setRegistrations(formattedRegistrations);
    } catch (error) {
      console.error("Error loading registrations:", error);
    }
  };

  const handleTransfer = async () => {
    if (!transferCpf.trim() || !selectedRegistration) {
      toast({
        title: "Erro",
        description: "Por favor, informe o CPF do novo titular",
        variant: "destructive",
      });
      return;
    }

    setIsTransferring(true);
    try {
      // Validate CPF and get user
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("cpf", transferCpf.trim())
        .maybeSingle();

      if (profileError) throw profileError;

      if (!profile) {
        toast({
          title: "CPF não encontrado",
          description: "Não foi encontrado um usuário com este CPF",
          variant: "destructive",
        });
        setIsTransferring(false);
        return;
      }

      // Update registration
      const { error: updateError } = await supabase
        .from("registrations")
        .update({ runner_id: profile.id })
        .eq("id", selectedRegistration.id);

      if (updateError) throw updateError;

      toast({
        title: "Transferência realizada",
        description: "A inscrição foi transferida com sucesso",
      });

      setIsTransferDialogOpen(false);
      setTransferCpf("");
      setSelectedRegistration(null);
      loadRegistrations();
    } catch (error: any) {
      toast({
        title: "Erro ao transferir inscrição",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsTransferring(false);
    }
  };

  const activeRegistrations = registrations.filter((r) => r.status === "confirmed" && r.payment_status === "paid");
  const pendingRegistrations = registrations.filter((r) => r.status === "pending" || r.payment_status === "pending");
  const cancelledRegistrations = registrations.filter((r) => r.status === "cancelled");

  const getStatusBadge = (status: string, paymentStatus: string) => {
    if (status === "confirmed" && paymentStatus === "paid") {
      return <Badge className="bg-accent">Confirmada</Badge>;
    }
    if (status === "pending" || paymentStatus === "pending") {
      return <Badge variant="secondary">Pendente</Badge>;
    }
    if (status === "cancelled") {
      return <Badge variant="destructive">Cancelada</Badge>;
    }
    return null;
  };

  const RegistrationCard = ({ registration }: { registration: Registration }) => (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <h3 className="font-semibold text-sm flex-1 pr-2">{registration.event_title}</h3>
          {getStatusBadge(registration.status, registration.payment_status)}
        </div>

        <div className="space-y-2 text-xs text-muted-foreground mb-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(registration.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="h-3 w-3" />
            <span>{registration.location}</span>
          </div>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 mb-3 space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Categoria:</span>
            <span className="font-medium">{registration.category}</span>
          </div>
          {registration.bib_number && (
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Número de peito:</span>
              <span className="font-semibold text-primary">{registration.bib_number}</span>
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Valor pago:</span>
            <span className="font-medium">R$ {registration.total_amount.toFixed(2)}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {registration.status === "confirmed" && registration.payment_status === "paid" && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                className="flex-1"
                onClick={() => navigate(`/registration/qrcode/${registration.id}`)}
              >
                <QrCode className="h-3 w-3 mr-1" />
                Mostrar Inscrição
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => {
                  setSelectedRegistration(registration);
                  setIsTransferDialogOpen(true);
                }}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Transferir
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6">
        <h1 className="text-2xl font-bold text-white">Minhas Inscrições</h1>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-6">
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="active">
              Ativas ({activeRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pendentes ({pendingRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="cancelled">
              Canceladas ({cancelledRegistrations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-4">
            {activeRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">Nenhuma inscrição ativa</p>
                <Button>Explorar Corridas</Button>
              </div>
            ) : (
              activeRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            {pendingRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma inscrição pendente</p>
              </div>
            ) : (
              pendingRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>

          <TabsContent value="cancelled" className="space-y-4">
            {cancelledRegistrations.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Nenhuma inscrição cancelada</p>
              </div>
            ) : (
              cancelledRegistrations.map((reg) => (
                <RegistrationCard key={reg.id} registration={reg} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Transfer Dialog */}
      <Dialog open={isTransferDialogOpen} onOpenChange={setIsTransferDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transferir Inscrição</DialogTitle>
            <DialogDescription>
              Informe o CPF da pessoa que irá receber a inscrição de {selectedRegistration?.event_title}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="cpf">CPF do novo titular</Label>
              <Input
                id="cpf"
                placeholder="000.000.000-00"
                value={transferCpf}
                onChange={(e) => setTransferCpf(e.target.value)}
                maxLength={14}
              />
              <p className="text-xs text-muted-foreground">
                A pessoa deve estar cadastrada na plataforma
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsTransferDialogOpen(false);
                setTransferCpf("");
                setSelectedRegistration(null);
              }}
              disabled={isTransferring}
            >
              Cancelar
            </Button>
            <Button onClick={handleTransfer} disabled={isTransferring}>
              {isTransferring ? "Transferindo..." : "Confirmar Transferência"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
