export function toDatetimeLocalValue(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToIso(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export type ExternalUrlValidationState = "empty" | "valid" | "invalid";

export function getExternalUrlValidationState(url: string): ExternalUrlValidationState {
  const trimmed = url.trim();
  if (!trimmed) return "empty";
  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol.startsWith("http")) return "invalid";
    return "valid";
  } catch {
    return "invalid";
  }
}
