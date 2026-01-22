import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { executeFixOrganizerRegistrationsScript } from "@/lib/api/systemSettings";

const AdvancedSettings = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<{
    updated?: number;
    totalAmountZeroed?: number;
    errors?: number;
    total?: number;
  } | null>(null);
  const [logFile, setLogFile] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll para o final dos logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleExecuteScript = async () => {
    if (isRunning) return;

    setIsRunning(true);
    setLogs([]);
    setSummary(null);
    setLogFile(null);
    setHasError(false);

    const newLogs: string[] = [];

    await executeFixOrganizerRegistrationsScript(
      (message: string) => {
        newLogs.push(message);
        setLogs([...newLogs]);
      },
      (data) => {
        setIsRunning(false);
        if (data.success) {
          setSummary(data.summary || null);
          setLogFile(data.logFile || null);
          toast.success("Script executado com sucesso!");
        } else {
          setHasError(true);
          toast.error(data.message || "Erro ao executar script");
        }
      },
      (error: string) => {
        setIsRunning(false);
        setHasError(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogs([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLog = () => {
    if (!logs.length) return;

    const logContent = logs.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = logFile || `fix-organizer-registrations-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Corrigir Inscrições de Organizadores</CardTitle>
          <CardDescription>
            Este script corrige inscrições criadas por organizadores para seus próprios eventos.
            As inscrições terão o valor zerado e serão marcadas como "convite" para excluir do cálculo de receita.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleExecuteScript}
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Executar Script
                </>
              )}
            </Button>
            {logs.length > 0 && (
              <Button
                onClick={handleDownloadLog}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Baixar Log
              </Button>
            )}
          </div>

          {summary && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-semibold">Script concluído com sucesso!</p>
                  <div className="text-sm space-y-1">
                    <p>✅ Inscrições corrigidas: {summary.updated || 0}</p>
                    <p>💰 Valores zerados: {summary.totalAmountZeroed || 0}</p>
                    <p>❌ Erros: {summary.errors || 0}</p>
                    <p>📦 Total processado: {summary.total || 0}</p>
                    {logFile && (
                      <p className="text-muted-foreground mt-2">
                        Log salvo no servidor: {logFile}
                      </p>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar o script. Verifique os logs abaixo para mais detalhes.
              </AlertDescription>
            </Alert>
          )}

          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs de Execução</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div ref={scrollAreaRef}>
                    {logs.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRef} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdvancedSettings;
