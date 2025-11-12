import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface RunnerData {
  isForMe: boolean;
  full_name: string;
  cpf: string;
  birth_date: string;
  gender: string;
  phone: string;
}

interface Props {
  runnerData: RunnerData;
  onUpdate: (data: RunnerData) => void;
  onNext: () => void;
  onBack: () => void;
}

export function RegistrationStepRunner({
  runnerData,
  onUpdate,
  onNext,
  onBack,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (runnerData.isForMe) {
      loadUserProfile();
    }
  }, [runnerData.isForMe]);

  const loadUserProfile = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        onUpdate({
          ...runnerData,
          full_name: profile.full_name || "",
          cpf: profile.cpf || "",
          birth_date: profile.birth_date || "",
          gender: profile.gender || "",
          phone: profile.phone || "",
        });
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    if (
      !runnerData.full_name ||
      !runnerData.cpf ||
      !runnerData.birth_date ||
      !runnerData.gender ||
      !runnerData.phone
    ) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha todos os campos.",
        variant: "destructive",
      });
      return;
    }
    onNext();
  };

  return (
    <div className="space-y-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-2">Dados do Corredor</h2>
        <p className="text-sm text-muted-foreground">
          Preencha os dados de quem irá correr
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <Label>A inscrição é para:</Label>
            <RadioGroup
              value={runnerData.isForMe ? "me" : "other"}
              onValueChange={(value) =>
                onUpdate({ ...runnerData, isForMe: value === "me" })
              }
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="me" id="me" />
                <Label htmlFor="me" className="font-normal cursor-pointer">
                  Para mim
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other" className="font-normal cursor-pointer">
                  Para outra pessoa
                </Label>
              </div>
            </RadioGroup>
          </div>

          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando dados...</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome Completo *</Label>
                <Input
                  id="full_name"
                  value={runnerData.full_name}
                  onChange={(e) =>
                    onUpdate({ ...runnerData, full_name: e.target.value })
                  }
                  placeholder="Digite o nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <Input
                  id="cpf"
                  value={runnerData.cpf}
                  onChange={(e) =>
                    onUpdate({ ...runnerData, cpf: e.target.value })
                  }
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birth_date">Data de Nascimento *</Label>
                <Input
                  id="birth_date"
                  type="date"
                  value={runnerData.birth_date}
                  onChange={(e) =>
                    onUpdate({ ...runnerData, birth_date: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gender">Gênero *</Label>
                <Select
                  value={runnerData.gender}
                  onValueChange={(value) =>
                    onUpdate({ ...runnerData, gender: value })
                  }
                >
                  <SelectTrigger id="gender">
                    <SelectValue placeholder="Selecione o gênero" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculino</SelectItem>
                    <SelectItem value="F">Feminino</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone *</Label>
                <Input
                  id="phone"
                  value={runnerData.phone}
                  onChange={(e) =>
                    onUpdate({ ...runnerData, phone: e.target.value })
                  }
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Voltar
        </Button>
        <Button className="flex-1" size="lg" onClick={handleSubmit}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
