import { query, getClient } from '../config/database.js';
import { EventStatus, EventRegistrationStatus, Event, CronogramaItem } from '../types/index.js';
import { generateSlug } from '../utils/slug.js';
import {
  getLiquidRegistrationValue,
  getPlatformFeeTotal,
  isLegacyWithoutFeeFields,
  getReportableRevenue,
  isTransferredOutShellRegistration,
  type FinancialRegistrationLike,
} from './financialReportingService.js';

/** Formato HH:mm para horário em cronograma_items */
const TIME_HHMM_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
const MAX_CRONOGRAMA_ITEMS = 50;
const verboseEventsLogs = process.env.LOG_EVENTS_VERBOSE === 'true' && process.env.NODE_ENV !== 'production';

export interface CronogramaItemInput {
  time: string;
  title: string;
  description?: string | null;
  display_order: number;
}

export interface CreateEventData {
  organizer_id: string;
  title: string;
  slug?: string; // Opcional - será gerado automaticamente se não fornecido
  description?: string;
  event_date: string;
  location: string;
  city: string;
  state: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: EventStatus;
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
  pix_enabled?: boolean;
  pix_disabled_at?: string | null;
  credit_card_enabled?: boolean;
  credit_card_disabled_at?: string | null;
  transfers_enabled?: boolean;
  /** YYYY-MM-DD ou null — sem limite de data para transferência pública. */
  transfer_until?: string | null;
  premiacao?: string | null;
  cronograma?: string | null;
}

export interface UpdateEventData {
  organizer_id?: string;
  title?: string;
  slug?: string; // Opcional - será gerado automaticamente se título mudar
  description?: string;
  event_date?: string;
  location?: string;
  city?: string;
  state?: string;
  banner_url?: string;
  regulation_url?: string;
  result_url?: string;
  status?: EventStatus;
  registration_status?: EventRegistrationStatus | null;
  registration_start_date?: string | null;
  registration_end_date?: string | null;
  registration_auto_mode?: boolean;
  pix_enabled?: boolean;
  pix_disabled_at?: string | null;
  credit_card_enabled?: boolean;
  credit_card_disabled_at?: string | null;
  transfers_enabled?: boolean;
  transfer_until?: string | null;
  premiacao?: string | null;
  cronograma?: string | null;
  cronograma_items?: CronogramaItemInput[];
}

/**
 * Verifica se uma string é um UUID válido
 * @param str - String a ser verificada
 * @returns true se for UUID, false caso contrário
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Verifica se um slug já existe no banco de dados
 * @param slug - Slug a ser verificado
 * @param excludeEventId - ID do evento a ser excluído da verificação (útil na atualização)
 * @returns true se o slug existe, false caso contrário
 */
async function slugExists(slug: string, excludeEventId?: string): Promise<boolean> {
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  if (!hasSlugColumn) {
    return false; // Se não tem coluna, slug não existe
  }
  
  let queryText = 'SELECT COUNT(*) as count FROM events WHERE slug = $1';
  const params: any[] = [slug];
  
  if (excludeEventId) {
    queryText += ' AND id != $2';
    params.push(excludeEventId);
  }
  
  const result = await query(queryText, params);
  return parseInt(result.rows[0].count) > 0;
}

/**
 * Garante que um slug seja único, adicionando sufixo numérico se necessário
 * @param baseSlug - Slug base a ser verificado
 * @param excludeEventId - ID do evento a ser excluído da verificação (útil na atualização)
 * @returns Slug único
 * 
 * Exemplo:
 * - Se "teste-inscricao-cancelada" existe, retorna "teste-inscricao-cancelada-1"
 * - Se "teste-inscricao-cancelada-1" também existe, retorna "teste-inscricao-cancelada-2"
 * - E assim por diante...
 */
