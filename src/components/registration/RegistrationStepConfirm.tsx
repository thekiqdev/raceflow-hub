import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calendar, MapPin, User, Ticket, Package, Tag } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Event {
  title: string;
  event_date: string;
  city: string;
  state: string;
}

interface Category {
  name: string;
  distance: string;
  price: number;
}

interface Kit {
  name: string;
  price: number;
}

interface RunnerData {
  full_name: string;
  cpf: string;
  birth_date: string;
  gender: string;
  phone: string;
}

interface Props {
  event: Event;
  category: Category;
  kit?: Kit;
  runnerData: RunnerData;
  totalAmount: number;
  couponCode: string;
  onCouponChange: (code: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function RegistrationStepConfirm({
  event,
  category,
  kit,
  runnerData,
  totalAmount,
  couponCode,
  onCouponChange,
  onNext,
  onBack,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Confirme sua Inscrição</h2>
        <p className="text-sm text-muted-foreground">
          Revise os dados antes de prosseguir para o pagamento
        </p>
      </div>

      {/* Event Info */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            Evento
          </h3>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{event.title}</p>
            <p className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(event.event_date), "dd 'de' MMMM, yyyy", {
                locale: ptBR,
              })}
            </p>
            <p className="text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {event.city} - {event.state}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Runner Info */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Corredor
          </h3>
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{runnerData.full_name}</p>
            <p className="text-muted-foreground">CPF: {runnerData.cpf}</p>
            <p className="text-muted-foreground">
              Nascimento:{" "}
              {format(new Date(runnerData.birth_date), "dd/MM/yyyy")}
            </p>
            <p className="text-muted-foreground">Telefone: {runnerData.phone}</p>
          </div>
        </CardContent>
      </Card>

      {/* Category and Kit */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2">
            <Ticket className="h-4 w-4 text-primary" />
            Modalidade e Kit
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <p className="font-semibold text-sm">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {category.distance}
                </p>
              </div>
              <p className="font-bold">R$ {category.price.toFixed(2)}</p>
            </div>
            {kit && (
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-primary" />
                  <p className="text-sm">{kit.name}</p>
                </div>
                <p className="font-bold">R$ {kit.price.toFixed(2)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Coupon */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Label htmlFor="coupon" className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-primary" />
            Cupom de Desconto
          </Label>
          <div className="flex gap-2">
            <Input
              id="coupon"
              placeholder="Digite o código"
              value={couponCode}
              onChange={(e) => onCouponChange(e.target.value.toUpperCase())}
            />
            <Button variant="outline">Aplicar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Total */}
      <Card className="border-primary">
        <CardContent className="p-4">
          <div className="flex justify-between items-center">
            <p className="text-lg font-bold">Valor Total</p>
            <p className="text-2xl font-bold text-primary">
              R$ {totalAmount.toFixed(2)}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" size="lg" onClick={onNext}>
          Ir para Pagamento
        </Button>
      </div>
    </div>
  );
}
