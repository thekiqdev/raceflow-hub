/**
 * Gera um slug a partir de uma string (título, nome, etc.)
 * 
 * @param text - Texto a ser convertido em slug
 * @returns Slug normalizado (minúsculas, sem acentos, espaços substituídos por hífens)
 * 
 * @example
 * generateSlug("Corrida de Rua Fortaleza 2024") // "corrida-de-rua-fortaleza-2024"
 * generateSlug("Maratona São Paulo!") // "maratona-sao-paulo"
 * generateSlug("Evento com @#$ Caracteres Especiais") // "evento-com-caracteres-especiais"
 */
export function generateSlug(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string');
  }

  // Normalizar e remover acentos
  let slug = text
    .normalize('NFD') // Decompõe caracteres acentuados
    .replace(/[\u0300-\u036f]/g, '') // Remove diacríticos (acentos)
    .toLowerCase() // Converte para minúsculas
    .trim(); // Remove espaços no início e fim

  // Substituir espaços e caracteres especiais por hífens
  slug = slug
    .replace(/[\s_]+/g, '-') // Espaços e underscores viram hífens
    .replace(/[^\w\-]+/g, '') // Remove caracteres que não são letras, números ou hífens
    .replace(/\-\-+/g, '-') // Remove múltiplos hífens consecutivos
    .replace(/^-+/, '') // Remove hífens no início
    .replace(/-+$/, ''); // Remove hífens no fim

  // Se o slug ficar vazio após processamento, gerar um slug padrão
  if (!slug) {
    slug = 'evento';
  }

  // Limitar tamanho do slug (máximo 100 caracteres para URLs amigáveis)
  if (slug.length > 100) {
    slug = slug.substring(0, 100);
    // Remover hífen no final se houver
    slug = slug.replace(/-+$/, '');
  }

  return slug;
}

/**
 * Garante que um slug seja único adicionando um sufixo numérico se necessário
 * 
 * @param baseSlug - Slug base a ser verificado
 * @param checkUniqueness - Função que verifica se o slug já existe no banco
 * @param excludeEventId - ID do evento a ser excluído da verificação (útil na atualização)
 * @returns Slug único (pode ser o original ou com sufixo numérico)
 * 
 * @example
 * // Se "corrida-2024" já existe:
 * ensureUniqueSlug("corrida-2024", checkFn) // "corrida-2024-1"
 * // Se "corrida-2024-1" também existe:
 * ensureUniqueSlug("corrida-2024", checkFn) // "corrida-2024-2"
 */
export async function ensureUniqueSlug(
  baseSlug: string,
  checkUniqueness: (slug: string, excludeEventId?: string) => Promise<boolean>,
  excludeEventId?: string
): Promise<string> {
  // Verificar se o slug base já é único
  const isUnique = await checkUniqueness(baseSlug, excludeEventId);
  
  if (isUnique) {
    return baseSlug;
  }

  // Tentar adicionar sufixos numéricos até encontrar um único
  // Começa com 1 (não 2) para seguir o padrão: -1, -2, -3, etc.
  let counter = 1;
  let candidateSlug = `${baseSlug}-${counter}`;
  
  // Limitar tentativas para evitar loop infinito
  const maxAttempts = 1000;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const isCandidateUnique = await checkUniqueness(candidateSlug, excludeEventId);
    
    if (isCandidateUnique) {
      return candidateSlug;
    }

    counter++;
    candidateSlug = `${baseSlug}-${counter}`;
    attempts++;
  }

  // Se não encontrou um slug único após muitas tentativas, adicionar timestamp
  const timestamp = Date.now();
  return `${baseSlug}-${timestamp}`;
}

/**
 * Valida se uma string é um slug válido
 * 
 * @param slug - String a ser validada
 * @returns true se o slug é válido, false caso contrário
 * 
 * @example
 * isValidSlug("corrida-2024") // true
 * isValidSlug("corrida_2024") // false (contém underscore)
 * isValidSlug("Corrida 2024") // false (contém espaço e maiúscula)
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || typeof slug !== 'string') {
    return false;
  }

  // Slug deve conter apenas letras minúsculas, números e hífens
  // Não pode começar ou terminar com hífen
  // Não pode ter hífens consecutivos
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 100;
}