async function ensureUniqueSlug(baseSlug: string, excludeEventId?: string): Promise<string> {
  // Verificar se o slug base já é único
  const exists = await slugExists(baseSlug, excludeEventId);
  
  if (!exists) {
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
    const candidateExists = await slugExists(candidateSlug, excludeEventId);
    
    if (!candidateExists) {
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
 * Calcula o status de inscrições baseado nas datas quando modo automático está ativado
 * @param event Evento com os campos de data e modo automático
 * @returns Status calculado ou null se não for possível calcular
 */
export function calculateRegistrationStatus(event: Partial<Event>): EventRegistrationStatus | null {
  // Se modo automático não está ativado ou datas não estão definidas, retorna null
  if (!event.registration_auto_mode || !event.registration_start_date || !event.registration_end_date) {
    return null;
  }

  const now = new Date();
  const startDate = new Date(event.registration_start_date);
  const endDate = new Date(event.registration_end_date);

  if (now < startDate) {
    return 'not_open';
  } else if (now >= startDate && now <= endDate) {
    return 'open';
  } else {
    return 'closed';
  }
}

/**
 * Status efetivo de inscrições (datas automáticas ou manual em registration_status).
 * Retorna null quando não há regra explícita (fluxo legado por event.status).
 */
export function getEffectiveRegistrationStatus(event: Event): EventRegistrationStatus | null {
  if (event.registration_auto_mode && event.registration_start_date && event.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: event.registration_auto_mode,
      registration_start_date: event.registration_start_date,
      registration_end_date: event.registration_end_date,
    });
    if (calculatedStatus) {
      return calculatedStatus;
    }
  }
  return event.registration_status || null;
}

// Cache para verificar se coluna slug existe (evita múltiplas queries)
let slugColumnExists: boolean | null = null;

/**
 * Verifica se a coluna slug existe na tabela events
 */
async function checkSlugColumnExists(): Promise<boolean> {
  if (slugColumnExists !== null) {
    return slugColumnExists;
  }
  
  try {
    const result = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'events' 
      AND column_name = 'slug'
    `);
    slugColumnExists = result.rows.length > 0;
    return slugColumnExists;
  } catch (error) {
    console.warn('⚠️ Erro ao verificar coluna slug:', error);
    slugColumnExists = false;
    return false;
  }
}

// Get all events (with filters and statistics)
export const getEvents = async (filters?: {
  status?: EventStatus;
  city?: string;
  state?: string;
  organizer_id?: string;
  search?: string;
  order_by_date?: 'asc' | 'desc'; // 'asc' = mais próximo primeiro, 'desc' = mais longe primeiro
}) => {
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  // Use a subquery approach to avoid GROUP BY issues
  let queryText = `
    SELECT 
      e.id,
      e.organizer_id,
      e.title,
      ${hasSlugColumn ? 'e.slug,' : 'NULL::text as slug,'}
      e.description,
      e.event_date,
      e.location,
      e.city,
      e.state,
      e.banner_url,
      e.regulation_url,
      e.result_url,
      e.status,
      e.registration_status,
      e.registration_start_date,
      e.registration_end_date,
      e.registration_auto_mode,
      e.pix_enabled,
      e.pix_disabled_at,
      e.credit_card_enabled,
      e.credit_card_disabled_at,
      e.transfers_enabled,
      e.transfer_until,
      e.created_at,
      e.updated_at,
      p.full_name as organizer_name,
      COALESCE(reg_stats.registration_count, 0) as registration_count,
      COALESCE(reg_stats.confirmed_registrations, 0) as confirmed_registrations,
      COALESCE(reg_stats.revenue, 0) as revenue,
      COALESCE(reg_stats.avg_ticket, 0) as avg_ticket,
      COALESCE(reg_stats.platform_fee_revenue, 0) as platform_fee_revenue
    FROM events e
    LEFT JOIN profiles p ON e.organizer_id = p.id
    LEFT JOIN (
      SELECT 
        event_id,
        COUNT(DISTINCT id) FILTER (
          WHERE NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)
        ) as registration_count,
        COUNT(DISTINCT CASE WHEN payment_status = 'paid'
          AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)
          THEN id END) as confirmed_registrations,
        COALESCE(SUM(
          CASE WHEN payment_status = 'paid'
            AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL) THEN
            CASE WHEN (COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0)) > 0
              THEN (total_amount - COALESCE(platform_fee_amount, 0) - COALESCE(registration_edit_fee_amount, 0))
              ELSE calculate_value_without_platform_fee(total_amount, get_platform_fee(), get_platform_fee_type())
            END
          ELSE 0 END
        ), 0) as revenue,
        COALESCE(AVG(
          CASE WHEN payment_status = 'paid'
            AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL) THEN
            CASE WHEN (COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0)) > 0
              THEN (total_amount - COALESCE(platform_fee_amount, 0) - COALESCE(registration_edit_fee_amount, 0))
              ELSE calculate_value_without_platform_fee(total_amount, get_platform_fee(), get_platform_fee_type())
            END
          END
        ), 0) as avg_ticket,
        COALESCE(SUM(
          CASE WHEN payment_status = 'paid'
            AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL) THEN
            CASE WHEN (COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0)) > 0
              THEN (COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0))
              ELSE (total_amount - calculate_value_without_platform_fee(total_amount, get_platform_fee(), get_platform_fee_type()))
            END
          ELSE 0 END
        ), 0) as platform_fee_revenue
      FROM registrations
      GROUP BY event_id
    ) reg_stats ON e.id = reg_stats.event_id
  `;
  const params: any[] = [];
  const conditions: string[] = [];

  if (filters?.status) {
    conditions.push(`e.status = $${params.length + 1}`);
    params.push(filters.status);
  }

  if (filters?.city) {
    conditions.push(`e.city ILIKE $${params.length + 1}`);
    params.push(`%${filters.city}%`);
  }

  if (filters?.state) {
    conditions.push(`e.state ILIKE $${params.length + 1}`);
    params.push(`%${filters.state}%`);
  }

  if (filters?.organizer_id) {
    conditions.push(`e.organizer_id = $${params.length + 1}`);
    params.push(filters.organizer_id);
  }

  if (filters?.search) {
    const searchTerm = `%${filters.search}%`;
    const searchParamIndex = params.length + 1;
    // Use the same parameter index for all ILIKE conditions (PostgreSQL allows this)
    conditions.push(`(
      COALESCE(e.title, '') ILIKE $${searchParamIndex} OR
      COALESCE(e.description, '') ILIKE $${searchParamIndex} OR
      COALESCE(p.full_name, '') ILIKE $${searchParamIndex} OR
      COALESCE(e.city, '') ILIKE $${searchParamIndex} OR
      COALESCE(e.state, '') ILIKE $${searchParamIndex}
    )`);
    params.push(searchTerm);
  }

  if (conditions.length > 0) {
    queryText += ' WHERE ' + conditions.join(' AND ');
  }

  // Order by event date (default: ASC - mais próximo primeiro)
  const orderBy = filters?.order_by_date === 'desc' ? 'DESC' : 'ASC';
  queryText += ` ORDER BY e.event_date ${orderBy}, e.created_at DESC`;

  if (verboseEventsLogs) {
    console.log('🔍 Executing query with filters:', JSON.stringify(filters, null, 2));
    console.log('🔍 Query text:', queryText);
    console.log('🔍 Query params:', params);
    console.log('🔍 Number of conditions:', conditions.length);
  }
  
  const result = await query(queryText, params);
  
  if (verboseEventsLogs) {
    console.log(`📊 getEvents query returned ${result.rows.length} events`);
    if (result.rows.length > 0) {
      console.log('📊 First event:', {
        id: result.rows[0].id,
        title: result.rows[0].title,
        status: result.rows[0].status,
      });
    } else if (filters?.search) {
      console.log('⚠️ No events found with search term:', filters.search);
    }
  }
  
  // Canonical revenue aggregation by event (backend source of truth).
  const revenueByEvent = new Map<string, { revenue: number; avg_ticket: number; platform_fee_revenue: number }>();
  const eventIds = result.rows.map((row: any) => row.id);
  if (eventIds.length > 0) {
    const { getSystemSettings } = await import('./systemSettingsService.js');
    const settings = await getSystemSettings();
    const fallback = {
      platformFee: settings.platform_fee || 0,
      platformFeeType: (settings.platform_fee_type || 'fixed') as 'fixed' | 'percentage',
      platformFeeMin: settings.platform_fee_min ?? 0,
    };

    const registrationsResult = await query(
      `SELECT event_id, status, transferred_to_registration_id, payment_status, payment_method, total_amount, platform_fee_amount, registration_edit_fee_amount
       FROM registrations
       WHERE event_id = ANY($1::uuid[])`,
      [eventIds]
    );

    const rowsByEvent = new Map<string, FinancialRegistrationLike[]>();
    for (const reg of registrationsResult.rows) {
      const rows = rowsByEvent.get(reg.event_id) || [];
      rows.push(reg);
      rowsByEvent.set(reg.event_id, rows);
    }

    for (const eventId of eventIds) {
      const rows = rowsByEvent.get(eventId) || [];
      const paidRows = rows.filter(
        (r) => r.payment_status === 'paid' && !isTransferredOutShellRegistration(r)
      );
      const revenue = getReportableRevenue(paidRows, fallback);
      const avg_ticket = paidRows.length > 0 ? Math.round((revenue / paidRows.length) * 100) / 100 : 0;

      let platform_fee_revenue = 0;
      for (const reg of paidRows) {
        if (isLegacyWithoutFeeFields(reg)) {
          const total = Number(reg.total_amount) || 0;
          const liquid = getLiquidRegistrationValue(reg, fallback);
          platform_fee_revenue += Math.max(0, total - liquid);
        } else {
          platform_fee_revenue += getPlatformFeeTotal(reg);
        }
      }
      platform_fee_revenue = Math.round(platform_fee_revenue * 100) / 100;

      revenueByEvent.set(eventId, { revenue, avg_ticket, platform_fee_revenue });
    }
  }

  // Import getFileUrl to convert file paths to URLs
  const { getFileUrl } = await import('../middleware/upload.js');
  
  return result.rows.map((row) => {
    // Calcular status de inscrições se modo automático estiver ativado
    let effectiveRegistrationStatus = row.registration_status;
    if (row.registration_auto_mode && row.registration_start_date && row.registration_end_date) {
      const calculatedStatus = calculateRegistrationStatus({
        registration_auto_mode: row.registration_auto_mode,
        registration_start_date: row.registration_start_date,
        registration_end_date: row.registration_end_date,
      });
      if (calculatedStatus) {
        effectiveRegistrationStatus = calculatedStatus;
      }
    }

    const canonical = revenueByEvent.get(row.id);
    return {
      ...row,
      banner_url: row.banner_url ? getFileUrl(row.banner_url) : null,
      regulation_url: row.regulation_url ? getFileUrl(row.regulation_url) : null,
      registration_status: effectiveRegistrationStatus,
      registration_count: parseInt(row.registration_count) || 0,
      confirmed_registrations: parseInt(row.confirmed_registrations) || 0,
      revenue: canonical ? canonical.revenue : parseFloat(row.revenue) || 0,
      avg_ticket: canonical ? canonical.avg_ticket : parseFloat(row.avg_ticket) || 0,
      platform_fee_revenue: canonical ? canonical.platform_fee_revenue : parseFloat(row.platform_fee_revenue) || 0,
    };
  });
};

// Get event by ID or slug
export const getEventById = async (eventIdOrSlug: string) => {
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  // Detectar se é UUID ou slug
  const isId = isUUID(eventIdOrSlug);
  
  // Se não tem coluna slug e não é UUID, retornar null
  if (!hasSlugColumn && !isId) {
    return null;
  }
  
  // Construir query baseada no tipo (UUID ou slug)
  const whereClause = isId ? 'e.id = $1' : (hasSlugColumn ? 'e.slug = $1' : 'e.id = $1');
  
  const result = await query(
    `SELECT 
      e.id,
      e.organizer_id,
      e.title,
      ${hasSlugColumn ? 'e.slug,' : 'NULL::text as slug,'}
      e.description,
      e.event_date,
      e.location,
      e.city,
      e.state,
      e.banner_url,
      e.regulation_url,
      e.result_url,
      e.status,
      e.registration_status,
      e.registration_start_date,
      e.registration_end_date,
      e.registration_auto_mode,
      e.pix_enabled,
      e.pix_disabled_at,
      e.credit_card_enabled,
      e.credit_card_disabled_at,
      e.transfers_enabled,
      e.transfer_until,
      e.created_at,
      e.updated_at,
      e.premiacao,
      e.cronograma,
      p.full_name as organizer_name,
      p.logo_url as organizer_logo_url,
      p.organization_name as organizer_organization_name,
      p.contact_email as organizer_contact_email,
      p.contact_phone as organizer_contact_phone,
      p.website_url as organizer_website_url,
      p.bio as organizer_bio
    FROM events e
    LEFT JOIN profiles p ON e.organizer_id = p.id
    WHERE ${whereClause}`,
    [eventIdOrSlug]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const eventId = row.id;

  // Query 2: cronograma_items do evento (uma única query, sem loop)
  const itemsResult = await query(
    `SELECT id, event_id, time, title, description, display_order
     FROM cronograma_items
     WHERE event_id = $1
     ORDER BY display_order ASC`,
    [eventId]
  );
  const cronograma_items: CronogramaItem[] = itemsResult.rows.map((r: any) => ({
    id: r.id,
    event_id: r.event_id,
    time: r.time,
    title: r.title,
    description: r.description ?? null,
    display_order: r.display_order,
  }));

  const { getFileUrl } = await import('../middleware/upload.js');

  let effectiveRegistrationStatus = row.registration_status;
  if (row.registration_auto_mode && row.registration_start_date && row.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: row.registration_auto_mode,
      registration_start_date: row.registration_start_date,
      registration_end_date: row.registration_end_date,
    });
    if (calculatedStatus) {
      effectiveRegistrationStatus = calculatedStatus;
    }
  }

  return {
    ...row,
    banner_url: row.banner_url ? getFileUrl(row.banner_url) : null,
    regulation_url: row.regulation_url ? getFileUrl(row.regulation_url) : null,
    registration_status: effectiveRegistrationStatus,
    cronograma_items,
  };
};

// Create event
export const createEvent = async (data: CreateEventData) => {
  console.log('🔧 createEvent called with:', data);
  
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  // Gerar slug automaticamente se não fornecido e coluna existe
  let slug = data.slug;
  if (hasSlugColumn) {
    if (!slug && data.title) {
      const baseSlug = generateSlug(data.title);
      slug = await ensureUniqueSlug(baseSlug);
    } else if (slug) {
      // Se slug foi fornecido, garantir que seja único
      slug = await ensureUniqueSlug(slug);
    }
  }
  
  // Se modo automático está ativado, calcular status automaticamente
  let registrationStatus = data.registration_status;
  if (data.registration_auto_mode && data.registration_start_date && data.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: data.registration_auto_mode,
      registration_start_date: data.registration_start_date ? new Date(data.registration_start_date) : null,
      registration_end_date: data.registration_end_date ? new Date(data.registration_end_date) : null,
    });
    if (calculatedStatus) {
      registrationStatus = calculatedStatus;
    }
  }
  
  const fields = [
    'organizer_id', 'title',
    ...(hasSlugColumn ? ['slug'] : []),
    'description', 'event_date', 'location', 
    'city', 'state', 'banner_url', 'regulation_url', 'result_url', 'status',
    'registration_status', 'registration_start_date', 'registration_end_date', 'registration_auto_mode',
    'pix_enabled', 'pix_disabled_at', 'credit_card_enabled', 'credit_card_disabled_at',
    'transfers_enabled',
    'transfer_until',
    'premiacao', 'cronograma',
  ];
  const values = [
    data.organizer_id,
    data.title,
    ...(hasSlugColumn ? [slug] : []),
    data.description || null,
    data.event_date,
    data.location,
    data.city,
    data.state,
    data.banner_url || null,
    data.regulation_url || null,
    data.result_url || null,
    data.status || 'draft',
    registrationStatus || null,
    data.registration_start_date || null,
    data.registration_end_date || null,
    data.registration_auto_mode || false,
    data.pix_enabled !== undefined ? data.pix_enabled : true,
    data.pix_disabled_at || null,
    data.credit_card_enabled !== undefined ? data.credit_card_enabled : true,
    data.credit_card_disabled_at || null,
    data.transfers_enabled !== undefined ? data.transfers_enabled : true,
    data.transfer_until ?? null,
    data.premiacao ?? null,
    data.cronograma ?? null,
  ];
  
  const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
  
  const result = await query(
    `INSERT INTO events (${fields.join(', ')})
    VALUES (${placeholders})
    RETURNING *`,
    values
  );

  console.log('✅ Event inserted, returned rows:', result.rows.length);
  
  if (result.rows.length === 0) {
    throw new Error('Failed to create event - no rows returned');
  }

  return result.rows[0];
};

/**
 * Substitui todos os itens de cronograma do evento (replace).
 * Normaliza display_order para 1..n e aplica trim em title.
 * Usa transação: DELETE + INSERTs.
 */
async function replaceCronogramaItems(eventId: string, items: CronogramaItemInput[]): Promise<void> {
  if (items.length > MAX_CRONOGRAMA_ITEMS) {
    throw new Error(`Máximo de ${MAX_CRONOGRAMA_ITEMS} itens de cronograma por evento`);
  }
  const normalized = items
    .map((item) => ({
      time: item.time.trim(),
      title: (item.title ?? '').trim(),
      description: item.description != null ? String(item.description).trim() : null,
      display_order: Number(item.display_order),
    }))
    .filter((item) => {
      if (!TIME_HHMM_REGEX.test(item.time)) {
        throw new Error(`Horário inválido: "${item.time}". Use formato HH:mm (ex.: 07:00).`);
      }
      if (!item.title || item.title.length > 120) {
        throw new Error('Título do item é obrigatório e deve ter no máximo 120 caracteres.');
      }
      if (!Number.isInteger(item.display_order) || item.display_order < 1) {
        throw new Error('display_order deve ser um inteiro >= 1.');
      }
      return true;
    })
    .sort((a, b) => a.display_order - b.display_order)
    .map((item, index) => ({ ...item, display_order: index + 1 }));

  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM cronograma_items WHERE event_id = $1', [eventId]);
    for (const item of normalized) {
      await client.query(
        `INSERT INTO cronograma_items (event_id, time, title, description, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventId, item.time, item.title, item.description, item.display_order]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Update event
