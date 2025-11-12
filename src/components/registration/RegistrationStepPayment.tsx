import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard, QrCode, Barcode, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Event {
  id: string;
  title: string;
}

interface RunnerData {
  isForMe: boolean;
  full_name: string;
  cpf: string;
  birth_date: string;
  gender: string;
  phone: string;
}

interface Props {
  event: Event;
  totalAmount: number;
  categoryId: string;
  kitId: string;
  runnerData: RunnerData;
  onSuccess: (registrationId: string) => void;
  onBack: () => void;
}

export function RegistrationStepPayment({
  event,
  totalAmount,
  categoryId,
  kitId,
  runnerData,
  onSuccess,
  onBack,
}: Props) {
  const { toast } = useToast();
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const createRegistration = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Erro",
          description: "Você precisa estar logado para se inscrever.",
          variant: "destructive",
        });
        return;
      }

      // Create or update profile if registration is for the user
      if (runnerData.isForMe) {
        const { error: profileError } = await supabase.from("profiles").upsert({
          id: user.id,
          full_name: runnerData.full_name,
          cpf: runnerData.cpf,
          birth_date: runnerData.birth_date,
          gender: runnerData.gender,
          phone: runnerData.phone,
        });

        if (profileError) throw profileError;
      }

      // Create registration
      const { data: registration, error: registrationError } = await supabase
        .from("registrations")
        .insert({
          event_id: event.id,
          runner_id: user.id,
          registered_by: user.id,
          category_id: categoryId,
          kit_id: kitId || null,
          total_amount: totalAmount,
          payment_status: "pending",
          status: "pending",
        })
        .select()
        .single();

      if (registrationError) throw registrationError;

      // Simulate payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Update registration status
      const { error: updateError } = await supabase
        .from("registrations")
        .update({
          payment_status: "paid",
          status: "confirmed",
          confirmation_code: `REG${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        })
        .eq("id", registration.id);

      if (updateError) throw updateError;

      toast({
        title: "Inscrição confirmada!",
        description: "Seu pagamento foi processado com sucesso.",
      });

      onSuccess(registration.id);
    } catch (error: any) {
      console.error("Error creating registration:", error);
      toast({
        title: "Erro ao processar inscrição",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePayment = () => {
    if (!paymentMethod) {
      toast({
        title: "Selecione uma forma de pagamento",
        variant: "destructive",
      });
      return;
    }
    createRegistration();
  };

  const paymentMethods = [
    {
      id: "pix",
      name: "PIX",
      icon: QrCode,
      description: "Pagamento instantâneo",
    },
    {
      id: "credit",
      name: "Cartão de Crédito",
      icon: CreditCard,
      description: "Parcelamento disponível",
    },
    {
      id: "boleto",
      name: "Boleto Bancário",
      icon: Barcode,
      description: "Vencimento em 3 dias",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Pagamento</h2>
        <p className="text-sm text-muted-foreground">
          Escolha a forma de pagamento
        </p>
      </div>

      <Card className="border-primary">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <p className="text-lg font-bold">Valor a pagar</p>
            <p className="text-2xl font-bold text-primary">
              R$ {totalAmount.toFixed(2)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {paymentMethods.map((method) => {
          const Icon = method.icon;
          return (
            <Card
              key={method.id}
              className={`cursor-pointer transition-all ${
                paymentMethod === method.id
                  ? "border-primary border-2 shadow-lg"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setPaymentMethod(method.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${
                      paymentMethod === method.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold">{method.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {method.description}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onBack}
          disabled={loading}
        >
          Voltar
        </Button>
        <Button
          className="flex-1"
          size="lg"
          onClick={handlePayment}
          disabled={!paymentMethod || loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processando...
            </>
          ) : (
            "Finalizar Pagamento"
          )}
        </Button>
      </div>
    </div>
  );
}
