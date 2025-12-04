import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trophy, Clock, TrendingUp, Share2, Medal, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { getRunnerResults, getRunnerResultsStats, type RunnerResult, type RunnerResultsStats } from "@/lib/api/runnerResults";
import { toast } from "sonner";

export function Results() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<RunnerResult[]>([]);
  const [stats, setStats] = useState<RunnerResultsStats>({
    total_races: 0,
    podiums: 0,
    improvement_percentage: 0,
    completed_races: 0,
  });

  useEffect(() => {
    if (user) {
      loadResults();
    }
  }, [user]);

  const loadResults = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const [resultsResponse, statsResponse] = await Promise.all([
        getRunnerResults(),
        getRunnerResultsStats(),
      ]);

      if (resultsResponse.success && resultsResponse.data) {
        setResults(resultsResponse.data);
      } else {
        toast.error(resultsResponse.error || "Erro ao carregar resultados");
      }

      if (statsResponse.success && statsResponse.data) {
        setStats(statsResponse.data);
      } else {
        toast.error(statsResponse.error || "Erro ao carregar estatísticas");
      }
    } catch (error: any) {
      console.error("Error loading results:", error);
      toast.error(error.message || "Erro ao carregar resultados");
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (result: RunnerResult) => {
    const shareText = `Completei a corrida ${result.event_title}! Veja meu resultado: ${result.result_url}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Resultado - ${result.event_title}`,
          text: shareText,
          url: result.result_url,
        });
        toast.success("Resultado compartilhado!");
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          // Fallback to clipboard
          await navigator.clipboard.writeText(shareText);
          toast.success("Link copiado para a área de transferência!");
        }
      }
    } else {
      // Fallback to clipboard
      try {
        await navigator.clipboard.writeText(shareText);
        toast.success("Link copiado para a área de transferência!");
      } catch (error) {
        toast.error("Erro ao copiar link");
      }
    }
  };

  const formatPosition = (position: number, total: number) => {
    return `${position}º de ${total}`;
  };

  if (loading) {
    return (
      <div className="pb-20">
        <div className="bg-gradient-hero p-6">
          <h1 className="text-2xl font-bold text-white mb-2">Meus Resultados</h1>
          <p className="text-white/90 text-sm">Acompanhe seu desempenho</p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

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
                <div className="text-2xl font-bold text-foreground">{stats.total_races}</div>
                <div className="text-xs text-muted-foreground">Provas</div>
              </div>
              <div>
                <Medal className="h-6 w-6 text-secondary mx-auto mb-1" />
                <div className="text-2xl font-bold text-foreground">{stats.podiums}</div>
                <div className="text-xs text-muted-foreground">Pódios</div>
              </div>
              <div>
                <TrendingUp className="h-6 w-6 text-accent mx-auto mb-1" />
                <div className="text-2xl font-bold text-foreground">
                  {stats.improvement_percentage > 0 ? `+${stats.improvement_percentage}%` : `${stats.improvement_percentage}%`}
                </div>
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
          <Card>
            <CardContent className="py-12 text-center">
              <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-2">Nenhum resultado disponível</p>
              <p className="text-sm text-muted-foreground">
                Seus resultados aparecerão aqui após participar de corridas e os organizadores disponibilizarem os resultados
              </p>
            </CardContent>
          </Card>
        ) : (
          results.map((result) => (
            <Card key={result.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-base mb-1">{result.event_title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(result.event_date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                  <Badge variant="default" className="ml-2">
                    Resultado Disponível
                  </Badge>
                </div>

                {/* Participant Info */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-muted/30 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground mb-1">Categoria</div>
                    <div className="font-semibold text-sm text-foreground">
                      {result.category_name}
                    </div>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-2">
                    <div className="text-xs text-muted-foreground mb-1">Distância</div>
                    <div className="font-semibold text-sm text-foreground">
                      {result.category_distance}
                    </div>
                  </div>
                </div>

                {result.confirmation_code && (
                  <div className="bg-muted/30 rounded-lg p-2 mb-3">
                    <div className="text-xs text-muted-foreground mb-1">Código de Confirmação</div>
                    <div className="font-mono text-sm font-semibold text-primary">
                      {result.confirmation_code}
                    </div>
                  </div>
                )}

                {/* Result Link */}
                <div className="bg-primary/5 rounded-lg p-3 mb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Resultado</div>
                      <div className="text-sm font-medium text-primary">
                        Link dos resultados disponível
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-primary" />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => window.open(result.result_url, '_blank')}
                  >
                    <ExternalLink className="h-3 w-3 mr-2" />
                    Ver Resultado
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleShare(result)}
                  >
                    <Share2 className="h-3 w-3 mr-2" />
                    Compartilhar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
