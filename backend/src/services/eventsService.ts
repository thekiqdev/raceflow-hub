import { query } from '../config/database.js';
import { EventStatus, EventRegistrationStatus, Event } from '../types/index.js';
import { generateSlug } from '../utils/slug.js';

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
        COUNT(DISTINCT id) as registration_count,
        COUNT(DISTINCT CASE WHEN payment_status = 'paid' THEN id END) as confirmed_registrations,
        COALESCE(SUM(
          CASE WHEN payment_status = 'paid' THEN
            calculate_value_without_platform_fee(
              total_amount,
              get_platform_fee(),
              get_platform_fee_type()
            )
          ELSE 0 END
        ), 0) as revenue,
        COALESCE(AVG(
          CASE WHEN payment_status = 'paid' THEN
            calculate_value_without_platform_fee(
              total_amount,
              get_platform_fee(),
              get_platform_fee_type()
            )
          END
        ), 0) as avg_ticket,
        COALESCE(SUM(
          CASE WHEN payment_status = 'paid' THEN
            total_amount - calculate_value_without_platform_fee(
              total_amount,
              get_platform_fee(),
              get_platform_fee_type()
            )
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

  console.log('🔍 Executing query with filters:', JSON.stringify(filters, null, 2));
  console.log('🔍 Query text:', queryText);
  console.log('🔍 Query params:', params);
  console.log('🔍 Number of conditions:', conditions.length);
  
  const result = await query(queryText, params);
  
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

    return {
      ...row,
      banner_url: row.banner_url ? getFileUrl(row.banner_url) : null,
      regulation_url: row.regulation_url ? getFileUrl(row.regulation_url) : null,
      registration_status: effectiveRegistrationStatus,
      registration_count: parseInt(row.registration_count) || 0,
      confirmed_registrations: parseInt(row.confirmed_registrations) || 0,
      revenue: parseFloat(row.revenue) || 0,
      avg_ticket: parseFloat(row.avg_ticket) || 0,
      platform_fee_revenue: parseFloat(row.platform_fee_revenue) || 0,
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
      e.created_at,
      e.updated_at,
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

  // Import getFileUrl to convert file paths to URLs
  const { getFileUrl } = await import('../middleware/upload.js');
  
  const row = result.rows[0];
  
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

  return {
    ...row,
    banner_url: row.banner_url ? getFileUrl(row.banner_url) : null,
    regulation_url: row.regulation_url ? getFileUrl(row.regulation_url) : null,
    registration_status: effectiveRegistrationStatus,
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
  
  // Construir query dinamicamente baseado na existência da coluna slug
  const fields = [
    'organizer_id', 'title',
    ...(hasSlugColumn ? ['slug'] : []),
    'description', 'event_date', 'location', 
    'city', 'state', 'banner_url', 'regulation_url', 'result_url', 'status',
    'registration_status', 'registration_start_date', 'registration_end_date', 'registration_auto_mode',
    'pix_enabled', 'pix_disabled_at', 'credit_card_enabled', 'credit_card_disabled_at',
    'transfers_enabled'
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

  if (fields.length === 0) {
    throw new Error('No fields to update');
  }

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

  return result.rows[0];
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

