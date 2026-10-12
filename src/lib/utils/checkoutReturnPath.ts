/** Somente a rota de compra pode substituir o destino padrão após autenticação. */
export function checkoutReturnPath(from:unknown):string|null {
  if(!from || typeof from!=='object' || !('pathname' in from)) return null;
  const path=from.pathname;
  if(typeof path!=='string' || !/^\/(evento|events)\/[^/\\?#]+\/inscricao$/.test(path)) return null;
  // Não aceitar escapes que transformem o identificador em outra rota/origem.
  try {
    const segment=decodeURIComponent(path.split('/')[2]);
    if(segment==='.' || segment==='..' || /[\\/?#\u0000-\u001f]/.test(segment)) return null;
  } catch {return null;}
  return path;
}