export const updateEvent = async (eventId: string, data: UpdateEventData) => {
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  if (hasSlugColumn) {
    // Buscar evento atual para verificar se tem slug e comparar título
    const currentEvent = await getEventById(eventId);
    
    if (currentEvent) {
      // Se slug foi fornecido explicitamente, garantir que seja único
      if (data.slug) {
        data.slug = await ensureUniqueSlug(data.slug, eventId);
      } 
      // Se não tem slug fornecido, verificar se precisa gerar
      else if (!data.slug) {
        const needsSlug = !currentEvent.slug || currentEvent.slug.trim() === '';
        const titleChanged = data.title && currentEvent.title !== data.title;
        
        // Gerar slug se: evento não tem slug OU título mudou
        if (needsSlug || titleChanged) {
          const titleToUse = data.title || currentEvent.title;
          if (titleToUse) {
            const baseSlug = generateSlug(titleToUse);
            data.slug = await ensureUniqueSlug(baseSlug, eventId);
          }
        }
      }
    }
  } else if (!hasSlugColumn && data.slug) {
    // Se coluna não existe mas slug foi fornecido, remover do update
    delete data.slug;
  }
  
  // Se modo automático está ativado e datas foram fornecidas, calcular status automaticamente
  if (data.registration_auto_mode && data.registration_start_date && data.registration_end_date) {
    const calculatedStatus = calculateRegistrationStatus({
      registration_auto_mode: data.registration_auto_mode,
      registration_start_date: data.registration_start_date ? new Date(data.registration_start_date) : null,
      registration_end_date: data.registration_end_date ? new Date(data.registration_end_date) : null,
    });
    if (calculatedStatus) {
      data.registration_status = calculatedStatus;
    }
  }

  // Extrair cronograma_items para não ir no UPDATE events (não é coluna de events)
  const cronogramaItems = data.cronograma_items;
  delete data.cronograma_items;

  const fields: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  });

  if (fields.length > 0) {
    values.push(eventId);
    const result = await query(
      `UPDATE events 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      return null;
    }
  } else if (cronogramaItems === undefined || cronogramaItems === null) {
    throw new Error('No fields to update');
  }

  if (cronogramaItems !== undefined) {
    await replaceCronogramaItems(eventId, cronogramaItems);
  }

  return getEventById(eventId);
};

/**
 * Regenera o slug de um evento específico
 * Útil para eventos que não têm slug ou quando precisa atualizar manualmente
 * @param eventId - ID do evento
 * @returns Evento atualizado com novo slug
 */
export const regenerateEventSlug = async (eventId: string) => {
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  if (!hasSlugColumn) {
    throw new Error('Slug column does not exist in database');
  }
  
  // Buscar evento atual
  const currentEvent = await getEventById(eventId);
  
  if (!currentEvent) {
    throw new Error('Event not found');
  }
  
  if (!currentEvent.title) {
    throw new Error('Event title is required to generate slug');
  }
  
  // Gerar novo slug baseado no título atual
  const baseSlug = generateSlug(currentEvent.title);
  const newSlug = await ensureUniqueSlug(baseSlug, eventId);
  
  // Atualizar apenas o slug
  const result = await query(
    `UPDATE events 
     SET slug = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [newSlug, eventId]
  );
  
  if (result.rows.length === 0) {
    throw new Error('Failed to update event slug');
  }
  
  return result.rows[0];
};

