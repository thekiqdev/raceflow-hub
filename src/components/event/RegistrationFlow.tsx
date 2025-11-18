import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Calendar, MapPin, Ticket, Download } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

interface Category {
  id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
}

interface Kit {
  id: string;
  name: string;
  description: string | null;
  price: number;
}

interface EventInfo {
  id: string;
  title: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
}

interface RegistrationFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: EventInfo;
  categories: Category[];
  kits: Kit[];
}

const SHIRT_SIZES = ["PP", "P", "M", "G", "GG", "XG"];

export function RegistrationFlow({
  open,
  onOpenChange,
  event,
  categories,
  kits,
}: RegistrationFlowProps) {
  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);
  const [shirtSize, setShirtSize] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    cpf: "",
  });

  const totalPrice = (selectedCategory?.price || 0) + (selectedKit?.price || 0);

  // Load user data when dialog opens
  useEffect(() => {
    const loadUserData = async () => {
      if (!open) return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profile) {
        setFormData({
          fullName: profile.full_name || "",
          email: user.email || "",
          phone: profile.phone || "",
          cpf: profile.cpf || "",
        });
      } else {
        // If no profile, at least set the email
        setFormData((prev) => ({
          ...prev,
          email: user.email || "",
        }));
      }
    };

    loadUserData();
  }, [open]);

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
  };

  const handleKitSelect = (kit: Kit) => {
    setSelectedKit(kit);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNextStep = () => {
    setStep((prev) => prev + 1);
  };

  const handlePreviousStep = () => {
    setStep((prev) => prev - 1);
  };

  const handleSubmit = () => {
    // Generate confirmation code
    const code = `CONF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
    setConfirmationCode(code);
    handleNextStep();
  };

  const handleReset = () => {
    setStep(1);
    setSelectedCategory(null);
    setSelectedKit(null);
    setShirtSize("");
    setConfirmationCode("");
    setFormData({ fullName: "", email: "", phone: "", cpf: "" });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl">
            {step === 4 ? "Confirmação de Inscrição" : `Inscrição - ${event.title}`}
          </DialogTitle>
        </DialogHeader>

        {/* Progress Indicator */}
        {step < 4 && (
          <div className="flex items-center justify-between mb-6">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    step >= s
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      step > s ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Category Selection */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Escolha a Modalidade</h3>
            <div className="grid gap-4">
              {categories.map((category) => (
                <Card
                  key={category.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    selectedCategory?.id === category.id
                      ? "ring-2 ring-primary"
                      : ""
                  }`}
                  onClick={() => handleCategorySelect(category)}
                >
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <h4 className="font-semibold">{category.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {category.distance}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">
                        R$ {category.price.toFixed(2)}
                      </p>
                      {category.max_participants && (
                        <p className="text-xs text-muted-foreground">
                          Vagas limitadas
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <Button
                onClick={handleNextStep}
                disabled={!selectedCategory}
                className="min-w-32"
              >
                Próximo
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Kit & Shirt Size Selection */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Escolha o Kit</h3>
              <div className="grid gap-4">
                {kits.map((kit) => (
                  <Card
                    key={kit.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedKit?.id === kit.id ? "ring-2 ring-primary" : ""
                    }`}
                    onClick={() => handleKitSelect(kit)}
                  >
                    <CardContent className="p-4 flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold">{kit.name}</h4>
                        <p className="text-sm text-muted-foreground mt-1">
                          {kit.description}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-xl font-bold text-primary">
                          {kit.price === 0
                            ? "Incluso"
                            : `+ R$ ${kit.price.toFixed(2)}`}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="shirt-size" className="text-base font-semibold">
                Tamanho da Camisa
              </Label>
              <RadioGroup
                value={shirtSize}
                onValueChange={setShirtSize}
                className="grid grid-cols-6 gap-3 mt-3"
              >
                {SHIRT_SIZES.map((size) => (
                  <div key={size}>
                    <RadioGroupItem
                      value={size}
                      id={size}
                      className="peer sr-only"
                    />
                    <Label
                      htmlFor={size}
                      className="flex items-center justify-center rounded-md border-2 border-muted bg-background px-3 py-2 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground cursor-pointer transition-all"
                    >
                      {size}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePreviousStep}>
                Voltar
              </Button>
              <Button
                onClick={handleNextStep}
                disabled={!selectedKit || !shirtSize}
                className="min-w-32"
              >
                Próximo
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Checkout */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">Dados Pessoais</h3>
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="fullName">Nome Completo *</Label>
                  <Input
                    id="fullName"
                    value={formData.fullName}
                    onChange={(e) => handleInputChange("fullName", e.target.value)}
                    placeholder="Seu nome completo"
                    className="mt-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      placeholder="seu@email.com"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telefone *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange("phone", e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="mt-1"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="cpf">CPF *</Label>
                  <Input
                    id="cpf"
                    value={formData.cpf}
                    onChange={(e) => handleInputChange("cpf", e.target.value)}
                    placeholder="000.000.000-00"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-semibold mb-4">Resumo da Compra</h3>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Modalidade:</span>
                    <span className="font-medium">{selectedCategory?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Kit:</span>
                    <span className="font-medium">{selectedKit?.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tamanho:</span>
                    <span className="font-medium">{shirtSize}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Valor da modalidade:</span>
                    <span>R$ {selectedCategory?.price.toFixed(2)}</span>
                  </div>
                  {selectedKit && selectedKit.price > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Valor do kit:</span>
                      <span>R$ {selectedKit.price.toFixed(2)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-primary">R$ {totalPrice.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={handlePreviousStep}>
                Voltar
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !formData.fullName ||
                  !formData.email ||
                  !formData.phone ||
                  !formData.cpf
                }
                className="min-w-32"
              >
                Finalizar Inscrição
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Confirmation Ticket */}
        {step === 4 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-center">
              <CheckCircle2 className="w-20 h-20 text-accent" />
            </div>
            <div>
              <h3 className="text-2xl font-bold mb-2">Inscrição Confirmada!</h3>
              <p className="text-muted-foreground">
                Sua inscrição foi realizada com sucesso.
              </p>
            </div>

            <Card className="text-left">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Ticket className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Código de Confirmação</p>
                    <p className="text-xl font-bold font-mono">{confirmationCode}</p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="font-semibold mb-3">{event.title}</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span>
                        {format(new Date(event.event_date), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", {
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground mt-0.5" />
                      <span>
                        {event.location} - {event.city}, {event.state}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Atleta:</span>
                    <span className="font-medium">{formData.fullName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Modalidade:</span>
                    <span className="font-medium">{selectedCategory?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Kit:</span>
                    <span className="font-medium">{selectedKit?.name}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tamanho:</span>
                    <span className="font-medium">{shirtSize}</span>
                  </div>
                  <div className="flex justify-between text-sm font-bold pt-2">
                    <span>Total Pago:</span>
                    <span className="text-primary">R$ {totalPrice.toFixed(2)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="bg-muted p-4 rounded-lg text-sm text-left">
              <p className="font-semibold mb-2">Próximos Passos:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li>• Enviamos um email de confirmação para {formData.email}</li>
                <li>• Você pode retirar seu kit 2 dias antes do evento</li>
                <li>• Leve um documento com foto no dia da prova</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleReset}>
                Fechar
              </Button>
              <Button className="flex-1">
                <Download className="w-4 h-4 mr-2" />
                Baixar Comprovante
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
