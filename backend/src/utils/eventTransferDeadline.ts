/** Fuso usado para comparar “dia civil” do prazo de transferência com o dia atual. */
const BRAZIL_TZ = 'America/Sao_Paulo';

function calendarDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Extrai YYYY-MM-DD de string DATE do Postgres ou ISO. */
function transferUntilToYmd(transferUntil: string | Date): string {
  if (typeof transferUntil === 'string') {
    return transferUntil.slice(0, 10);
  }
  return calendarDateInTimeZone(transferUntil, 'UTC');
}

/**
 * Prazo público de transferência encerrado (após o último dia permitido).
 * transfer_until null/undefined = sem limite.
 */
export function isPublicTransferDeadlinePassed(
  transferUntil: string | Date | null | undefined
): boolean {
  if (transferUntil == null || transferUntil === '') {
    return false;
  }
  const limitStr = transferUntilToYmd(transferUntil);
  const today = calendarDateInTimeZone(new Date(), BRAZIL_TZ);
  return today > limitStr;
}

/** Mensagem sugerida para bloqueio ao corredor após o prazo. */
export function formatTransferDeadlineClosedMessagePtBr(
  transferUntil: string | Date | null | undefined
): string {
  const limitStr = transferUntilToYmd(transferUntil as string | Date);
  const [y, m, d] = limitStr.split('-').map((x) => parseInt(x, 10));
  const dd = String(d).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const yyyy = String(y);
  return `As transferências deste evento estavam disponíveis até ${dd}/${mm}/${yyyy}.`;
}