/**
 * Regenera slugs para todos os eventos que não têm slug
 * @returns Número de eventos atualizados
 */
export const regenerateAllMissingSlugs = async (): Promise<number> => {
  // Verificar se coluna slug existe
  const hasSlugColumn = await checkSlugColumnExists();
  
  if (!hasSlugColumn) {
    throw new Error('Slug column does not exist in database');
  }
  
  // Buscar todos os eventos sem slug
  const eventsWithoutSlug = await query(
    `SELECT id, title FROM events 
     WHERE slug IS NULL OR slug = '' OR slug = 'null'`
  );
  
  let updated = 0;
  
  for (const event of eventsWithoutSlug.rows) {
    if (event.title) {
      try {
        const baseSlug = generateSlug(event.title);
        const newSlug = await ensureUniqueSlug(baseSlug, event.id);
        
        await query(
          `UPDATE events 
           SET slug = $1, updated_at = NOW()
           WHERE id = $2`,
          [newSlug, event.id]
        );
        
        updated++;
      } catch (error) {
        console.error(`Error generating slug for event ${event.id}:`, error);
      }
    }
  }
  
  return updated;
};

// Delete event
export const deleteEvent = async (eventId: string) => {
  const result = await query('DELETE FROM events WHERE id = $1 RETURNING id', [eventId]);
  return result.rows.length > 0;
};

// Check if user is organizer of event (accepts ID or slug)
export const isEventOrganizer = async (eventIdOrSlug: string, userId: string): Promise<boolean> => {
  // Detectar se é UUID ou slug
  const isId = isUUID(eventIdOrSlug);
  const whereClause = isId ? 'id = $1' : 'slug = $1';
  
  const result = await query(
    `SELECT organizer_id FROM events WHERE ${whereClause} AND organizer_id = $2`,
    [eventIdOrSlug, userId]
  );
  return result.rows.length > 0;
};

