import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Clock, TrendingUp, Share2, Medal } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Result {
  id: string;
  event_title: string;
  event_date: string;
  category: string;
  official_time: string;
  net_time: string;
  overall_position: number;
  category_position: number;
  total_participants: number;
  bib_number: number;
  team?: string;
  pace: string;
}

export function Results() {
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    // Mock results data
    const mockResults: Result[] = [
      {
        id: "1",
        event_title: "Corrida de Ano Novo 2024",
        event_date: "2024-01-01T07:00:00Z",
        category: "10K - Masculino",
        official_time: "00:45:32",
        net_time: "00:45:28",
        overall_position: 45,
        category_position: 12,
        total_participants: 500,
        bib_number: 1234,
        team: "Runners Club SP",
        pace: "4:33 /km",
      },
      {
        id: "2",
        event_title: "Maratona de Primavera",
        event_date: "2023-09-15T06:00:00Z",
        category: "5K - Masculino",
        official_time: "00:22:15",
        net_time: "00:22:10",
        overall_position: 23,
        category_position: 8,
        total_participants: 350,
        bib_number: 567,
        team: "Equipe Velocidade",
        pace: "4:26 /km",
      },
    ];
    setResults(mockResults);
  }, []);

  const formatPosition = (position: number, total: number) => {
    return `${position}º de ${total}`;
  };

  return (
    <div className="pb-20">
      {/* Header */}
      <div className="bg-gradient-hero p-6">
        <h1 className="text-2xl font-bold text-white mb-2">Meus Resultados</h1>
        <p className="text-white/90 text-sm">Acompanhe seu desempenho</p>
      </div>

      {/* Stats Summary */}
      <div className="px-4 -mt-4 mb-6">
        <Card className="shadow-lg">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Trophy className="h-6 w-6 text-primary mx-auto mb-1" />
                <div className="text-2xl font-bold text-foreground">{results.length}</div>
                <div className="text-xs text-muted-foreground">Provas</div>
              </div>
              <div>
                <Medal className="h-6 w-6 text-secondary mx-auto mb-1" />
                <div className="text-2xl font-bold text-foreground">3</div>
                <div className="text-xs text-muted-foreground">Pódios</div>
              </div>
              <div>
                <TrendingUp className="h-6 w-6 text-accent mx-auto mb-1" />
                <div className="text-2xl font-bold text-foreground">12%</div>
                <div className="text-xs text-muted-foreground">Melhora</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results List */}
      <div className="px-4 space-y-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">Histórico de Provas</h2>

        {results.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground mb-4">Nenhum resultado disponível</p>
            <p className="text-sm text-muted-foreground">
              Seus resultados aparecerão aqui após participar de corridas
            </p>
          </div>
        ) : (
          results.map((result) => (
            <Card key={result.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base mb-1">{result.event_title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(result.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                </div>

                {/* Participant Info */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-muted/30 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground mb-1">Número</div>
                    <div className="font-bold text-foreground">#{result.bib_number}</div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground mb-1">Categoria</div>
                    <div className="font-semibold text-sm text-foreground">{result.category}</div>
                  </div>
                </div>

                {result.team && (
                  <div className="bg-muted/30 rounded-lg p-2 mb-3">
                    <div className="text-xs text-muted-foreground mb-1">Equipe</div>
                    <div className="font-semibold text-sm text-foreground">{result.team}</div>
                  </div>
                )}

                {/* Times */}
                <div className="bg-primary/5 rounded-lg p-3 mb-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Tempo Final</div>
                      <div className="text-base font-bold text-primary flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {result.official_time}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Líquido</div>
                      <div className="text-base font-bold text-primary flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {result.net_time}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Ritmo</div>
                      <div className="text-base font-bold text-primary">
                        {result.pace}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Positions */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-secondary/10 rounded-lg p-2 text-center border border-secondary/20">
                    <div className="text-xs text-muted-foreground mb-1">Posição Geral</div>
                    <div className="font-bold text-foreground">
                      {formatPosition(result.overall_position, result.total_participants)}
                    </div>
                  </div>
                  <div className="bg-accent/10 rounded-lg p-2 text-center border border-accent/20">
                    <div className="text-xs text-muted-foreground mb-1">Posição Categoria</div>
                    <div className="font-bold text-foreground">
                      {result.category_position}º lugar
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <Button variant="outline" size="sm" className="w-full">
                  <Share2 className="h-3 w-3 mr-2" />
                  Compartilhar Resultado
                </Button>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
