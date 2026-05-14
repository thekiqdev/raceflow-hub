const BRAZIL_TZ = 'America/Sao_Paulo';

function calendarDateInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function transferUntilToYmd(transferUntil: string | Date): string {
  if (typeof transferUntil === 'string') {
    return transferUntil.slice(0, 10);
  }
  return calendarDateInTimeZone(transferUntil, 'UTC');
}

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
