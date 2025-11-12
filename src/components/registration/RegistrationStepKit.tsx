import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

interface Kit {
  id: string;
  name: string;
  description: string | null;
  price: number;
}

interface Props {
  kits: Kit[];
  selectedKit: string;
  onSelect: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function RegistrationStepKit({
  kits,
  selectedKit,
  onSelect,
  onNext,
  onBack,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Escolha o Kit</h2>
        <p className="text-sm text-muted-foreground">
          Selecione o kit que deseja receber (opcional)
        </p>
      </div>

      <div className="space-y-3">
        <Card
          className={`cursor-pointer transition-all ${
            selectedKit === ""
              ? "border-primary border-2 shadow-lg"
              : "hover:border-primary/50"
          }`}
          onClick={() => onSelect("")}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-bold text-lg mb-2">Sem Kit</h3>
                <p className="text-2xl font-bold text-primary">R$ 0,00</p>
              </div>
              <div
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selectedKit === ""
                    ? "bg-primary border-primary"
                    : "border-muted-foreground"
                }`}
              >
                {selectedKit === "" && (
                  <Check className="h-4 w-4 text-primary-foreground" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {kits.map((kit) => (
          <Card
            key={kit.id}
            className={`cursor-pointer transition-all ${
              selectedKit === kit.id
                ? "border-primary border-2 shadow-lg"
                : "hover:border-primary/50"
            }`}
            onClick={() => onSelect(kit.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-2">{kit.name}</h3>
                  {kit.description && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {kit.description}
                    </p>
                  )}
                  <p className="text-2xl font-bold text-primary">
                    R$ {kit.price.toFixed(2)}
                  </p>
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedKit === kit.id
                      ? "bg-primary border-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {selectedKit === kit.id && (
                    <Check className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" size="lg" onClick={onNext}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
