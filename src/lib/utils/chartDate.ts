import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

function parseDayValue(day: string): Date | null {
  if (!day) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const parsed = parseISO(day);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatChartDayLabel(day: string, pattern = "dd/MM"): string {
  const parsed = parseDayValue(day);
  if (!parsed) return day || "—";
  return format(parsed, pattern, { locale: ptBR });
}
