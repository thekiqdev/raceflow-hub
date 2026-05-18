import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Play, Download, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  executeFixOrganizerRegistrationsScript,
  executeDisableAsaasNotificationsScript,
  executeBackfillPlatformFeeAmountScript,
  executeInvestigateEventRegistrationsIntegrityScript,
  executeForensicEventRegistrationsInvestigationScript,
  executeRestoreRegistrationsFromBackupScript,
  executeDeepForensicRegistrationsInvestigationScript,
  executeAnalyzeBackupRegistrationDependenciesScript,
  executeAnalyzeNullKitCompatibilityScript,
  type EventRegistrationsIntegrityDiagnosis,
  type ForensicEventRegistrationsInvestigation,
  type RestoreRegistrationsFromBackupResult,
  type DeepForensicRegistrationsInvestigation,
  type AnalyzeBackupRegistrationDependenciesResult,
  type AnalyzeNullKitCompatibilityResult,
} from "@/lib/api/systemSettings";
import { InvitationBonusAuditPanel } from "@/components/admin/InvitationBonusAuditPanel";
import { getEvents, type Event } from "@/lib/api/events";

const LATEST_EVENT_VALUE = "__latest__";

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

  // Estado do script Asaas (desabilitar notificações – clientes antigos)
  const [isRunningAsaas, setIsRunningAsaas] = useState(false);
  const [logsAsaas, setLogsAsaas] = useState<string[]>([]);
  const [summaryAsaas, setSummaryAsaas] = useState<{
    updated?: number;
    errors?: number;
    total?: number;
  } | null>(null);
  const [logFileAsaas, setLogFileAsaas] = useState<string | null>(null);
  const [hasErrorAsaas, setHasErrorAsaas] = useState(false);
  const logsEndRefAsaas = useRef<HTMLDivElement>(null);

  // OK Etapa 6: Backfill platform_fee_amount em inscrições antigas
  const [isRunningBackfill, setIsRunningBackfill] = useState(false);
  const [logsBackfill, setLogsBackfill] = useState<string[]>([]);
  const [summaryBackfill, setSummaryBackfill] = useState<{ updated?: number; total?: number; errors?: number } | null>(null);
  const [logFileBackfill, setLogFileBackfill] = useState<string | null>(null);
  const [hasErrorBackfill, setHasErrorBackfill] = useState(false);
  const logsEndRefBackfill = useRef<HTMLDivElement>(null);

  // Diagnóstico read-only de inscrições ocultas/inconsistentes após exclusão de kits
  const [integrityEventId, setIntegrityEventId] = useState("");
  const [integrityEvents, setIntegrityEvents] = useState<Event[]>([]);
  const [loadingIntegrityEvents, setLoadingIntegrityEvents] = useState(false);
  const [isRunningIntegrity, setIsRunningIntegrity] = useState(false);
  const [logsIntegrity, setLogsIntegrity] = useState<string[]>([]);
  const [summaryIntegrity, setSummaryIntegrity] = useState<EventRegistrationsIntegrityDiagnosis | null>(null);
  const [hasErrorIntegrity, setHasErrorIntegrity] = useState(false);
  const logsEndRefIntegrity = useRef<HTMLDivElement>(null);
  const [isRunningForensic, setIsRunningForensic] = useState(false);
  const [logsForensic, setLogsForensic] = useState<string[]>([]);
  const [summaryForensic, setSummaryForensic] = useState<ForensicEventRegistrationsInvestigation | null>(null);
  const [hasErrorForensic, setHasErrorForensic] = useState(false);
  const logsEndRefForensic = useRef<HTMLDivElement>(null);
  const [isRunningRestoreBackup, setIsRunningRestoreBackup] = useState(false);
  const [logsRestoreBackup, setLogsRestoreBackup] = useState<string[]>([]);
  const [summaryRestoreBackup, setSummaryRestoreBackup] = useState<RestoreRegistrationsFromBackupResult | null>(null);
  const [hasErrorRestoreBackup, setHasErrorRestoreBackup] = useState(false);
  const logsEndRefRestoreBackup = useRef<HTMLDivElement>(null);
  const [isRunningDeepForensic, setIsRunningDeepForensic] = useState(false);
  const [logsDeepForensic, setLogsDeepForensic] = useState<string[]>([]);
  const [summaryDeepForensic, setSummaryDeepForensic] = useState<DeepForensicRegistrationsInvestigation | null>(null);
  const [hasErrorDeepForensic, setHasErrorDeepForensic] = useState(false);
  const logsEndRefDeepForensic = useRef<HTMLDivElement>(null);
  const [isRunningBackupAnalyzer, setIsRunningBackupAnalyzer] = useState(false);
  const [logsBackupAnalyzer, setLogsBackupAnalyzer] = useState<string[]>([]);
  const [summaryBackupAnalyzer, setSummaryBackupAnalyzer] = useState<AnalyzeBackupRegistrationDependenciesResult | null>(null);
  const [hasErrorBackupAnalyzer, setHasErrorBackupAnalyzer] = useState(false);
  const logsEndRefBackupAnalyzer = useRef<HTMLDivElement>(null);
  const [isRunningNullKitAnalyzer, setIsRunningNullKitAnalyzer] = useState(false);
  const [logsNullKitAnalyzer, setLogsNullKitAnalyzer] = useState<string[]>([]);
  const [summaryNullKitAnalyzer, setSummaryNullKitAnalyzer] = useState<AnalyzeNullKitCompatibilityResult | null>(null);
  const [hasErrorNullKitAnalyzer, setHasErrorNullKitAnalyzer] = useState(false);
  const logsEndRefNullKitAnalyzer = useRef<HTMLDivElement>(null);

  // Auto-scroll para o final dos logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);
  useEffect(() => {
    if (logsEndRefAsaas.current) {
      logsEndRefAsaas.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsAsaas]);
  useEffect(() => {
    if (logsEndRefBackfill.current) {
      logsEndRefBackfill.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsBackfill]);
  useEffect(() => {
    if (logsEndRefIntegrity.current) {
      logsEndRefIntegrity.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsIntegrity]);
  useEffect(() => {
    if (logsEndRefForensic.current) {
      logsEndRefForensic.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsForensic]);
  useEffect(() => {
    if (logsEndRefRestoreBackup.current) {
      logsEndRefRestoreBackup.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsRestoreBackup]);
  useEffect(() => {
    if (logsEndRefDeepForensic.current) {
      logsEndRefDeepForensic.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsDeepForensic]);
  useEffect(() => {
    if (logsEndRefBackupAnalyzer.current) {
      logsEndRefBackupAnalyzer.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsBackupAnalyzer]);
  useEffect(() => {
    if (logsEndRefNullKitAnalyzer.current) {
      logsEndRefNullKitAnalyzer.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logsNullKitAnalyzer]);

  useEffect(() => {
    let cancelled = false;
    setLoadingIntegrityEvents(true);
    getEvents({ order_by_date: "desc" })
      .then((response) => {
        if (cancelled) return;
        if (response.success && response.data) {
          setIntegrityEvents(response.data);
        } else {
          setIntegrityEvents([]);
          toast.error(response.error || "Erro ao carregar eventos para diagnóstico");
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Erro ao carregar eventos para diagnóstico:", error);
        setIntegrityEvents([]);
        toast.error("Erro ao carregar eventos para diagnóstico");
      })
      .finally(() => {
        if (!cancelled) setLoadingIntegrityEvents(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const handleExecuteAsaasScript = async () => {
    if (isRunningAsaas) return;
    setIsRunningAsaas(true);
    setLogsAsaas([]);
    setSummaryAsaas(null);
    setLogFileAsaas(null);
    setHasErrorAsaas(false);
    const newLogs: string[] = [];
    await executeDisableAsaasNotificationsScript(
      (message: string) => {
        newLogs.push(message);
        setLogsAsaas([...newLogs]);
      },
      (data) => {
        setIsRunningAsaas(false);
        if (data.success) {
          setSummaryAsaas(data.summary || null);
          setLogFileAsaas(data.logFile || null);
          toast.success("Script Asaas executado com sucesso!");
        } else {
          setHasErrorAsaas(true);
          toast.error(data.message || "Erro ao executar script");
        }
      },
      (error: string) => {
        setIsRunningAsaas(false);
        setHasErrorAsaas(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsAsaas([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogAsaas = () => {
    if (!logsAsaas.length) return;
    const logContent = logsAsaas.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = logFileAsaas || `disable-asaas-notifications-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const handleExecuteBackfillScript = async () => {
    if (isRunningBackfill) return;
    setIsRunningBackfill(true);
    setLogsBackfill([]);
    setSummaryBackfill(null);
    setLogFileBackfill(null);
    setHasErrorBackfill(false);
    const newLogs: string[] = [];
    await executeBackfillPlatformFeeAmountScript(
      (message: string) => {
        newLogs.push(message);
        setLogsBackfill([...newLogs]);
      },
      (data) => {
        setIsRunningBackfill(false);
        if (data.success) {
          setSummaryBackfill(data.summary ?? null);
          setLogFileBackfill(data.logFile ?? null);
          toast.success(data.message || "Backfill executado com sucesso!");
        } else {
          setHasErrorBackfill(true);
          toast.error(data.message || "Erro ao executar backfill");
        }
      },
      (error: string) => {
        setIsRunningBackfill(false);
        setHasErrorBackfill(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsBackfill([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogBackfill = () => {
    if (!logsBackfill.length) return;
    const logContent = logsBackfill.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = logFileBackfill || `backfill-platform-fee-amount-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const handleExecuteIntegrityScript = async () => {
    if (isRunningIntegrity) return;
    setIsRunningIntegrity(true);
    setLogsIntegrity([]);
    setSummaryIntegrity(null);
    setHasErrorIntegrity(false);
    const newLogs: string[] = [];

    await executeInvestigateEventRegistrationsIntegrityScript(
      { eventId: integrityEventId.trim() || undefined },
      (message: string) => {
        newLogs.push(message);
        setLogsIntegrity([...newLogs]);
      },
      (data) => {
        setIsRunningIntegrity(false);
        if (data.success) {
          setSummaryIntegrity(data.summary ?? null);
          toast.success("Diagnóstico concluído com sucesso!");
        } else {
          setHasErrorIntegrity(true);
          toast.error(data.message || "Erro ao executar diagnóstico");
        }
      },
      (error: string) => {
        setIsRunningIntegrity(false);
        setHasErrorIntegrity(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsIntegrity([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogIntegrity = () => {
    if (!logsIntegrity.length) return;
    const logContent = logsIntegrity.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investigate-event-registrations-integrity-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const handleExecuteForensicScript = async () => {
    if (isRunningForensic) return;
    setIsRunningForensic(true);
    setLogsForensic([]);
    setSummaryForensic(null);
    setHasErrorForensic(false);
    const newLogs: string[] = [];

    await executeForensicEventRegistrationsInvestigationScript(
      { eventId: integrityEventId.trim() || undefined },
      (message: string) => {
        newLogs.push(message);
        setLogsForensic([...newLogs]);
      },
      (data) => {
        setIsRunningForensic(false);
        if (data.success) {
          setSummaryForensic(data.summary ?? null);
          toast.success("Investigação forense concluída com sucesso!");
        } else {
          setHasErrorForensic(true);
          toast.error(data.message || "Erro ao executar investigação forense");
        }
      },
      (error: string) => {
        setIsRunningForensic(false);
        setHasErrorForensic(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsForensic([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogForensic = () => {
    if (!logsForensic.length) return;
    const logContent = logsForensic.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forensic-event-registrations-investigation-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const getSelectedEventIdForBackupRestore = () => {
    return integrityEventId.trim() || integrityEvents[0]?.id || "";
  };

  const runRestoreBackupScript = async (confirm: boolean) => {
    if (isRunningRestoreBackup) return;

    const selectedEventId = getSelectedEventIdForBackupRestore();
    if (!selectedEventId) {
      toast.error("Selecione um evento antes de consultar o backup");
      return;
    }

    if (confirm) {
      const confirmed = window.confirm(
        "Esta ação irá restaurar inscrições faltantes encontradas no backup.\n\nNenhuma inscrição existente será alterada.\n\nInscrições com kit removido serão restauradas com kit nulo, preservando os demais dados históricos.\n\nDeseja continuar?"
      );
      if (!confirmed) return;
    }

    setIsRunningRestoreBackup(true);
    setLogsRestoreBackup([]);
    setSummaryRestoreBackup(null);
    setHasErrorRestoreBackup(false);
    const newLogs: string[] = [];

    await executeRestoreRegistrationsFromBackupScript(
      {
        eventId: selectedEventId,
        confirm,
        mode: confirm ? "restore" : "preview",
        limit: confirm ? 10 : undefined,
        batchSize: 10,
      },
      (message: string) => {
        newLogs.push(message);
        setLogsRestoreBackup([...newLogs]);
      },
      (data) => {
        setIsRunningRestoreBackup(false);
        if (data.success) {
          setSummaryRestoreBackup(data.summary ?? null);
          toast.success(data.message || "Consulta do backup concluída com sucesso!");
        } else {
          setHasErrorRestoreBackup(true);
          toast.error(data.message || "Erro ao consultar backup");
        }
      },
      (error: string) => {
        setIsRunningRestoreBackup(false);
        setHasErrorRestoreBackup(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsRestoreBackup([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogRestoreBackup = () => {
    if (!logsRestoreBackup.length) return;
    const logContent = logsRestoreBackup.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `restore-registrations-from-backup-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const handleExecuteDeepForensicScript = async () => {
    if (isRunningDeepForensic) return;
    setIsRunningDeepForensic(true);
    setLogsDeepForensic([]);
    setSummaryDeepForensic(null);
    setHasErrorDeepForensic(false);
    const newLogs: string[] = [];

    await executeDeepForensicRegistrationsInvestigationScript(
      { eventId: integrityEventId.trim() || undefined },
      (message: string) => {
        newLogs.push(message);
        setLogsDeepForensic([...newLogs]);
      },
      (data) => {
        setIsRunningDeepForensic(false);
        if (data.success) {
          setSummaryDeepForensic(data.summary ?? null);
          toast.success("Investigação profunda concluída com sucesso!");
        } else {
          setHasErrorDeepForensic(true);
          toast.error(data.message || "Erro ao executar investigação profunda");
        }
      },
      (error: string) => {
        setIsRunningDeepForensic(false);
        setHasErrorDeepForensic(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsDeepForensic([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogDeepForensic = () => {
    if (!logsDeepForensic.length) return;
    const logContent = logsDeepForensic.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deep-forensic-registrations-investigation-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const handleExecuteBackupAnalyzerScript = async () => {
    if (isRunningBackupAnalyzer) return;

    const selectedEventId = getSelectedEventIdForBackupRestore();
    if (!selectedEventId) {
      toast.error("Selecione um evento antes de analisar o backup");
      return;
    }

    setIsRunningBackupAnalyzer(true);
    setLogsBackupAnalyzer([]);
    setSummaryBackupAnalyzer(null);
    setHasErrorBackupAnalyzer(false);
    const newLogs: string[] = [];

    await executeAnalyzeBackupRegistrationDependenciesScript(
      { eventId: selectedEventId },
      (message: string) => {
        newLogs.push(message);
        setLogsBackupAnalyzer([...newLogs]);
      },
      (data) => {
        setIsRunningBackupAnalyzer(false);
        if (data.success) {
          setSummaryBackupAnalyzer(data.summary ?? null);
          toast.success("Analyzer do backup concluído com sucesso!");
        } else {
          setHasErrorBackupAnalyzer(true);
          toast.error(data.message || "Erro ao executar analyzer do backup");
        }
      },
      (error: string) => {
        setIsRunningBackupAnalyzer(false);
        setHasErrorBackupAnalyzer(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsBackupAnalyzer([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogBackupAnalyzer = () => {
    if (!logsBackupAnalyzer.length) return;
    const logContent = logsBackupAnalyzer.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analyze-backup-registration-dependencies-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const handleExecuteNullKitAnalyzerScript = async () => {
    if (isRunningNullKitAnalyzer) return;
    setIsRunningNullKitAnalyzer(true);
    setLogsNullKitAnalyzer([]);
    setSummaryNullKitAnalyzer(null);
    setHasErrorNullKitAnalyzer(false);
    const newLogs: string[] = [];

    await executeAnalyzeNullKitCompatibilityScript(
      (message: string) => {
        newLogs.push(message);
        setLogsNullKitAnalyzer([...newLogs]);
      },
      (data) => {
        setIsRunningNullKitAnalyzer(false);
        if (data.success) {
          setSummaryNullKitAnalyzer(data.summary ?? null);
          toast.success("Análise kit NULL concluída com sucesso!");
        } else {
          setHasErrorNullKitAnalyzer(true);
          toast.error(data.message || "Erro ao executar análise kit NULL");
        }
      },
      (error: string) => {
        setIsRunningNullKitAnalyzer(false);
        setHasErrorNullKitAnalyzer(true);
        newLogs.push(`❌ Erro: ${error}`);
        setLogsNullKitAnalyzer([...newLogs]);
        toast.error(error);
      }
    );
  };

  const handleDownloadLogNullKitAnalyzer = () => {
    if (!logsNullKitAnalyzer.length) return;
    const logContent = logsNullKitAnalyzer.join('\n');
    const blob = new Blob([logContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analyze-null-kit-compatibility-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Log baixado com sucesso!");
  };

  const isAnyInvestigationRunning =
    isRunningIntegrity ||
    isRunningForensic ||
    isRunningRestoreBackup ||
    isRunningDeepForensic ||
    isRunningBackupAnalyzer ||
    isRunningNullKitAnalyzer ||
    loadingIntegrityEvents;


  const formatIntegrityEventLabel = (event: Event) => {
    const eventDate = event.event_date
      ? new Date(event.event_date).toLocaleDateString("pt-BR")
      : "sem data";
    const location = [event.city, event.state].filter(Boolean).join("/");
    return `${event.title} - ${eventDate}${location ? ` - ${location}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <InvitationBonusAuditPanel />

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

      <Card>
        <CardHeader>
          <CardTitle>Desabilitar notificações Asaas (clientes antigos)</CardTitle>
          <CardDescription>
            Envia para o Asaas o pedido de desativar notificações de faturas para todos os clientes
            já cadastrados na tabela asaas_customers. Cada cliente deixará de receber e-mails/SMS de
            cobrança gerados pelo gateway. O Cronoteam continua enviando as próprias notificações de inscrição/confirmação.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleExecuteAsaasScript}
              disabled={isRunningAsaas}
              className="flex items-center gap-2"
            >
              {isRunningAsaas ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Executar script Asaas
                </>
              )}
            </Button>
            {logsAsaas.length > 0 && (
              <Button
                onClick={handleDownloadLogAsaas}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Baixar log
              </Button>
            )}
          </div>
          {summaryAsaas && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-semibold">Script Asaas concluído com sucesso!</p>
                  <div className="text-sm space-y-1">
                    <p>✅ Clientes atualizados: {summaryAsaas.updated ?? 0}</p>
                    <p>❌ Erros: {summaryAsaas.errors ?? 0}</p>
                    <p>📦 Total processado: {summaryAsaas.total ?? 0}</p>
                    {logFileAsaas && (
                      <p className="text-muted-foreground mt-2">Log salvo no servidor: {logFileAsaas}</p>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {hasErrorAsaas && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar o script Asaas. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}
          {logsAsaas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Desabilitar notificações Asaas</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsAsaas.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefAsaas} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* OK Etapa 6: Atualizar taxa da plataforma em inscrições antigas */}
      <Card>
        <CardHeader>
          <CardTitle>Atualizar taxa da plataforma em inscrições antigas</CardTitle>
          <CardDescription>
            Preenche o campo &quot;taxa da plataforma (inscrição)&quot; em inscrições que ainda não têm esse valor.
            Usa a configuração atual de taxa para estimar o valor. Idempotente: pode ser executado mais de uma vez.
            Recomendado após ativar as novas regras de taxas (OK Etapa 1).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              onClick={handleExecuteBackfillScript}
              disabled={isRunningBackfill}
              className="flex items-center gap-2"
            >
              {isRunningBackfill ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Executar
                </>
              )}
            </Button>
            {logsBackfill.length > 0 && (
              <Button
                onClick={handleDownloadLogBackfill}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Baixar log
              </Button>
            )}
          </div>
          {summaryBackfill && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-1">
                  <p className="font-semibold">Backfill concluído com sucesso!</p>
                  <div className="text-sm space-y-1">
                    <p>✅ Inscrições atualizadas: {summaryBackfill.updated ?? 0}</p>
                    {logFileBackfill && (
                      <p className="text-muted-foreground mt-2">Log salvo no servidor: {logFileBackfill}</p>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
          {hasErrorBackfill && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar o backfill. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}
          {logsBackfill.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Backfill taxa da plataforma</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsBackfill.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefBackfill} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Investigar integridade de inscrições por evento</CardTitle>
          <CardDescription>
            Diagnóstico 100% read-only para encontrar inscrições ocultas ou inconsistentes após exclusão de kits.
            Selecione um evento na lista ou use o evento mais recente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select
              value={integrityEventId || LATEST_EVENT_VALUE}
              onValueChange={(value) => setIntegrityEventId(value === LATEST_EVENT_VALUE ? "" : value)}
              disabled={isAnyInvestigationRunning}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={loadingIntegrityEvents ? "Carregando eventos..." : "Selecione um evento"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={LATEST_EVENT_VALUE}>Evento mais recente</SelectItem>
                {integrityEvents.map((event) => (
                  <SelectItem key={event.id} value={event.id}>
                    {formatIntegrityEventLabel(event)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleExecuteIntegrityScript}
              disabled={isAnyInvestigationRunning}
              className="flex items-center gap-2 sm:w-auto"
            >
              {isRunningIntegrity ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Investigando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Executar diagnóstico
                </>
              )}
            </Button>
            <Button
              onClick={handleExecuteForensicScript}
              disabled={isAnyInvestigationRunning}
              variant="secondary"
              className="flex items-center gap-2 sm:w-auto"
            >
              {isRunningForensic ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Investigando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Investigação forense
                </>
              )}
            </Button>
            <Button
              onClick={handleExecuteDeepForensicScript}
              disabled={isAnyInvestigationRunning}
              variant="secondary"
              className="flex items-center gap-2 sm:w-auto"
            >
              {isRunningDeepForensic ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Investigando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Forense profunda
                </>
              )}
            </Button>
            <Button
              onClick={handleExecuteBackupAnalyzerScript}
              disabled={isAnyInvestigationRunning}
              variant="outline"
              className="flex items-center gap-2 sm:w-auto"
            >
              {isRunningBackupAnalyzer ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Analyzer backup
                </>
              )}
            </Button>
            <Button
              onClick={handleExecuteNullKitAnalyzerScript}
              disabled={isAnyInvestigationRunning}
              variant="outline"
              className="flex items-center gap-2 sm:w-auto"
            >
              {isRunningNullKitAnalyzer ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analisando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Validar kit NULL
                </>
              )}
            </Button>
            <Button
              onClick={() => runRestoreBackupScript(false)}
              disabled={isAnyInvestigationRunning}
              variant="outline"
              className="flex items-center gap-2 sm:w-auto"
            >
              {isRunningRestoreBackup ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Preview backup
                </>
              )}
            </Button>
            {summaryBackupAnalyzer && (
              <Button
                onClick={() => runRestoreBackupScript(true)}
                disabled={isAnyInvestigationRunning}
                variant="destructive"
                className="flex items-center gap-2 sm:w-auto"
              >
                Restaurar faltantes
              </Button>
            )}
            {logsIntegrity.length > 0 && (
              <Button
                onClick={handleDownloadLogIntegrity}
                variant="outline"
                className="flex items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Baixar log
              </Button>
            )}
            {logsForensic.length > 0 && (
              <Button
                onClick={handleDownloadLogForensic}
                variant="outline"
                className="flex items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Baixar log forense
              </Button>
            )}
            {logsDeepForensic.length > 0 && (
              <Button
                onClick={handleDownloadLogDeepForensic}
                variant="outline"
                className="flex items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Baixar log profundo
              </Button>
            )}
            {logsBackupAnalyzer.length > 0 && (
              <Button
                onClick={handleDownloadLogBackupAnalyzer}
                variant="outline"
                className="flex items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Baixar log analyzer
              </Button>
            )}
            {logsNullKitAnalyzer.length > 0 && (
              <Button
                onClick={handleDownloadLogNullKitAnalyzer}
                variant="outline"
                className="flex items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Baixar log kit NULL
              </Button>
            )}
            {logsRestoreBackup.length > 0 && (
              <Button
                onClick={handleDownloadLogRestoreBackup}
                variant="outline"
                className="flex items-center gap-2 sm:w-auto"
              >
                <Download className="h-4 w-4" />
                Baixar log backup
              </Button>
            )}
          </div>

          {summaryIntegrity && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">Diagnóstico concluído: {summaryIntegrity.status}</p>
                  <div className="text-sm space-y-1">
                    <p>Evento: {summaryIntegrity.event.name} ({summaryIntegrity.event.id})</p>
                    <p>Total: {summaryIntegrity.metrics.total}</p>
                    <p>Visíveis com INNER JOIN: {summaryIntegrity.metrics.visible}</p>
                    <p>Ocultas por kit inexistente: {summaryIntegrity.metrics.hidden}</p>
                    <p>Diferença total vs INNER JOIN: {summaryIntegrity.metrics.hidden_difference}</p>
                    <p>Sem kit: {summaryIntegrity.metrics.without_kit}</p>
                    <p>Kits soft deletados: {summaryIntegrity.metrics.kits_soft_deleted}</p>
                    <p>Inscrições com kit soft deletado: {summaryIntegrity.metrics.registrations_with_soft_deleted_kit ?? 0}</p>
                    <p className="text-muted-foreground">{summaryIntegrity.conclusion}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasErrorIntegrity && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar o diagnóstico. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}

          {summaryForensic && (
            <Alert variant={summaryForensic.anomaly_detected ? "destructive" : "default"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">
                    Investigação forense concluída: {summaryForensic.anomaly_detected ? "anomalia detectada" : "sem anomalia forte"}
                  </p>
                  <div className="text-sm space-y-1">
                    <p>Evento: {summaryForensic.event.name} ({summaryForensic.event.id})</p>
                    <p>Inscrições encontradas: {summaryForensic.registrations_found}</p>
                    <p>Possíveis soft-deleted: {summaryForensic.possible_soft_deleted}</p>
                    <p>Leader invitations: {summaryForensic.related_data.leader_invitations}</p>
                    <p>Transferências globais: {summaryForensic.related_data.transfers}</p>
                    <p>Sinais em auditoria/logs: {summaryForensic.related_data.audit_signals.reduce((sum, signal) => sum + signal.count, 0)}</p>
                    <p className="text-muted-foreground">{summaryForensic.conclusion}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasErrorForensic && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar a investigação forense. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}

          {summaryDeepForensic && (
            <Alert variant={summaryDeepForensic.probable_cause === "SEM_ANOMALIA_FORTE" ? "default" : "destructive"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">Forense profunda: {summaryDeepForensic.probable_cause}</p>
                  <div className="text-sm space-y-1">
                    <p>Evento: {summaryDeepForensic.event.name} ({summaryDeepForensic.event.id})</p>
                    <p>Tabelas relacionadas existentes: {summaryDeepForensic.findings.registrations.filter((item) => item.exists).length}</p>
                    <p>Registros órfãos: {summaryDeepForensic.findings.orphan_records.reduce((sum, item) => sum + item.orphan_count, 0)}</p>
                    <p>Triggers: {summaryDeepForensic.findings.triggers.length}</p>
                    <p>Foreign keys: {summaryDeepForensic.findings.foreign_keys.length}</p>
                    <p>Kits atuais: {summaryDeepForensic.findings.kits.current_total}</p>
                    <p>Kits ausentes vs backup: {summaryDeepForensic.findings.kits.backup_missing_in_current ?? 0}</p>
                    <p className="text-muted-foreground">{summaryDeepForensic.recovery_recommendation}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasErrorDeepForensic && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar a investigação forense profunda. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}

          {summaryBackupAnalyzer && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">Analyzer do backup concluído</p>
                  <div className="text-sm space-y-1">
                    <p>Evento: {summaryBackupAnalyzer.eventId}</p>
                    <p>Total no backup: {summaryBackupAnalyzer.totals.backup}</p>
                    <p>Total atual: {summaryBackupAnalyzer.totals.current}</p>
                    <p>Faltantes: {summaryBackupAnalyzer.totals.missing}</p>
                    <p>RESTORABLE_FULL: {summaryBackupAnalyzer.classification_counts.RESTORABLE_FULL}</p>
                    <p>RESTORABLE_WITH_NULL_KIT: {summaryBackupAnalyzer.classification_counts.RESTORABLE_WITH_NULL_KIT}</p>
                    <p>RESTORABLE_WITH_MISSING_CATEGORY: {summaryBackupAnalyzer.classification_counts.RESTORABLE_WITH_MISSING_CATEGORY}</p>
                    <p>RESTORABLE_WITH_MISSING_MODALITY: {summaryBackupAnalyzer.classification_counts.RESTORABLE_WITH_MISSING_MODALITY}</p>
                    <p>
                      RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES:{" "}
                      {summaryBackupAnalyzer.classification_counts.RESTORABLE_WITH_MULTIPLE_MISSING_DEPENDENCIES}
                    </p>
                    <p>ALREADY_EXISTS: {summaryBackupAnalyzer.classification_counts.ALREADY_EXISTS}</p>
                    <p className="text-muted-foreground">{summaryBackupAnalyzer.restore_plan.recommendation}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasErrorBackupAnalyzer && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar o analyzer do backup. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}

          {summaryNullKitAnalyzer && (
            <Alert variant={summaryNullKitAnalyzer.totals.ALTO > 0 ? "destructive" : "default"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">Compatibilidade kit_id NULL analisada</p>
                  <div className="text-sm space-y-1">
                    <p>Arquivos analisados: {summaryNullKitAnalyzer.scope.files_scanned}</p>
                    <p>ALTO: {summaryNullKitAnalyzer.totals.ALTO}</p>
                    <p>MÉDIO: {summaryNullKitAnalyzer.totals.MÉDIO}</p>
                    <p>BAIXO: {summaryNullKitAnalyzer.totals.BAIXO}</p>
                    <p>Áreas seguras: {summaryNullKitAnalyzer.safe_areas.join(", ") || "-"}</p>
                    <p>Áreas que precisam ajuste: {summaryNullKitAnalyzer.areas_needing_adjustment.join(", ") || "-"}</p>
                    <p className="text-muted-foreground">{summaryNullKitAnalyzer.recommendation.join(" ")}</p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasErrorNullKitAnalyzer && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao executar a análise de compatibilidade com kit NULL. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}

          {summaryRestoreBackup && (
            <Alert variant={summaryRestoreBackup.mode === "restore" ? "destructive" : "default"}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-semibold">
                    {summaryRestoreBackup.mode === "restore" ? "Restauração concluída" : "Preview do backup concluído"}
                  </p>
                  <div className="text-sm space-y-1">
                    <p>Evento: {summaryRestoreBackup.eventId}</p>
                    <p>Inscrições no backup: {summaryRestoreBackup.backup_found}</p>
                    <p>Inscrições atuais: {summaryRestoreBackup.current_found}</p>
                    <p>Faltantes por ID: {summaryRestoreBackup.missing_count}</p>
                    <p>Elegíveis: {summaryRestoreBackup.eligible_count}</p>
                    <p>Ignoradas: {summaryRestoreBackup.skipped_count}</p>
                    <p>RESTORABLE_WITH_NULL_KIT promovidas: {summaryRestoreBackup.null_kit_promoted_count}</p>
                    <p>Limite desta execução: {summaryRestoreBackup.requested_limit}</p>
                    <p>Restauradas: {summaryRestoreBackup.restored_count}</p>
                    <p>Restauradas com kit normal: {summaryRestoreBackup.restored_with_normal_kit}</p>
                    <p>Restauradas com kit NULL fallback: {summaryRestoreBackup.restored_with_null_kit}</p>
                    <p>kit_id NULL aplicado: {summaryRestoreBackup.kit_null_applied}</p>
                    <p>Ignoradas por dependência real: {summaryRestoreBackup.skipped_real_dependency_count}</p>
                    <p>Campos personalizados restaurados: {summaryRestoreBackup.custom_field_values_restored}</p>
                    <p>Falhas: {summaryRestoreBackup.failed_count}</p>
                    <p className="text-muted-foreground">
                      Segurança: sem overwrite, sem delete, batches com rollback e insert apenas de registros faltantes por ID.
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {hasErrorRestoreBackup && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Ocorreu um erro ao consultar/restaurar inscrições do backup. Verifique os logs abaixo.
              </AlertDescription>
            </Alert>
          )}

          {logsIntegrity.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Diagnóstico de integridade</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsIntegrity.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefIntegrity} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          {logsForensic.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Investigação forense</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsForensic.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefForensic} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          {logsDeepForensic.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Investigação forense profunda</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsDeepForensic.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefDeepForensic} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          {logsBackupAnalyzer.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Analyzer do backup</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsBackupAnalyzer.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefBackupAnalyzer} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          {logsNullKitAnalyzer.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Compatibilidade kit_id NULL</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsNullKitAnalyzer.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefNullKitAnalyzer} />
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
          {logsRestoreBackup.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Logs – Recuperação de inscrições do backup</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px] w-full rounded-md border p-4 bg-muted/50 font-mono text-sm">
                  <div>
                    {logsRestoreBackup.map((log, index) => (
                      <div key={index} className="mb-1 whitespace-pre-wrap">
                        {log}
                      </div>
                    ))}
                    <div ref={logsEndRefRestoreBackup} />
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
