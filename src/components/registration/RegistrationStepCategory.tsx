import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";

interface Category {
  id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
}

interface Props {
  categories: Category[];
  selectedCategory: string;
  onSelect: (id: string) => void;
  onNext: () => void;
}

export function RegistrationStepCategory({
  categories,
  selectedCategory,
  onSelect,
  onNext,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Escolha a Modalidade</h2>
        <p className="text-sm text-muted-foreground">
          Selecione a distância que deseja correr
        </p>
      </div>

      <div className="space-y-3">
        {categories.map((category) => (
          <Card
            key={category.id}
            className={`cursor-pointer transition-all ${
              selectedCategory === category.id
                ? "border-primary border-2 shadow-lg"
                : "hover:border-primary/50"
            }`}
            onClick={() => onSelect(category.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-lg">{category.name}</h3>
                    <Badge variant="secondary">{category.distance}</Badge>
                  </div>
                  <p className="text-2xl font-bold text-primary">
                    R$ {category.price.toFixed(2)}
                  </p>
                  {category.max_participants && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Limite: {category.max_participants} vagas
                    </p>
                  )}
                </div>
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                    selectedCategory === category.id
                      ? "bg-primary border-primary"
                      : "border-muted-foreground"
                  }`}
                >
                  {selectedCategory === category.id && (
                    <Check className="h-4 w-4 text-primary-foreground" />
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={!selectedCategory}
        onClick={onNext}
      >
        Continuar
      </Button>
    </div>
  );
}
