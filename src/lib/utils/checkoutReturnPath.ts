/** Query permitida no retorno à compra (evita open-redirect / lixo na URL). */
const ALLOWED_QUERY = new Set(['cupom', 'ref', 'pedido', 'novo']);

function sanitizeCheckoutSearch(search: unknown): string {
  if (typeof search !== 'string' || !search) return '';
  const raw = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const safe = new URLSearchParams();
  for (const key of ALLOWED_QUERY) {
    const value = params.get(key)?.trim();
    if (!value) continue;
    if (/[\\/?#\u0000-\u001f]/.test(value)) continue;
    if (key === 'novo' && value !== '1') continue;
    safe.set(key, value);
  }
  const qs = safe.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Somente a rota de compra pode substituir o destino padrão após autenticação.
 * Aceita pathname (+ search opcional com cupom/ref/pedido/novo).
 */
export function checkoutReturnPath(from: unknown): string | null {
  if (!from || typeof from !== 'object' || !('pathname' in from)) return null;
  const path = (from as { pathname: unknown }).pathname;
  if (typeof path !== 'string' || !/^\/(evento|events)\/[^/\\?#]+\/inscricao$/.test(path)) return null;
  // Não aceitar escapes que transformem o identificador em outra rota/origem.
  try {
    const segment = decodeURIComponent(path.split('/')[2]);
    if (segment === '.' || segment === '..' || /[\\/?#\u0000-\u001f]/.test(segment)) return null;
  } catch {
    return null;
  }
  const search = sanitizeCheckoutSearch((from as { search?: unknown }).search);
  return `${path}${search}`;
}
